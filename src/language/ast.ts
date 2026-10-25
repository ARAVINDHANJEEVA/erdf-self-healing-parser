/**
 * Abstract Syntax Tree (AST) definitions and factory functions for MiniLang.
 * Every AST node carries source provenance and source span tracking.
 */

import { AstProvenance, BaseAstNode, SourceSpan } from './types';

export type AstNodeKind =
  | 'Program'
  | 'LetDeclaration'
  | 'VariableDeclaration'
  | 'FunctionDeclaration'
  | 'Parameter'
  | 'ReturnStatement'
  | 'ForStatement'
  | 'PreprocessorDirective'
  | 'IfStatement'
  | 'WhileStatement'
  | 'BlockStatement'
  | 'ExpressionStatement'
  | 'BinaryExpression'
  | 'UnaryExpression'
  | 'AssignmentExpression'
  | 'CallExpression'
  | 'LiteralNode'
  | 'IdentifierNode'
  | 'GroupExpression'
  | 'PartialNode';

export interface ProgramNode extends BaseAstNode {
  readonly kind: 'Program';
  readonly body: readonly StatementNode[];
}

export interface LetDeclarationNode extends BaseAstNode {
  readonly kind: 'LetDeclaration';
  readonly identifier: IdentifierNode;
  readonly initializer: ExpressionNode;
  readonly typeSpecifier?: string;
}

export interface ParameterNode extends BaseAstNode {
  readonly kind: 'Parameter';
  readonly typeSpecifier: string;
  readonly name: IdentifierNode;
  readonly isPointer?: boolean;
}

export interface FunctionDeclarationNode extends BaseAstNode {
  readonly kind: 'FunctionDeclaration';
  readonly returnType: string;
  readonly name: IdentifierNode;
  readonly parameters: readonly ParameterNode[];
  readonly body: BlockStatementNode;
}

export interface VariableDeclarationNode extends BaseAstNode {
  readonly kind: 'VariableDeclaration';
  readonly typeSpecifier: string;
  readonly identifier: IdentifierNode;
  readonly initializer?: ExpressionNode;
  readonly isPointer?: boolean;
}

export interface ReturnStatementNode extends BaseAstNode {
  readonly kind: 'ReturnStatement';
  readonly value?: ExpressionNode;
}

export interface ForStatementNode extends BaseAstNode {
  readonly kind: 'ForStatement';
  readonly initializer?: StatementNode;
  readonly condition?: ExpressionNode;
  readonly increment?: ExpressionNode;
  readonly body: StatementNode;
}

export interface PreprocessorDirectiveNode extends BaseAstNode {
  readonly kind: 'PreprocessorDirective';
  readonly directive: string;
}

export interface IfStatementNode extends BaseAstNode {
  readonly kind: 'IfStatement';
  readonly condition: ExpressionNode;
  readonly thenBranch: StatementNode;
  readonly elseBranch?: StatementNode;
}

export interface WhileStatementNode extends BaseAstNode {
  readonly kind: 'WhileStatement';
  readonly condition: ExpressionNode;
  readonly body: StatementNode;
}

export interface BlockStatementNode extends BaseAstNode {
  readonly kind: 'BlockStatement';
  readonly statements: readonly StatementNode[];
}

export interface ExpressionStatementNode extends BaseAstNode {
  readonly kind: 'ExpressionStatement';
  readonly expression: ExpressionNode;
}

export interface BinaryExpressionNode extends BaseAstNode {
  readonly kind: 'BinaryExpression';
  readonly left: ExpressionNode;
  readonly operator: string;
  readonly right: ExpressionNode;
}

export interface UnaryExpressionNode extends BaseAstNode {
  readonly kind: 'UnaryExpression';
  readonly operator: string;
  readonly operand: ExpressionNode;
}

export interface AssignmentExpressionNode extends BaseAstNode {
  readonly kind: 'AssignmentExpression';
  readonly assignee: IdentifierNode;
  readonly value: ExpressionNode;
}

export interface CallExpressionNode extends BaseAstNode {
  readonly kind: 'CallExpression';
  readonly callee: ExpressionNode;
  readonly arguments: readonly ExpressionNode[];
}

export interface LiteralNode extends BaseAstNode {
  readonly kind: 'LiteralNode';
  readonly value: number | string | boolean;
  readonly raw: string;
  readonly literalType: 'number' | 'string' | 'boolean';
}

export interface IdentifierNode extends BaseAstNode {
  readonly kind: 'IdentifierNode';
  readonly name: string;
}

export interface GroupExpressionNode extends BaseAstNode {
  readonly kind: 'GroupExpression';
  readonly expression: ExpressionNode;
}

