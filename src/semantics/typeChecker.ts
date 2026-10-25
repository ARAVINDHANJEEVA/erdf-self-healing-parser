/**
 * Semantic Type Checker and Scope Validator.
 * Traverses MiniLang / C AST, builds hierarchical scope trees,
 * tracks variable/function declarations, infers expression types,
 * detects undeclared identifiers with Levenshtein fuzzy typo repair suggestions,
 * and identifies type mismatches and invalid returns.
 */

import {
  AssignmentExpressionNode,
  BinaryExpressionNode,
  BlockStatementNode,
  CallExpressionNode,
  ExpressionNode,
  ForStatementNode,
  FunctionDeclarationNode,
  GroupExpressionNode,
  IdentifierNode,
  IfStatementNode,
  LetDeclarationNode,
  LiteralNode,
  ProgramNode,
  ReturnStatementNode,
  StatementNode,
  UnaryExpressionNode,
  VariableDeclarationNode,
  WhileStatementNode,
  isSideEffectExpression,
  formatExpressionRepr,
} from '../language/ast';
import { Diagnostic, SourceSpan } from '../language/types';
import {
  BaseScope,
  BlockScope,
  FunctionScope,
  GlobalScope,
  findTypoSuggestions,
  nextSymbolId,
  resetSemanticCounters,
  SymbolDefinition,
} from './symbolTable';

export type SemanticDiagnosticKind =
  | 'undeclared-identifier'
  | 'type-mismatch'
  | 'redefinition'
  | 'invalid-return';

export interface SemanticRepairCandidate {
  readonly id: string;
  readonly originalName: string;
  readonly suggestedName: string;
  readonly replacementSpan: SourceSpan;
  readonly distance: number;
  readonly similarity: number;
  readonly confidence: number;
  readonly matchPercentage: number;
  readonly symbol: SymbolDefinition;
  readonly explanation: string;
}

export interface SemanticDiagnostic extends Diagnostic {
  readonly semanticKind: SemanticDiagnosticKind;
  readonly symbolCandidate?: SemanticRepairCandidate;
  readonly expectedType?: string;
  readonly actualType?: string;
}

export interface SemanticAnalysisResult {
  readonly scopeTree: GlobalScope;
  readonly allScopes: readonly BaseScope[];
  readonly diagnostics: readonly SemanticDiagnostic[];
  readonly inScopeSymbols: readonly SymbolDefinition[];
  readonly suggestions: readonly SemanticRepairCandidate[];
}

export function getSemanticRecommendation(diag: {
  semanticKind: string;
  message: string;
  expectedType?: string;
  actualType?: string;
}): string {
  switch (diag.semanticKind) {
    case 'undeclared-identifier':
      return 'Declare the variable before usage, or apply the fuzzy typo fix above.';
    case 'type-mismatch':
      return `Ensure expression type '${diag.actualType || 'value'}' is compatible with target '${diag.expectedType || 'target'}', or add an explicit cast.`;
    case 'redefinition':
      return 'Rename this variable or remove the redundant declaration in this scope.';
    case 'invalid-return':
      return 'Ensure returned expression matches the declared return type of the enclosing function.';
    default:
      return 'Verify variable declarations and ensure scope bindings are aligned with language semantics.';
  }
}

let diagnosticCounter = 0;
let candidateFixCounter = 0;

export function resetTypeCheckerCounters(): void {
  diagnosticCounter = 0;
  candidateFixCounter = 0;
}

const NUMERIC_TYPES = new Set([
  'int',
  'float',
  'double',
  'char',
  'bool',
  'long',
  'short',
  'unsigned',
  'signed',
]);

/**
 * Checks if valueType is assignment-compatible with targetType in C semantics.
 */
export function areTypesCompatible(targetType: string, valueType: string): boolean {
  if (targetType === 'unknown' || valueType === 'unknown') {
    return true;
  }
  const t = targetType.trim();
  const v = valueType.trim();

  if (t === v) return true;

  // Numeric type interoperability
  if (NUMERIC_TYPES.has(t) && NUMERIC_TYPES.has(v)) {
    return true;
  }

  // Pointer compatibility: void* can receive any pointer, or null pointer
  if (t.endsWith('*') && (v === 'void*' || v === 'NULL' || v.endsWith('*'))) {
    return true;
  }

  // String literals are compatible with char* or const char*
  if ((t === 'char*' || t === 'const char*') && v === 'string') {
    return true;
  }

  return false;
}

/**
 * Infers the resultant type of an AST expression node.
 */
