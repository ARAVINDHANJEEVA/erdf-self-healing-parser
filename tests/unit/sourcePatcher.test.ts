import { describe, it, expect } from 'vitest';
import {
  applyCandidateToSource,
  applyMultipleCandidatesToSource,
  getLexemeForKind,
} from '../../src/ui/utils/sourcePatcher';
import { tokenize, createSyntheticToken } from '../../src/language/lexer';
import { RepairCandidate } from '../../src/language/types';
import { parseWithBaselineRecovery } from '../../src/parser/recoveringParser';
import { parseClean } from '../../src/parser/parser';

describe('Smart Source Code Patcher (sourcePatcher)', () => {
  it('correctly maps token kinds to lexemes', () => {
    expect(getLexemeForKind('SEMICOLON')).toBe(';');
    expect(getLexemeForKind('RPAREN')).toBe(')');
    expect(getLexemeForKind('LBRACE')).toBe('{');
    expect(getLexemeForKind('RBRACE')).toBe('}');
  });

  it('applies single insert candidate to source code', () => {
    const source = 'int main() {\n  return 0\n}';
    const { tokens } = tokenize(source);

    // Synthetic semicolon before } on line 3 (index of } in tokens)
    const rbraceTok = tokens.find((t) => t.kind === 'RBRACE')!;
    const rbraceIndex = tokens.indexOf(rbraceTok);

    const synthSemi = createSyntheticToken(
      'SEMICOLON',
      ';',
      rbraceTok.span,
      'Insert ;',
      1
    );

    const cand: RepairCandidate = {
      id: 'cand-insert-1',
      strategy: 'minimum-cost',
      edits: [{ action: 'insert', position: rbraceIndex, token: synthSemi }],
      expected: ['SEMICOLON'],
      cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1 },
      validation: { window: 4, sourceTokensProgressed: 2, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ['Insert missing semicolon'],
    };

    const patched = applyCandidateToSource(source, cand, tokens);
    // Should be smart-anchored directly after 0: "return 0;\n}"
    expect(patched).toBe('int main() {\n  return 0;\n}');

    // Patched code should parse cleanly without errors
    const reTokens = tokenize(patched).tokens;
    const cleanResult = parseClean(reTokens);
    expect(cleanResult.diagnostics).toHaveLength(0);
  });

  it('applies delete edit candidate to source code', () => {
    const source = 'int x = 10;;';
    const { tokens } = tokenize(source);

    // Find the second consecutive semicolon
    const secondSemi = tokens[tokens.length - 2]; // before EOF
    const cand: RepairCandidate = {
      id: 'cand-del-1',
      strategy: 'minimum-cost',
      edits: [
        {
          action: 'delete',
          position: tokens.length - 2,
          deletedToken: secondSemi,
        },
      ],
      expected: ['EOF'],
      cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1 },
      validation: { window: 4, sourceTokensProgressed: 1, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ['Delete extra semicolon'],
    };

    const patched = applyCandidateToSource(source, cand, tokens);
    expect(patched).toBe('int x = 10;');
  });

  it('applies substitute edit candidate to source code', () => {
    const source = 'int x = 10,';
    const { tokens } = tokenize(source);

    const commaTok = tokens.find((t) => t.kind === 'COMMA')!;
    const commaIndex = tokens.indexOf(commaTok);
    const synthSemi = createSyntheticToken('SEMICOLON', ';', commaTok.span, 'Substitute', 2);

    const cand: RepairCandidate = {
      id: 'cand-sub-1',
      strategy: 'minimum-cost',
      edits: [
        {
          action: 'substitute',
          position: commaIndex,
          deletedToken: commaTok,
          token: synthSemi,
        },
      ],
      expected: ['SEMICOLON'],
      cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1 },
      validation: { window: 4, sourceTokensProgressed: 1, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ['Substitute comma with semicolon'],
    };

    const patched = applyCandidateToSource(source, cand, tokens);
    expect(patched).toBe('int x = 10;');
  });

  it('applies 2-edit combination (insert ) and insert ;) cleanly', () => {
    const source = 'int total = (10 + 20\nint tax = 5;';
    const { tokens } = tokenize(source);

    const nextInt = tokens.find((t, idx) => idx > 3 && t.kind === 'INT')!;
    const nextIndex = tokens.indexOf(nextInt);

    const synthParen = createSyntheticToken('RPAREN', ')', nextInt.span, 'Insert )', 3);
    const synthSemi = createSyntheticToken('SEMICOLON', ';', nextInt.span, 'Insert ;', 4);

    const cand: RepairCandidate = {
      id: 'cand-2edit',
      strategy: 'minimum-cost',
      edits: [
        { action: 'insert', position: nextIndex, token: synthParen },
        { action: 'insert', position: nextIndex, token: synthSemi },
      ],
      expected: ['RPAREN', 'SEMICOLON'],
      cost: { lexical: 2, structural: 0, semanticRisk: 0, diagnostic: 0, total: 2 },
      validation: { window: 4, sourceTokensProgressed: 4, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ["Insert ')' and ';'"],
    };

    const patched = applyCandidateToSource(source, cand, tokens);
    expect(patched).toBe('int total = (10 + 20);\nint tax = 5;');
  });

  it('applies batch solutions across multiple incidents without index drift', () => {
    const source = `#include <stdio.h>

int main() {
  int total = (10 + 20;
  int tax = 5;
  int final_sum = total + tax;
  return final_sum
}`;

    const { tokens } = tokenize(source);
    const parseResult = parseWithBaselineRecovery(tokens);

    expect(parseResult.committedRepairs.length).toBe(2);

    const patched = applyMultipleCandidatesToSource(
      source,
      parseResult.committedRepairs,
      tokens
    );

    // Verify both errors fixed in patched string:
    // Line 4 should have (10 + 20);
    // Line 7 should have return final_sum;
    expect(patched).toContain('int total = (10 + 20);');
    expect(patched).toContain('return final_sum;');

    // Reparsing patched code must produce 0 errors
    const reTokens = tokenize(patched).tokens;
    const cleanResult = parseClean(reTokens);
    expect(cleanResult.diagnostics).toHaveLength(0);
    expect(cleanResult.ast.body.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty candidates or invalid edits gracefully without throwing', () => {
    const source = 'int x = 10;';
    const { tokens } = tokenize(source);

    expect(applyCandidateToSource(source, null as any, tokens)).toBe(source);
    expect(applyMultipleCandidatesToSource(source, [], tokens)).toBe(source);
  });

  it('correctly patches when candidate position was shifted by virtual stream drift', () => {
    const source = `int a = 1\nreturn a\n}`;
    const { tokens } = tokenize(source);

    // Suppose a candidate for "return a" has position = 99 (out of range or drifted),
    // but its token.span correctly points to the '}' token in source
    const rbraceTok = tokens.find((t) => t.kind === 'RBRACE')!;
    const synthSemi = createSyntheticToken('SEMICOLON', ';', rbraceTok.span, 'Insert ;', 10);

    const driftedCandidate: RepairCandidate = {
      id: 'cand-drifted',
      strategy: 'minimum-cost',
      edits: [{ action: 'insert', position: 99, token: synthSemi }],
      expected: ['SEMICOLON'],
      cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1 },
      validation: { window: 4, sourceTokensProgressed: 2, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ["Insert ';' before '}'"],
    };

    const patched = applyCandidateToSource(source, driftedCandidate, tokens);
    // Semicolon should anchor right after 'return a', NOT after '}'
    expect(patched).toBe(`int a = 1\nreturn a;\n}`);
  });

  it('inserts space around keywords when needed to prevent fusion', () => {
    const source = `int x = 10;\ny = 20;`;
    const { tokens } = tokenize(source);
    const yToken = tokens.find((t) => t.lexeme === 'y')!;

    const synthInt = createSyntheticToken('INT', 'int', yToken.span, 'Insert int', 11);
    const cand: RepairCandidate = {
      id: 'cand-keyword',
      strategy: 'minimum-cost',
      edits: [{ action: 'insert', position: tokens.indexOf(yToken), token: synthInt }],
      expected: ['INT'],
      cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1 },
      validation: { window: 4, sourceTokensProgressed: 2, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ["Insert 'int'"],
    };

    const patched = applyCandidateToSource(source, cand, tokens);
    expect(patched).toContain('int y = 20;');
  });
});
