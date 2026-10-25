import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/language/lexer';
import { parseClean } from '../../src/parser/parser';
import {
  AssignmentExpressionNode,
  BinaryExpressionNode,
  CallExpressionNode,
  GroupExpressionNode,
  IfStatementNode,
  LetDeclarationNode,
  LiteralNode,
  UnaryExpressionNode,
  WhileStatementNode,
} from '../../src/language/ast';

describe('Clean MiniLang Parser & AST (Stage 3)', () => {
  it('parses variable declarations (let)', () => {
    const source = 'let x = 42;\nlet message = "hello";';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics).toHaveLength(0);
    expect(ast.body).toHaveLength(2);

    const let1 = ast.body[0] as LetDeclarationNode;
    expect(let1.kind).toBe('LetDeclaration');
    expect(let1.identifier.name).toBe('x');
    expect((let1.initializer as LiteralNode).value).toBe(42);
    expect(let1.provenance).toBe('source');

    const let2 = ast.body[1] as LetDeclarationNode;
    expect(let2.identifier.name).toBe('message');
    expect((let2.initializer as LiteralNode).value).toBe('hello');
  });

  it('parses if and if-else control flow statements', () => {
    const source = `
      if (score >= 90) {
        grade = "A";
      } else {
        grade = "B";
      }
    `;
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics).toHaveLength(0);
    expect(ast.body).toHaveLength(1);

    const ifStmt = ast.body[0] as IfStatementNode;
    expect(ifStmt.kind).toBe('IfStatement');

    const cond = ifStmt.condition as BinaryExpressionNode;
    expect(cond.operator).toBe('>=');

    expect(ifStmt.thenBranch.kind).toBe('BlockStatement');
    expect(ifStmt.elseBranch?.kind).toBe('BlockStatement');
  });

  it('parses while loops with block bodies', () => {
    const source = 'while (i < 10) { i = i + 1; }';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics).toHaveLength(0);
    expect(ast.body).toHaveLength(1);

    const whileStmt = ast.body[0] as WhileStatementNode;
    expect(whileStmt.kind).toBe('WhileStatement');
    expect((whileStmt.condition as BinaryExpressionNode).operator).toBe('<');
    expect(whileStmt.body.kind).toBe('BlockStatement');
  });

  it('parses function calls with multiple and zero arguments', () => {
    const source = 'print(x, 10 + 20);\nexit();';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics).toHaveLength(0);
    expect(ast.body).toHaveLength(2);

    const call1 = (ast.body[0] as any).expression as CallExpressionNode;
    expect(call1.kind).toBe('CallExpression');
    expect(call1.arguments).toHaveLength(2);

    const call2 = (ast.body[1] as any).expression as CallExpressionNode;
    expect(call2.arguments).toHaveLength(0);
  });

  it('correctly applies arithmetic operator precedence (* / over + -)', () => {
    const source = 'let result = 1 + 2 * 3 - 4 / 2;';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics).toHaveLength(0);
    const letStmt = ast.body[0] as LetDeclarationNode;

    // Outer expression should be binary '-'
    const outerMinus = letStmt.initializer as BinaryExpressionNode;
    expect(outerMinus.operator).toBe('-');

    // Left of '-' is '1 + 2 * 3' (binary '+')
    const leftPlus = outerMinus.left as BinaryExpressionNode;
    expect(leftPlus.operator).toBe('+');
    expect((leftPlus.left as LiteralNode).value).toBe(1);

    // Right of '+' is '2 * 3' (binary '*')
    const mult = leftPlus.right as BinaryExpressionNode;
    expect(mult.operator).toBe('*');
    expect((mult.left as LiteralNode).value).toBe(2);
    expect((mult.right as LiteralNode).value).toBe(3);

    // Right of '-' is '4 / 2' (binary '/')
    const div = outerMinus.right as BinaryExpressionNode;
    expect(div.operator).toBe('/');
    expect((div.left as LiteralNode).value).toBe(4);
    expect((div.right as LiteralNode).value).toBe(2);
  });

  it('respects parenthesized grouping expressions', () => {
    const source = 'let res = (1 + 2) * 3;';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics).toHaveLength(0);
    const letStmt = ast.body[0] as LetDeclarationNode;
    const mult = letStmt.initializer as BinaryExpressionNode;

    expect(mult.operator).toBe('*');
    expect(mult.left.kind).toBe('GroupExpression');

    const group = mult.left as GroupExpressionNode;
    expect((group.expression as BinaryExpressionNode).operator).toBe('+');
    expect((mult.right as LiteralNode).value).toBe(3);
  });

  it('correctly parses unary prefix operators (! and -)', () => {
    const source = 'let val = -a * !b;';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics).toHaveLength(0);
    const letStmt = ast.body[0] as LetDeclarationNode;
    const mult = letStmt.initializer as BinaryExpressionNode;

    expect(mult.operator).toBe('*');
    expect(mult.left.kind).toBe('UnaryExpression');
    expect((mult.left as UnaryExpressionNode).operator).toBe('-');

    expect(mult.right.kind).toBe('UnaryExpression');
    expect((mult.right as UnaryExpressionNode).operator).toBe('!');
  });

  it('correctly handles comparison and logical operators (&&, ||, ==)', () => {
    const source = 'let cond = a == 1 && b > 2 || !c;';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics).toHaveLength(0);
    const letStmt = ast.body[0] as LetDeclarationNode;

    // || has lowest precedence
    const orExpr = letStmt.initializer as BinaryExpressionNode;
    expect(orExpr.operator).toBe('||');

    // Left of || is 'a == 1 && b > 2' (&&)
    const andExpr = orExpr.left as BinaryExpressionNode;
    expect(andExpr.operator).toBe('&&');

    // Left of && is 'a == 1' (==)
    const eqExpr = andExpr.left as BinaryExpressionNode;
    expect(eqExpr.operator).toBe('==');

    // Right of && is 'b > 2' (>)
    const gtExpr = andExpr.right as BinaryExpressionNode;
    expect(gtExpr.operator).toBe('>');

    // Right of || is '!c'
    expect(orExpr.right.kind).toBe('UnaryExpression');
  });

  it('parses right-associative chained assignments', () => {
    const source = 'a = b = 42;';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics).toHaveLength(0);
    const exprStmt = ast.body[0] as any;
    const outerAssign = exprStmt.expression as AssignmentExpressionNode;

    expect(outerAssign.kind).toBe('AssignmentExpression');
    expect(outerAssign.assignee.name).toBe('a');

    const innerAssign = outerAssign.value as AssignmentExpressionNode;
    expect(innerAssign.kind).toBe('AssignmentExpression');
    expect(innerAssign.assignee.name).toBe('b');
    expect((innerAssign.value as LiteralNode).value).toBe(42);
  });

  it('records accurate source spans for statements and expressions', () => {
    const source = 'let total = 100 + 50;';
    const { tokens } = tokenize(source);
    const { ast } = parseClean(tokens);

    const letStmt = ast.body[0] as LetDeclarationNode;
    expect(letStmt.span.start).toBe(0);
    expect(letStmt.span.end).toBe(source.length);

    expect(letStmt.identifier.span.start).toBe(4);
    expect(letStmt.identifier.span.end).toBe(9);

    const init = letStmt.initializer as BinaryExpressionNode;
    expect(init.span.start).toBe(12);
    expect(init.span.end).toBe(20);
  });

  it('records diagnostic and synchronizes when clean parser encounters syntax error', () => {
    const source = 'let x = ; let y = 20;';
    const { tokens } = tokenize(source);
    const { ast, diagnostics } = parseClean(tokens);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message).toContain('Expected expression');
    // Synchronized to second statement
    expect(ast.body).toHaveLength(1);
    expect((ast.body[0] as LetDeclarationNode).identifier.name).toBe('y');
  });
});