export function inferExpressionType(expr: ExpressionNode, scope: BaseScope): string {
  if (!expr) return 'unknown';

  switch (expr.kind) {
    case 'LiteralNode': {
      const lit = expr as LiteralNode;
      if (lit.literalType === 'number') {
        return lit.raw.includes('.') ? 'float' : 'int';
      }
      if (lit.literalType === 'string') return 'string';
      if (lit.literalType === 'boolean') return 'bool';
      return 'unknown';
    }

    case 'IdentifierNode': {
      const id = expr as IdentifierNode;
      const sym = scope.lookup(id.name);
      return sym ? sym.typeSpecifier : 'unknown';
    }

    case 'BinaryExpression': {
      const bin = expr as BinaryExpressionNode;
      const leftType = inferExpressionType(bin.left, scope);
      const rightType = inferExpressionType(bin.right, scope);

      if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(bin.operator)) {
        return 'bool';
      }

      if (leftType === 'string' || rightType === 'string') {
        return 'string';
      }
      if (leftType === 'double' || rightType === 'double') return 'double';
      if (leftType === 'float' || rightType === 'float') return 'float';
      if (leftType === 'int' || rightType === 'int') return 'int';

      return leftType !== 'unknown' ? leftType : rightType;
    }

    case 'UnaryExpression': {
      const un = expr as UnaryExpressionNode;
      if (un.operator === '!') return 'bool';
      if (un.operator === '&') {
        const opType = inferExpressionType(un.operand, scope);
        return opType !== 'unknown' ? `${opType}*` : 'unknown';
      }
      if (un.operator === '*') {
        const opType = inferExpressionType(un.operand, scope);
        return opType.endsWith('*') ? opType.slice(0, -1) : 'unknown';
      }
      return inferExpressionType(un.operand, scope);
    }

    case 'GroupExpression': {
      const grp = expr as GroupExpressionNode;
      return inferExpressionType(grp.expression, scope);
    }

    case 'AssignmentExpression': {
      const assign = expr as AssignmentExpressionNode;
      return inferExpressionType(assign.value, scope);
    }

    case 'CallExpression': {
      const call = expr as CallExpressionNode;
      if (call.callee.kind === 'IdentifierNode') {
        const fnSym = scope.lookup(call.callee.name);
        if (fnSym) {
          return fnSym.returnType || fnSym.typeSpecifier;
        }
      }
      return 'unknown';
    }

    default:
      return 'unknown';
  }
}

export class TypeChecker {
  private globalScope: GlobalScope;
  private currentScope: BaseScope;
  private allScopes: BaseScope[] = [];
  private diagnostics: SemanticDiagnostic[] = [];
  private suggestions: SemanticRepairCandidate[] = [];
  private currentFunction: { name: string; returnType: string } | null = null;

  constructor() {
    this.globalScope = new GlobalScope();
    this.globalScope.seedBuiltins();
    this.currentScope = this.globalScope;
    this.allScopes.push(this.globalScope);
  }

  public check(ast: ProgramNode): SemanticAnalysisResult {
    resetSemanticCounters();
    resetTypeCheckerCounters();

    this.globalScope = new GlobalScope(ast.span);
    this.globalScope.seedBuiltins();
    this.currentScope = this.globalScope;
    this.allScopes = [this.globalScope];
    this.diagnostics = [];
    this.suggestions = [];
    this.currentFunction = null;

    if (!ast || !ast.body) {
      return this.buildResult();
    }

    // 1. Pre-pass: Register all top-level functions so mutual calls resolve cleanly
    for (const stmt of ast.body) {
      if (stmt.kind === 'FunctionDeclaration') {
        const fn = stmt as FunctionDeclarationNode;
        if (!this.globalScope.lookupLocal(fn.name.name)) {
          this.globalScope.define({
            id: nextSymbolId('fn'),
            name: fn.name.name,
            typeSpecifier: fn.returnType,
            span: fn.name.span,
            kind: 'function',
            scopeId: this.globalScope.id,
            returnType: fn.returnType,
            parameterTypes: fn.parameters.map((p) => p.typeSpecifier),
          });
        }
      }
    }

    // 2. Sequential semantic traversal
    for (const stmt of ast.body) {
      this.checkStatement(stmt);
    }

    return this.buildResult();
  }

  private buildResult(): SemanticAnalysisResult {
    return {
      scopeTree: this.globalScope,
      allScopes: this.allScopes,
      diagnostics: this.diagnostics,
      inScopeSymbols: this.globalScope.getAllSymbols(),
      suggestions: this.suggestions,
    };
  }