export interface PartialNode extends BaseAstNode {
  readonly kind: 'PartialNode';
  readonly attemptedConstruct: string;
  readonly partiallyParsedChildren: readonly AstNode[];
  readonly diagnosticId: string;
}

export type StatementNode =
  | LetDeclarationNode
  | VariableDeclarationNode
  | FunctionDeclarationNode
  | ReturnStatementNode
  | ForStatementNode
  | PreprocessorDirectiveNode
  | IfStatementNode
  | WhileStatementNode
  | BlockStatementNode
  | ExpressionStatementNode
  | PartialNode;

export type ExpressionNode =
  | BinaryExpressionNode
  | UnaryExpressionNode
  | AssignmentExpressionNode
  | CallExpressionNode
  | LiteralNode
  | IdentifierNode
  | GroupExpressionNode
  | PartialNode;

export type AstNode = ProgramNode | StatementNode | ExpressionNode | ParameterNode;

let astNodeCounter = 0;

export function resetAstNodeCounter(): void {
  astNodeCounter = 0;
}

function nextNodeId(): string {
  return `node-${++astNodeCounter}`;
}

export function createProgram(body: readonly StatementNode[], span: SourceSpan): ProgramNode {
  return {
    id: nextNodeId(),
    kind: 'Program',
    body,
    span,
    provenance: 'source',
    repairIds: [],
  };
}

export function createLetDeclaration(
  identifier: IdentifierNode,
  initializer: ExpressionNode,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): LetDeclarationNode {
  return {
    id: nextNodeId(),
    kind: 'LetDeclaration',
    identifier,
    initializer,
    span,
    provenance,
    repairIds,
  };
}

export function createIfStatement(
  condition: ExpressionNode,
  thenBranch: StatementNode,
  elseBranch: StatementNode | undefined,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): IfStatementNode {
  return {
    id: nextNodeId(),
    kind: 'IfStatement',
    condition,
    thenBranch,
    elseBranch,
    span,
    provenance,
    repairIds,
  };
}

export function createWhileStatement(
  condition: ExpressionNode,
  body: StatementNode,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): WhileStatementNode {
  return {
    id: nextNodeId(),
    kind: 'WhileStatement',
    condition,
    body,
    span,
    provenance,
    repairIds,
  };
}

export function createVariableDeclaration(
  typeSpecifier: string,
  identifier: IdentifierNode,
  initializer?: ExpressionNode,
  span: SourceSpan = identifier.span,
  isPointer: boolean = false,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): VariableDeclarationNode {
  return {
    id: nextNodeId(),
    kind: 'VariableDeclaration',
    typeSpecifier,
    identifier,
    initializer,
    isPointer,
    span,
    provenance,
    repairIds,
  };
}

export function createParameterNode(
  typeSpecifier: string,
  name: IdentifierNode,
  span: SourceSpan,
  isPointer: boolean = false,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): ParameterNode {
  return {
    id: nextNodeId(),
    kind: 'Parameter',
    typeSpecifier,
    name,
    isPointer,
    span,
    provenance,
    repairIds,
  };
}

export function createFunctionDeclaration(
  returnType: string,
  name: IdentifierNode,
  parameters: readonly ParameterNode[],
  body: BlockStatementNode,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): FunctionDeclarationNode {
  return {
    id: nextNodeId(),
    kind: 'FunctionDeclaration',
    returnType,
    name,
    parameters,
    body,
    span,
    provenance,
    repairIds,
  };
}

export function createReturnStatement(
  value: ExpressionNode | undefined,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): ReturnStatementNode {
  return {
    id: nextNodeId(),
    kind: 'ReturnStatement',
    value,
    span,
    provenance,
    repairIds,
  };
}

export function createForStatement(
  initializer: StatementNode | undefined,
  condition: ExpressionNode | undefined,
  increment: ExpressionNode | undefined,
  body: StatementNode,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): ForStatementNode {
  return {
    id: nextNodeId(),
    kind: 'ForStatement',
    initializer,
    condition,
    increment,
    body,
    span,
    provenance,
    repairIds,
  };
}

export function createPreprocessorDirective(
  directive: string,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): PreprocessorDirectiveNode {
  return {
    id: nextNodeId(),
    kind: 'PreprocessorDirective',
    directive,
    span,
    provenance,
    repairIds,
  };
}

export function createBlockStatement(
  statements: readonly StatementNode[],
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): BlockStatementNode {
  return {
    id: nextNodeId(),
    kind: 'BlockStatement',
    statements,
    span,
    provenance,
    repairIds,
  };
}

