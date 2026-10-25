import { describe, it, expect } from 'vitest';
import { tokenize, createSyntheticToken } from '../../src/language/lexer';
import { Parser } from '../../src/parser/parser';
import { createCheckpoint, areCheckpointsEqual } from '../../src/parser/checkpoint';
import { VirtualTokenStream } from '../../src/parser/virtualStream';
import { runSpeculativeParse } from '../../src/parser/speculativeRunner';
import { Edit } from '../../src/language/types';

describe('Checkpoints, Virtual Stream & Speculation (Stage 4)', () => {
  it('creates deterministic checkpoints and state hashes', () => {
    const cp1 = createCheckpoint(5, 0, [{ rule: 'letDecl', phase: 'body' }], ['LPAREN'], 0);
    const cp2 = createCheckpoint(5, 0, [{ rule: 'letDecl', phase: 'body' }], ['LPAREN'], 0);
    const cpDifferentCursor = createCheckpoint(6, 0, [{ rule: 'letDecl', phase: 'body' }], ['LPAREN'], 0);
    const cpDifferentDelim = createCheckpoint(5, 0, [{ rule: 'letDecl', phase: 'body' }], ['LBRACE'], 0);

    expect(cp1.stateHash).toBe(cp2.stateHash);
    expect(areCheckpointsEqual(cp1, cp2)).toBe(true);

    expect(cp1.stateHash).not.toBe(cpDifferentCursor.stateHash);
    expect(cp1.stateHash).not.toBe(cpDifferentDelim.stateHash);
  });

  it('virtual token stream applies edits without mutating base token array', () => {
    const source = 'let x = 10;';
    const { tokens: baseTokens } = tokenize(source);
    const originalLength = baseTokens.length;
    const originalFirstKind = baseTokens[0].kind;

    const synthSemicolon = createSyntheticToken(
      'SEMICOLON',
      ';',
      baseTokens[2].span,
      'test-insert'
    );

    const edits: Edit[] = [
      { action: 'insert', position: 2, token: synthSemicolon },
    ];

    const virtualStream = VirtualTokenStream.fromEdits(baseTokens, edits, 0);

    // Verify base array is completely unmodified
    expect(baseTokens).toHaveLength(originalLength);
    expect(baseTokens[0].kind).toBe(originalFirstKind);

    // Verify virtual stream contains inserted token
    const virtualTokens = virtualStream.toArray();
    expect(virtualTokens).toHaveLength(originalLength + 1);
    expect(virtualTokens[2].kind).toBe('SEMICOLON');
    expect(virtualTokens[2].origin).toBe('synthetic');
  });

  it('virtual stream tracks source tokens consumed correctly', () => {
    const source = 'let a = 1;';
    const { tokens } = tokenize(source);
    const stream = new VirtualTokenStream(tokens, 0);

    expect(stream.getSourceTokensConsumed()).toBe(0);
    stream.consume(); // 'let' (source)
    stream.consume(); // 'a' (source)
    expect(stream.getSourceTokensConsumed()).toBe(2);
  });

  it('parser dynamically tracks call frames and unclosed delimiter stack', () => {
    const source = 'let total = (10 + 20);';
    const { tokens } = tokenize(source);
    const parser = new Parser(tokens);

    // Initial checkpoint
    const initialCp = parser.captureCheckpoint();
    expect(initialCp.cursor).toBe(0);
    expect(initialCp.delimiterStack).toHaveLength(0);

    // Parse statement
    parser.parseStatement();

    // After parsing closed statement, delimiter stack should be empty
    expect(parser.getDelimiterStack()).toHaveLength(0);
  });

  it('speculatively validates repair candidate on missing closing parenthesis', () => {
    // Malformed code: missing ')' before ';'
    const source = 'let total = (10 + 20;\nlet next = 5;';
    const { tokens: baseTokens } = tokenize(source);

    // Find position of ';' where expect(')') failed (cursor at ';', index 6)
    const semiToken = baseTokens.find((t) => t.kind === 'SEMICOLON');
    expect(semiToken).toBeDefined();
    const semiIndex = baseTokens.indexOf(semiToken!);

    // Checkpoint captured at error position (at the ';')
    const checkpoint = createCheckpoint(
      0, // Start from beginning of statement
      0, // statementStartCursor
      [],
      [],
      0
    );

    // Valid candidate: Insert ')' right before ';'
    const synthRparen = createSyntheticToken(
      'RPAREN',
      ')',
      semiToken!.span,
      'Insert missing delimiter'
    );
    const validEdits: Edit[] = [
      { action: 'insert', position: semiIndex, token: synthRparen },
    ];

    const result = runSpeculativeParse(baseTokens, checkpoint, validEdits, 4);
    expect(result.outcome).toBe('pass');
    expect(result.failures).toBe(0);
    expect(result.sourceTokensProgressed).toBeGreaterThan(0);

    // Invalid candidate: Insert an invalid keyword 'let' instead of ')'
    const invalidToken = createSyntheticToken('LET', 'let', semiToken!.span, 'invalid');
    const invalidEdits: Edit[] = [
      { action: 'insert', position: semiIndex, token: invalidToken },
    ];

    const invalidResult = runSpeculativeParse(baseTokens, checkpoint, invalidEdits, 4);
    expect(invalidResult.outcome).toBe('fail');
    expect(invalidResult.failures).toBeGreaterThan(0);
  });

  it('guarantees complete isolation of speculative parsing runs', () => {
    const source = 'let a = 10; let b = 20;';
    const { tokens: baseTokens } = tokenize(source);
    const cp = createCheckpoint(0, 0, [], [], 0);

    const edits: Edit[] = [
      {
        action: 'substitute',
        position: 0,
        token: createSyntheticToken('WHILE', 'while', baseTokens[0].span, 'test'),
      },
    ];

    // Run speculative parse
    runSpeculativeParse(baseTokens, cp, edits, 3);

    // Check that original tokens array was not touched
    expect(baseTokens[0].kind).toBe('LET');
    expect(baseTokens[0].lexeme).toBe('let');
    expect(baseTokens[0].origin).toBe('source');
  });
});