  private pushScope(scope: BaseScope): void {
    this.allScopes.push(scope);
    this.currentScope = scope;
  }

  private popScope(): void {
    if (this.currentScope.parent) {
      this.currentScope = this.currentScope.parent;
    }
  }

  private checkStatement(stmt: StatementNode): void {
    if (!stmt) return;

    switch (stmt.kind) {
      case 'FunctionDeclaration': {
        const fn = stmt as FunctionDeclarationNode;
        // Verify function redefinition in global scope
        const existingLocal = this.globalScope.lookupLocal(fn.name.name);
        if (existingLocal && existingLocal.span.start !== fn.name.span.start) {
          this.emitDiagnostic({
            severity: 'warning',
            semanticKind: 'redefinition',
            message: `Redefinition of function '${fn.name.name}'`,
            code: 'SEM_REDEFINITION',
            span: fn.name.span,
          });
        }

        const fnScope = new FunctionScope(
          fn.name.name,
          this.currentScope,
          fn.span,
          fn.returnType
        );
        this.pushScope(fnScope);
        const prevFunc = this.currentFunction;
        this.currentFunction = { name: fn.name.name, returnType: fn.returnType };

        // Declare parameters inside function scope
        for (const param of fn.parameters) {
          if (fnScope.lookupLocal(param.name.name)) {
            this.emitDiagnostic({
              severity: 'error',
              semanticKind: 'redefinition',
              message: `Duplicate parameter '${param.name.name}' in function '${fn.name.name}'`,
              code: 'SEM_REDEFINITION',
              span: param.name.span,
            });
          } else {
            fnScope.define({
              id: nextSymbolId('param'),
              name: param.name.name,
              typeSpecifier: param.typeSpecifier,
              span: param.name.span,
              kind: 'parameter',
              scopeId: fnScope.id,
              isPointer: param.isPointer,
            });
          }
        }

        // Function body statements directly belong to function scope
        if (fn.body && fn.body.statements) {
          for (const s of fn.body.statements) {
            this.checkStatement(s);
          }
        }

        this.currentFunction = prevFunc;
        this.popScope();
        break;
      }

      case 'VariableDeclaration': {
        const v = stmt as VariableDeclarationNode;
        const localSym = this.currentScope.lookupLocal(v.identifier.name);
        if (localSym) {
          this.emitDiagnostic({
            severity: 'warning',
            semanticKind: 'redefinition',
            message: `Redefinition of '${v.identifier.name}' in current scope`,
            code: 'SEM_REDEFINITION',
            span: v.identifier.span,
          });
        }

        this.currentScope.define({
          id: nextSymbolId('var'),
          name: v.identifier.name,
          typeSpecifier: v.typeSpecifier,
          span: v.identifier.span,
          kind: 'variable',
          scopeId: this.currentScope.id,
          isPointer: v.isPointer,
        });

        if (v.initializer) {
          this.checkExpression(v.initializer);
          const initType = inferExpressionType(v.initializer, this.currentScope);
          if (!areTypesCompatible(v.typeSpecifier, initType)) {
            this.emitDiagnostic({
              severity: 'error',
              semanticKind: 'type-mismatch',
              expectedType: v.typeSpecifier,
              actualType: initType,
              message: `Cannot initialize variable '${v.identifier.name}' of type '${v.typeSpecifier}' with value of incompatible type '${initType}'`,
              code: 'SEM_TYPE_MISMATCH',
              span: v.initializer.span,
            });
          }
        }
        break;
      }

      case 'LetDeclaration': {
        const letDecl = stmt as LetDeclarationNode;
        if (letDecl.initializer) {
          this.checkExpression(letDecl.initializer);
        }
        const inferred = inferExpressionType(letDecl.initializer, this.currentScope);
        const typeSpec = letDecl.typeSpecifier || inferred;

        this.currentScope.define({
          id: nextSymbolId('var'),
          name: letDecl.identifier.name,
          typeSpecifier: typeSpec,
          span: letDecl.identifier.span,
          kind: 'variable',
          scopeId: this.currentScope.id,
        });
        break;
      }

      case 'BlockStatement': {
        const block = stmt as BlockStatementNode;
        const blockScope = new BlockScope('block', this.currentScope, block.span);
        this.pushScope(blockScope);
        for (const s of block.statements) {
          this.checkStatement(s);
        }
        this.popScope();
        break;
      }

      case 'IfStatement': {
        const ifStmt = stmt as IfStatementNode;
        this.checkExpression(ifStmt.condition);

        const ifScope = new BlockScope('if', this.currentScope, ifStmt.thenBranch.span);
        this.pushScope(ifScope);
        if (ifStmt.thenBranch.kind === 'BlockStatement') {
          for (const s of (ifStmt.thenBranch as BlockStatementNode).statements) {
            this.checkStatement(s);
          }
        } else {
          this.checkStatement(ifStmt.thenBranch);
        }
        this.popScope();

        if (ifStmt.elseBranch) {
          const elseScope = new BlockScope('else', this.currentScope, ifStmt.elseBranch.span);
          this.pushScope(elseScope);
          if (ifStmt.elseBranch.kind === 'BlockStatement') {
            for (const s of (ifStmt.elseBranch as BlockStatementNode).statements) {
              this.checkStatement(s);
            }
          } else {
            this.checkStatement(ifStmt.elseBranch);
          }
          this.popScope();
        }
        break;
      }

      case 'WhileStatement': {
        const whileStmt = stmt as WhileStatementNode;
        this.checkExpression(whileStmt.condition);
        const whileScope = new BlockScope('while', this.currentScope, whileStmt.body.span);
        this.pushScope(whileScope);
        if (whileStmt.body.kind === 'BlockStatement') {
          for (const s of (whileStmt.body as BlockStatementNode).statements) {
            this.checkStatement(s);
          }
        } else {
          this.checkStatement(whileStmt.body);
        }
        this.popScope();
        break;
      }

      case 'ForStatement': {
        const forStmt = stmt as ForStatementNode;
        const forScope = new BlockScope('for', this.currentScope, forStmt.span);
        this.pushScope(forScope);

        if (forStmt.initializer) this.checkStatement(forStmt.initializer);
        if (forStmt.condition) this.checkExpression(forStmt.condition);
        if (forStmt.increment) this.checkExpression(forStmt.increment);
        if (forStmt.body) {
          if (forStmt.body.kind === 'BlockStatement') {
            for (const s of (forStmt.body as BlockStatementNode).statements) {
              this.checkStatement(s);
            }
          } else {
            this.checkStatement(forStmt.body);
          }
        }

        this.popScope();
        break;
      }

      case 'ReturnStatement': {
        const ret = stmt as ReturnStatementNode;
        if (ret.value) {
          this.checkExpression(ret.value);
          const valType = inferExpressionType(ret.value, this.currentScope);

          if (this.currentFunction) {
            if (this.currentFunction.returnType === 'void') {
              this.emitDiagnostic({
                severity: 'error',
                semanticKind: 'invalid-return',
                message: `Void function '${this.currentFunction.name}' cannot return a value`,
                code: 'SEM_INVALID_RETURN',
                span: ret.value.span,
              });
            } else if (!areTypesCompatible(this.currentFunction.returnType, valType)) {
              this.emitDiagnostic({
                severity: 'error',
                semanticKind: 'type-mismatch',
                expectedType: this.currentFunction.returnType,
                actualType: valType,
                message: `Function '${this.currentFunction.name}' returns '${this.currentFunction.returnType}' but return expression is of type '${valType}'`,
                code: 'SEM_INVALID_RETURN',
                span: ret.value.span,
              });
            }
          }
        }
        break;
      }

      case 'ExpressionStatement': {
        this.checkExpression(stmt.expression);
        if (!isSideEffectExpression(stmt.expression)) {
          const repr = formatExpressionRepr(stmt.expression);
          this.diagnostics.push({
            id: `diag-sem-no-effect-${stmt.span.start}`,
            severity: 'error',
            message: `Statement with no effect. Expression ${repr} result is unused.`,
            span: stmt.span,
            code: 'SEM_STATEMENT_NO_EFFECT',
            semanticKind: 'type-mismatch',
          });
        }
        break;
      }

      case 'PartialNode': {
        if (stmt.partiallyParsedChildren) {
          for (const child of stmt.partiallyParsedChildren) {
            if ('body' in child || 'statements' in child) {
              this.checkStatement(child as StatementNode);
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  private checkExpression(expr: ExpressionNode): void {
    if (!expr) return;

    switch (expr.kind) {
      case 'IdentifierNode': {
        this.resolveIdentifier(expr as IdentifierNode);
        break;
      }

      case 'AssignmentExpression': {
        const assign = expr as AssignmentExpressionNode;
        const assigneeName = assign.assignee.name;
        const sym = this.currentScope.lookup(assigneeName);

        if (!sym) {
          this.reportUndeclared(assigneeName, assign.assignee.span);
        }

        this.checkExpression(assign.value);

        if (sym) {
          const valType = inferExpressionType(assign.value, this.currentScope);
          if (!areTypesCompatible(sym.typeSpecifier, valType)) {
            this.emitDiagnostic({
              severity: 'error',
              semanticKind: 'type-mismatch',
              expectedType: sym.typeSpecifier,
              actualType: valType,
              message: `Cannot assign value of type '${valType}' to variable '${sym.name}' of type '${sym.typeSpecifier}'`,
              code: 'SEM_TYPE_MISMATCH',
              span: assign.value.span,
            });
          }
        }
        break;
      }

      case 'BinaryExpression': {
        const bin = expr as BinaryExpressionNode;
        this.checkExpression(bin.left);
        this.checkExpression(bin.right);
        break;
      }

      case 'UnaryExpression': {
        const un = expr as UnaryExpressionNode;
        this.checkExpression(un.operand);
        break;
      }

      case 'GroupExpression': {
        const grp = expr as GroupExpressionNode;
        this.checkExpression(grp.expression);
        break;
      }

      case 'CallExpression': {
        const call = expr as CallExpressionNode;
        let fnSym: SymbolDefinition | undefined;
        if (call.callee.kind === 'IdentifierNode') {
          fnSym = this.currentScope.lookup(call.callee.name);
          if (!fnSym) {
            this.reportUndeclared(call.callee.name, call.callee.span);
          }
        } else {
          this.checkExpression(call.callee);
        }

        for (let i = 0; i < call.arguments.length; i++) {
          const arg = call.arguments[i];
          this.checkExpression(arg);
          if (fnSym && fnSym.parameterTypes && i < fnSym.parameterTypes.length) {
            const expectedParamType = fnSym.parameterTypes[i];
            if (expectedParamType && expectedParamType !== 'unknown') {
              const actualArgType = inferExpressionType(arg, this.currentScope);
              if (!areTypesCompatible(expectedParamType, actualArgType)) {
                this.emitDiagnostic({
                  severity: 'error',
                  semanticKind: 'type-mismatch',
                  expectedType: expectedParamType,
                  actualType: actualArgType,
                  message: `Argument ${i + 1} of '${fnSym.name}' expects type '${expectedParamType}' but got '${actualArgType}'`,
                  code: 'SEM_TYPE_MISMATCH',
                  span: arg.span,
                });
              }
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  private resolveIdentifier(ident: IdentifierNode): void {
    const sym = this.currentScope.lookup(ident.name);
    if (!sym) {
      this.reportUndeclared(ident.name, ident.span);
    }
  }

  private reportUndeclared(name: string, span: SourceSpan): void {
    const inScope = this.currentScope.getInScopeSymbols();
    const suggestions = findTypoSuggestions(name, inScope, {
      maxDistance: 3,
      minConfidence: 0.45,
      limit: 3,
    });

    let symbolCandidate: SemanticRepairCandidate | undefined;
    let message = `Undeclared identifier '${name}'`;

    if (suggestions.length > 0) {
      const best = suggestions[0];
      symbolCandidate = {
        id: `sem-fix-${++candidateFixCounter}`,
        originalName: name,
        suggestedName: best.name,
        replacementSpan: span,
        distance: best.distance,
        similarity: best.similarity,
        confidence: best.confidence,
        matchPercentage: best.matchPercentage,
        symbol: best.symbol || {
          id: nextSymbolId('fallback'),
          name: best.name,
          typeSpecifier: 'unknown',
          span,
          kind: 'variable',
          scopeId: this.currentScope.id,
        },
        explanation: `Replace undeclared identifier '${name}' with in-scope '${best.name}' (${best.symbol?.typeSpecifier || 'symbol'})`,
      };
      message = `Undeclared identifier '${name}'. Did you mean '${best.name}'? (Dist: ${best.distance}, ${best.matchPercentage}% match)`;
      this.suggestions.push(symbolCandidate);
    }

    this.emitDiagnostic({
      severity: symbolCandidate ? 'warning' : 'error',
      semanticKind: 'undeclared-identifier',
      message,
      code: 'SEM_UNDECLARED_ID',
      span,
      symbolCandidate,
    });
  }

  private emitDiagnostic(diag: Omit<SemanticDiagnostic, 'id'>): void {
    this.diagnostics.push({
      ...diag,
      id: `sem-diag-${++diagnosticCounter}`,
    });
  }
}

/**
 * Convenient standalone entry point to analyze semantics of a Program AST.
 */
export function analyzeSemantics(ast: ProgramNode, _sourceCode?: string): SemanticAnalysisResult {
  const checker = new TypeChecker();
  return checker.check(ast);
}
