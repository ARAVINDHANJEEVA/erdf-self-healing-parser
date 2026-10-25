import { describe, it, expect } from 'vitest';
import {
  findCoveringAstNode,
  getAstNodeAncestors,
  formatAstNodeSummary,
  getTokenColorClass,
  categorizeToken,
  getCursorCoordinates,
  calculateLineOffsets,
  buildLineSegments,
  getCharacterLimitStatus,
  isOffsetInSpan,
} from '../../src/ui/utils/editorUtils';
import { parseWithErdf } from '../../src/erdf/instrumentedParser';
import { tokenize } from '../../src/language/lexer';
import { useReplayStore } from '../../src/state/replayStore';
import { Diagnostic } from '../../src/language/types';

describe('Editor Improvements Suite', () => {
  describe('1. Syntax Highlighting & Token Categorization', () => {
    it('correctly categorizes keywords, types, literals, and comments', () => {
      expect(categorizeToken('INT')).toBe('type');
      expect(categorizeToken('FLOAT')).toBe('type');
      expect(categorizeToken('VOID')).toBe('type');
      expect(categorizeToken('RETURN')).toBe('keyword');
      expect(categorizeToken('IF')).toBe('keyword');
      expect(categorizeToken('FOR')).toBe('keyword');
      expect(categorizeToken('NUMBER')).toBe('number');
      expect(categorizeToken('STRING')).toBe('string');
      expect(categorizeToken('CHAR_LITERAL')).toBe('string');
      expect(categorizeToken('TRUE')).toBe('boolean');
      expect(categorizeToken('PREPROCESSOR')).toBe('preprocessor');
      expect(categorizeToken('PLUS')).toBe('operator');
      expect(categorizeToken('SEMICOLON')).toBe('delimiter');
      expect(categorizeToken('IDENT')).toBe('identifier');
      expect(categorizeToken('COMMENT')).toBe('comment');
      expect(categorizeToken('ERROR')).toBe('error');
    });

    it('correctly categorizes unary and special operators', () => {
      expect(categorizeToken('BANG')).toBe('operator');
      expect(categorizeToken('TILDE')).toBe('operator');
      expect(categorizeToken('PLUS_PLUS')).toBe('operator');
      expect(categorizeToken('MINUS_MINUS')).toBe('operator');
      expect(categorizeToken('ARROW')).toBe('operator');
      expect(categorizeToken('DOT')).toBe('operator');
      expect(categorizeToken('QUESTION')).toBe('operator');
    });

    it('assigns distinctive Tailwind color classes for each token category', () => {
      expect(getTokenColorClass('INT')).toContain('text-cyan-400');
      expect(getTokenColorClass('RETURN')).toContain('text-purple-400');
      expect(getTokenColorClass('NUMBER')).toContain('text-amber-400');
      expect(getTokenColorClass('STRING')).toContain('text-emerald-400');
      expect(getTokenColorClass('PREPROCESSOR')).toContain('text-indigo-400');
      expect(getTokenColorClass('PLUS')).toContain('text-sky-400');
      expect(getTokenColorClass('BANG')).toContain('text-sky-400');
      expect(getTokenColorClass('PLUS_PLUS')).toContain('text-sky-400');
      expect(getTokenColorClass('SEMICOLON')).toContain('text-slate-400');
      expect(getTokenColorClass('COMMENT')).toContain('text-slate-500');
      expect(getTokenColorClass('ERROR')).toContain('text-rose-400');
    });

    it('builds line segments maintaining exact line text and ordering', () => {
      const source = 'int x = 42;';
      const { tokens, comments, diagnostics } = tokenize(source);
      const segments = buildLineSegments(0, source, 0, tokens, comments, diagnostics);

      // Reconstructed text must match original source exactly
      const reconstructed = segments.map((s) => s.text).join('');
      expect(reconstructed).toBe(source);

      // Verify token kinds are preserved
      const intSeg = segments.find((s) => s.text === 'int');
      expect(intSeg?.kind).toBe('INT');

      const numSeg = segments.find((s) => s.text === '42');
      expect(numSeg?.kind).toBe('NUMBER');

      const semiSeg = segments.find((s) => s.text === ';');
      expect(semiSeg?.kind).toBe('SEMICOLON');
    });
  });

  describe('2. Inline Error Squiggles', () => {
    it('accurately attaches error squiggles to diagnostic character spans', () => {
      const source = 'int x = (10 + 20;'; // missing ')'
      const { diagnostics } = parseWithErdf(source);

      expect(diagnostics.length).toBeGreaterThan(0);
      const { tokens, comments } = tokenize(source);

      const segments = buildLineSegments(0, source, 0, tokens, comments, diagnostics);

      // At least one segment must have isSquiggle = true with attached diagnostic
      const squigglySegments = segments.filter((s) => s.isSquiggle && s.diagnostic);
      expect(squigglySegments.length).toBeGreaterThan(0);

      const firstSquiggle = squigglySegments[0];
      expect(firstSquiggle.diagnostic).toBeDefined();
      expect(firstSquiggle.diagnostic?.severity).toMatch(/error|warning/);
    });

    it('handles diagnostics on empty lines or 0-width spans', () => {
      const diag: Diagnostic = {
        id: 'diag-empty-1',
        severity: 'error',
        message: 'Expected declaration',
        span: { start: 10, end: 10, line: 2, column: 1 },
        code: 'PARSER_SYNTAX_ERROR',
      };

      const segments = buildLineSegments(1, '', 10, [], [], [diag]);
      expect(segments).toHaveLength(1);
      expect(segments[0].isSquiggle).toBe(true);
      expect(segments[0].text).toBe('\u00A0');
      expect(segments[0].diagnostic?.id).toBe('diag-empty-1');
    });

    it('underlines single-character and zero-width diagnostics with exact 1-character length', () => {
      const diag1Char: Diagnostic = {
        id: 'diag-single-1',
        severity: 'error',
        message: 'Unexpected token',
        span: { start: 4, end: 5, line: 1, column: 5 },
        code: 'PARSER_SYNTAX_ERROR',
      };
      // Source: "int a = 1;" -> character at index 4 is 'a'
      const segments = buildLineSegments(0, 'int a = 1;', 0, [], [], [diag1Char]);
      const squiggles = segments.filter((s) => s.isSquiggle);
      expect(squiggles).toHaveLength(1);
      expect(squiggles[0].text).toBe('a');
      expect(squiggles[0].endOffset - squiggles[0].startOffset).toBe(1);

      // Zero-width diagnostic at index 4
      const diag0Char: Diagnostic = {
        id: 'diag-zero-1',
        severity: 'error',
        message: 'Missing identifier',
        span: { start: 4, end: 4, line: 1, column: 5 },
        code: 'PARSER_SYNTAX_ERROR',
      };
      const segments0 = buildLineSegments(0, 'int a = 1;', 0, [], [], [diag0Char]);
      const squiggles0 = segments0.filter((s) => s.isSquiggle);
      expect(squiggles0).toHaveLength(1);
      expect(squiggles0[0].text).toBe('a');
      expect(squiggles0[0].endOffset - squiggles0[0].startOffset).toBe(1);
    });

    it('handles error-free lines without generating false squiggles', () => {
      const source = 'return 0;';
      const { tokens, comments } = tokenize(source);
      const segments = buildLineSegments(0, source, 0, tokens, comments, []);

      expect(segments.every((s) => !s.isSquiggle)).toBe(true);
    });
  });

  describe('3. Real-time Cursor Position Indicator', () => {
    it('calculates 1-based line and column correctly across multi-line source', () => {
      const code = 'int a = 1;\nint b = 2;\nreturn a + b;';

      // Start of file (offset 0)
      expect(getCursorCoordinates(code, 0)).toEqual({ line: 1, column: 1 });

      // Inside line 1 at 'a' (offset 4)
      expect(getCursorCoordinates(code, 4)).toEqual({ line: 1, column: 5 });

      // Line 2 at start 'int b' (offset 11)
      expect(getCursorCoordinates(code, 11)).toEqual({ line: 2, column: 1 });

      // Line 3 at 'return' (offset 22)
      expect(getCursorCoordinates(code, 22)).toEqual({ line: 3, column: 1 });

      // End of line 3 (offset 35)
      expect(getCursorCoordinates(code, 35)).toEqual({ line: 3, column: 14 });
    });

    it('handles negative or beyond-bounds offsets gracefully', () => {
      const code = 'abc';
      expect(getCursorCoordinates(code, -5)).toEqual({ line: 1, column: 1 });
      expect(getCursorCoordinates(code, 100)).toEqual({ line: 1, column: 4 });
    });

    it('computes line start offsets correctly for both LF and CRLF', () => {
      const codeLF = 'hello\nworld\nfoo';
      const offsetsLF = calculateLineOffsets(codeLF);
      expect(offsetsLF).toEqual([0, 6, 12]);

      const codeCRLF = 'hello\r\nworld\r\nfoo';
      const offsetsCRLF = calculateLineOffsets(codeCRLF);
      expect(offsetsCRLF).toEqual([0, 7, 14]);
    });
  });

  describe('4. Source Range Hover & AST Node Lookup', () => {
    it('locates the innermost AST node covering a character offset', () => {
      const source = `int main() {\n  int total = 100;\n  return total;\n}`;
      const { ast } = parseWithErdf(source);

      // Offset inside 'main' (col 5..9 of line 1)
      const mainOffset = source.indexOf('main');
      const mainNode = findCoveringAstNode(ast, mainOffset);
      expect(mainNode).toBeDefined();
      expect(mainNode?.kind).toBe('IdentifierNode');
      expect((mainNode as any).name).toBe('main');

      // Offset inside '100'
      const numOffset = source.indexOf('100');
      const numNode = findCoveringAstNode(ast, numOffset);
      expect(numNode).toBeDefined();
      expect(numNode?.kind).toBe('LiteralNode');
      expect((numNode as any).value).toBe(100);

      // Offset inside 'return'
      const returnOffset = source.indexOf('return');
      const returnNode = findCoveringAstNode(ast, returnOffset);
      expect(returnNode).toBeDefined();
      expect(returnNode?.kind).toBe('ReturnStatement');
    });

    it('enforces exclusive span boundaries so semicolons do not match preceding literals', () => {
      const source = 'return 42;';
      const { ast } = parseWithErdf(source);

      // Semicolon is at offset 9
      const semiOffset = source.indexOf(';');
      expect(semiOffset).toBe(9);

      const nodeAtSemi = findCoveringAstNode(ast, semiOffset);
      expect(nodeAtSemi).toBeDefined();
      // Must NOT be LiteralNode (which spans [7, 9) exclusively)
      expect(nodeAtSemi?.kind).toBe('ReturnStatement');

      // Offset 7 and 8 ('4' and '2') must be LiteralNode
      expect(findCoveringAstNode(ast, 7)?.kind).toBe('LiteralNode');
      expect(findCoveringAstNode(ast, 8)?.kind).toBe('LiteralNode');
    });

    it('formats CallExpression summary with function callee name', () => {
      const source = 'int main() {\n  printf("hi");\n}';
      const { ast } = parseWithErdf(source);

      const printfOffset = source.indexOf('printf');
      // At '(' (offset + 6), the innermost covering node is CallExpression itself
      const callNode = findCoveringAstNode(ast, printfOffset + 6);
      expect(callNode?.kind).toBe('CallExpression');
      const summary = formatAstNodeSummary(callNode!);
      expect(summary.label).toBe('printf()');
      expect(summary.details).toContain('Function invocation (1 argument)');
    });

    it('tests isOffsetInSpan correctly for point and range spans', () => {
      expect(isOffsetInSpan({ start: 2, end: 5, line: 1, column: 3 }, 2)).toBe(true);
      expect(isOffsetInSpan({ start: 2, end: 5, line: 1, column: 3 }, 4)).toBe(true);
      expect(isOffsetInSpan({ start: 2, end: 5, line: 1, column: 3 }, 5)).toBe(false); // exclusive!
      expect(isOffsetInSpan({ start: 3, end: 3, line: 1, column: 4 }, 3)).toBe(true); // zero-width
      expect(isOffsetInSpan({ start: 3, end: 3, line: 1, column: 4 }, 4)).toBe(false);
    });

    it('returns ancestor path from root to innermost node', () => {
      const source = `int main() {\n  return 42;\n}`;
      const { ast } = parseWithErdf(source);

      const offset42 = source.indexOf('42');
      const ancestors = getAstNodeAncestors(ast, offset42);

      expect(ancestors.length).toBeGreaterThanOrEqual(3);
      expect(ancestors[0].kind).toBe('Program');
      expect(ancestors[ancestors.length - 1].kind).toBe('LiteralNode');
    });

    it('formats user-friendly AST node summaries for hover tooltips', () => {
      const source = `int count = 5;`;
      const { ast } = parseWithErdf(source);

      const summary = formatAstNodeSummary(ast.body[0]);
      expect(summary.kind).toBe('VariableDeclaration');
      expect(summary.label).toContain('int count');
      expect(summary.details).toContain('Variable declaration');
      expect(summary.spanText).toContain('Ln 1');
      expect(summary.provenance).toBe('source');
    });

    it('handles out-of-range or null AST safely', () => {
      expect(findCoveringAstNode(null, 10)).toBeNull();
      expect(getAstNodeAncestors(null, 10)).toEqual([]);

      const source = `int x = 1;`;
      const { ast } = parseWithErdf(source);
      expect(findCoveringAstNode(ast, 9999)).toBeNull();
    });
  });

  describe('5. Character Limit Warning System', () => {
    it('reports normal status below 60% capacity', () => {
      const status = getCharacterLimitStatus(20_000, 100_000);
      expect(status.level).toBe('normal');
      expect(status.isWarning).toBe(false);
      expect(status.pct).toBe(20);
      expect(status.remaining).toBe(80_000);
      expect(status.badgeText).toContain('20,000 / 100k');
      expect(status.barColorClass).toBe('bg-emerald-500');
    });

    it('triggers warning status at or above 80% capacity', () => {
      const status = getCharacterLimitStatus(85_000, 100_000);
      expect(status.level).toBe('warning');
      expect(status.isWarning).toBe(true);
      expect(status.pct).toBe(85);
      expect(status.remaining).toBe(15_000);
      expect(status.badgeText).toContain('Approaching limit (85%)');
      expect(status.barColorClass).toBe('bg-amber-400');
    });

    it('triggers critical status at 95% capacity', () => {
      const status = getCharacterLimitStatus(96_000, 100_000);
      expect(status.level).toBe('critical');
      expect(status.isWarning).toBe(true);
      expect(status.pct).toBe(96);
      expect(status.remaining).toBe(4_000);
      expect(status.badgeText).toBe('4,000 chars left');
      expect(status.barColorClass).toContain('bg-rose-500');
    });

    it('reports exceeded status when capacity reaches or exceeds 100,000', () => {
      const status = getCharacterLimitStatus(100_000, 100_000);
      expect(status.level).toBe('exceeded');
      expect(status.isWarning).toBe(true);
      expect(status.remaining).toBe(0);
      expect(status.badgeText).toContain('Limit Reached');
    });
  });

  describe('6. Editor Input State & Store Synchronization', () => {
    it('allows arbitrary user modifications and updates store via setSourceCode', () => {
      const store = useReplayStore.getState();

      const customUserCode = 'int myCustomCode() {\n  return 42;\n}';
      store.setSourceCode(customUserCode);

      expect(useReplayStore.getState().sourceCode).toBe(customUserCode);
      expect(useReplayStore.getState().parseResult?.ast).toBeDefined();
      expect(useReplayStore.getState().parseResult?.ast.body.length).toBeGreaterThan(0);
    });
  });
});