export function createExpressionStatement(
  expression: ExpressionNode,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): ExpressionStatementNode {
  return {
    id: nextNodeId(),
    kind: 'ExpressionStatement',
    expression,
    span,
    provenance,
    repairIds,
  };
}

export function createBinaryExpression(
  left: ExpressionNode,
  operator: string,
  right: ExpressionNode,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): BinaryExpressionNode {
  return {
    id: nextNodeId(),
    kind: 'BinaryExpression',
    left,
    operator,
    right,
    span,
    provenance,
    repairIds,
  };
}

export function createUnaryExpression(
  operator: string,
  operand: ExpressionNode,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): UnaryExpressionNode {
  return {
    id: nextNodeId(),
    kind: 'UnaryExpression',
    operator,
    operand,
    span,
    provenance,
    repairIds,
  };
}

export function createAssignmentExpression(
  assignee: IdentifierNode,
  value: ExpressionNode,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): AssignmentExpressionNode {
  return {
    id: nextNodeId(),
    kind: 'AssignmentExpression',
    assignee,
    value,
    span,
    provenance,
    repairIds,
  };
}

export function createCallExpression(
  callee: ExpressionNode,
  args: readonly ExpressionNode[],
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): CallExpressionNode {
  return {
    id: nextNodeId(),
    kind: 'CallExpression',
    callee,
    arguments: args,
    span,
    provenance,
    repairIds,
  };
}

export function createLiteralNode(
  value: number | string | boolean,
  raw: string,
  literalType: 'number' | 'string' | 'boolean',
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): LiteralNode {
  return {
    id: nextNodeId(),
    kind: 'LiteralNode',
    value,
    raw,
    literalType,
    span,
    provenance,
    repairIds,
  };
}

export function createIdentifierNode(
  name: string,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): IdentifierNode {
  return {
    id: nextNodeId(),
    kind: 'IdentifierNode',
    name,
    span,
    provenance,
    repairIds,
  };
}

export function createGroupExpression(
  expression: ExpressionNode,
  span: SourceSpan,
  provenance: AstProvenance = 'source',
  repairIds: readonly string[] = []
): GroupExpressionNode {
  return {
    id: nextNodeId(),
    kind: 'GroupExpression',
    expression,
    span,
    provenance,
    repairIds,
  };
}

export function createPartialNode(
  attemptedConstruct: string,
  partiallyParsedChildren: readonly AstNode[],
  diagnosticId: string,
  span: SourceSpan,
  repairIds: readonly string[] = []
): PartialNode {
  return {
    id: nextNodeId(),
    kind: 'PartialNode',
    attemptedConstruct,
    partiallyParsedChildren,
    diagnosticId,
    span,
    provenance: 'partial',
    repairIds,
  };
}

export function isSideEffectExpression(expr: ExpressionNode): boolean {
  if (!expr) return false;
  if (expr.kind === 'GroupExpression') {
    return isSideEffectExpression(expr.expression);
  }
  if (expr.kind === 'AssignmentExpression') {
    return true;
  }
  if (expr.kind === 'CallExpression') {
    return true;
  }
  if (expr.kind === 'UnaryExpression') {
    const unary = expr as UnaryExpressionNode;
    const op = unary.operator;
    if (op === '++' || op === '--' || op === 'postfix_++' || op === 'postfix_--') {
      return true;
    }
    return isSideEffectExpression(unary.operand);
  }
  if (expr.kind === 'BinaryExpression') {
    const bin = expr as BinaryExpressionNode;
    return isSideEffectExpression(bin.left) || isSideEffectExpression(bin.right);
  }
  return false;
}

export function formatExpressionRepr(expr: ExpressionNode): string {
  if (!expr) return "''";
  switch (expr.kind) {
    case 'IdentifierNode':
      return `'${(expr as IdentifierNode).name}'`;
    case 'LiteralNode':
      return `'${(expr as LiteralNode).raw}'`;
    case 'GroupExpression':
      return `'(${formatExpressionRepr((expr as GroupExpressionNode).expression).slice(1, -1)})'`;
    case 'BinaryExpression': {
      const bin = expr as BinaryExpressionNode;
      const left = formatExpressionRepr(bin.left).slice(1, -1);
      const right = formatExpressionRepr(bin.right).slice(1, -1);
      return `'${left} ${bin.operator} ${right}'`;
    }
    case 'UnaryExpression': {
      const un = expr as UnaryExpressionNode;
      const operand = formatExpressionRepr(un.operand).slice(1, -1);
      if (un.operator.startsWith('postfix_')) {
        return `'${operand}${un.operator.slice(8)}'`;
      }
      return `'${un.operator}${operand}'`;
    }
    default:
      return `'${expr.kind}'`;
  }
}

