import { describe, it, expect } from 'vitest';
import { formatCandidateAction, formatEdit } from '../../src/ui/utils/candidateFormatter';
import { formatTraceSummary } from '../../src/ui/utils/traceFormatter';
import { Edit, RepairCandidate, Token } from '../../src/language/types';
import { tokenize } from '../../src/language/lexer';
import { VirtualTokenStream } from '../../src/parser/virtualStream';
import { RecoveringParser } from '../../src/parser/recoveringParser';

describe('Candidate Action Formatter', () => {
  it('formats delete actions with explicit deleted lexeme/kind', () => {
    const deletedTok: Token = {
      id: 'tok-1',
      kind: 'RPAREN',
      lexeme: ')',
      span: { start: 10, end: 11, line: 1, column: 11 },
      origin: 'source',
    };
    const edit: Edit = {
      action: 'delete',
      position: 5,
      deletedToken: deletedTok,
    };

    expect(formatEdit(edit)).toBe('DELETE ")"');

    const candidate: RepairCandidate = {
      id: 'cand-1',
      strategy: 'minimum-cost',
      edits: [edit],
      expected: ['SEMICOLON'],
      cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1 },
      validation: { window: 4, sourceTokensProgressed: 4, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ['Delete unexpected RPAREN'],
    };

    expect(formatCandidateAction(candidate)).toBe('DELETE ")"');
  });

  it('formats substitute actions with source and target tokens', () => {
    const deletedTok: Token = {
      id: 'tok-comma',
      kind: 'COMMA',
      lexeme: ',',
      span: { start: 10, end: 11, line: 1, column: 11 },
      origin: 'source',
    };
    const synthTok: Token = {
      id: 'tok-semi-1',
      kind: 'SEMICOLON',
      lexeme: ';',
      span: { start: 10, end: 11, line: 1, column: 11 },
      origin: 'synthetic',
    };
    const edit: Edit = {
      action: 'substitute',
      position: 5,
      deletedToken: deletedTok,
      token: synthTok,
    };

    expect(formatEdit(edit)).toBe('SUBSTITUTE "," → ";"');
  });

  it('formats insert actions with target token', () => {
    const synthTok: Token = {
      id: 'tok-semi-2',
      kind: 'SEMICOLON',
      lexeme: ';',
      span: { start: 10, end: 11, line: 1, column: 11 },
      origin: 'synthetic',
    };
    const edit: Edit = {
      action: 'insert',
      position: 5,
      token: synthTok,
    };

    expect(formatEdit(edit)).toBe('INSERT ";"');
  });
});

describe('Counterfactual AST Generation', () => {
  it('produces an alternative AST when candidate edits are applied to virtual stream', () => {
    const source = `int main() { int x = 10 return x; }`;
    const { tokens } = tokenize(source);

    // Candidate 1: Insert missing semicolon after 10
    const synthSemicolon: Token = {
      id: 'tok-semi-3',
      kind: 'SEMICOLON',
      lexeme: ';',
      span: { start: 23, end: 23, line: 1, column: 24 },
      origin: 'synthetic',
    };
    const candEdits: Edit[] = [
      { action: 'insert', position: 9, token: synthSemicolon },
    ];

    const stream = VirtualTokenStream.fromEdits(tokens, candEdits, 0);
    const patchedTokens = stream.toArray();
    const parser = new RecoveringParser(patchedTokens);
    const result = parser.parse();

    expect(result.ast).toBeDefined();
    expect(result.ast.body.length).toBeGreaterThan(0);
    const fn = result.ast.body[0] as any;
    expect(fn.kind).toBe('FunctionDeclaration');
    expect(fn.body.statements.length).toBe(2); // int x = 10; and return x;
  });
});

describe('Human-Readable Trace Summary Formatter', () => {
  it('formats TokenConsumed into a clean descriptive summary without raw JSON', () => {
    const ev: any = {
      sequence: 1,
      phase: 'parse',
      type: 'TokenConsumed',
      payload: {
        token: {
          id: 'tok-1',
          kind: 'INT',
          lexeme: 'int',
          span: { start: 0, end: 3, line: 1, column: 1 },
          origin: 'source',
        },
        cursor: 0,
      },
    };

    const summary = formatTraceSummary(ev);
    expect(summary).toBe('Consumed "int" (INT) [L1:1]');
    expect(summary).not.toContain('{"token"');
  });

  it('formats SyntaxErrorDetected into clean error message without raw JSON', () => {
    const ev: any = {
      sequence: 2,
      phase: 'recovery',
      type: 'SyntaxErrorDetected',
      payload: {
        actualToken: {
          id: 'tok-ret',
          kind: 'RETURN',
          lexeme: 'return',
          span: { start: 10, end: 16, line: 2, column: 3 },
          origin: 'source',
        },
        expectedKinds: ['SEMICOLON'],
      },
    };

    const summary = formatTraceSummary(ev);
    expect(summary).toBe('Syntax Error: Unexpected "return" • Expected: SEMICOLON');
    expect(summary).not.toContain('{');
  });

  it('formats PanicDiscard without raw JSON', () => {
    const ev: any = {
      sequence: 3,
      phase: 'recovery',
      type: 'PanicDiscard',
      payload: {
        discardedTokens: [
          { id: 't1', kind: 'IDENT', lexeme: 'foo', span: { start: 0, end: 3, line: 1, column: 1 }, origin: 'source' },
          { id: 't2', kind: 'PLUS', lexeme: '+', span: { start: 4, end: 5, line: 1, column: 5 }, origin: 'source' },
        ],
        resyncToken: { id: 't3', kind: 'SEMICOLON', lexeme: ';', span: { start: 6, end: 7, line: 1, column: 7 }, origin: 'source' },
      },
    };

    const summary = formatTraceSummary(ev);
    expect(summary).toBe('Panic Discard: Skipped "foo +" → Resynced at ";"');
  });
});
