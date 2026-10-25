import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/language/lexer';
import { parseWithBaselineRecovery } from '../../src/parser/recoveringParser';
import { LetDeclarationNode, IfStatementNode } from '../../src/language/ast';

describe('Baseline Syntax Recovery (Stage 5)', () => {
  it('recovers from missing closing parenthesis via phrase repair', () => {
    // Classic example from section 0.3 of README
    const source = 'let total = (10 + 20;\nlet tax = 5;';
    const { tokens } = tokenize(source);
    const { ast, diagnostics, committedRepairs } = parseWithBaselineRecovery(tokens);

    // Both declarations should be present in AST
    expect(ast.body).toHaveLength(2);

    const first = ast.body[0] as LetDeclarationNode;
    expect(first.identifier.name).toBe('total');

    const second = ast.body[1] as LetDeclarationNode;
    expect(second.identifier.name).toBe('tax');

    // Exactly 1 committed repair
    expect(committedRepairs).toHaveLength(1);
    expect(['phrase', 'minimum-cost']).toContain(committedRepairs[0].strategy);
    expect(committedRepairs[0].edits[0].token?.kind).toBe('RPAREN');

    // Diagnostics should report recovery
    expect(diagnostics.some((d) => d.code.startsWith('RECOVERY_'))).toBe(true);
  });

  it('recovers from missing statement terminating semicolon', () => {
    const source = 'let a = 100\nlet b = 200;';
    const { tokens } = tokenize(source);
    const { ast, committedRepairs } = parseWithBaselineRecovery(tokens);

    expect(ast.body).toHaveLength(2);
    expect((ast.body[0] as LetDeclarationNode).identifier.name).toBe('a');
    expect((ast.body[1] as LetDeclarationNode).identifier.name).toBe('b');

    expect(committedRepairs).toHaveLength(1);
    expect(committedRepairs[0].edits[0].token?.kind).toBe('SEMICOLON');
  });

  it('recovers from missing closing block brace at EOF', () => {
    const source = 'if (x > 0) { y = 1;';
    const { tokens } = tokenize(source);
    const { ast, committedRepairs } = parseWithBaselineRecovery(tokens);

    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].kind).toBe('IfStatement');
    const ifStmt = ast.body[0] as IfStatementNode;
    expect(ifStmt.thenBranch.kind).toBe('BlockStatement');

    expect(committedRepairs.some((r) => r.edits[0].token?.kind === 'RBRACE')).toBe(true);
  });

  it('falls back to panic mode on unrecoverable syntax garbage', () => {
    const source = 'let + * / = ; \nlet restored = 99;';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseWithBaselineRecovery(tokens);

    // Panic mode produces a PartialNode for the garbage statement, then parses restored
    expect(ast.body.length).toBeGreaterThanOrEqual(1);

    const restoredNode = ast.body.find(
      (node) => node.kind === 'LetDeclaration' && (node as LetDeclarationNode).identifier.name === 'restored'
    );
    expect(restoredNode).toBeDefined();

    expect(diagnostics.some((d) => d.code === 'RECOVERY_PANIC_DISCARD')).toBe(true);
  });

  it('guarantees termination on severely truncated and invalid inputs', () => {
    const malformedInputs = [
      '',
      ';;;;',
      '{ { {',
      'let',
      'if (',
      'while (x',
      'let x =',
      'let x = ((((1',
    ];

    for (const input of malformedInputs) {
      const { tokens } = tokenize(input);
      // Execution must complete without throwing unhandled exceptions or hanging
      expect(() => parseWithBaselineRecovery(tokens)).not.toThrow();
    }
  });
});
