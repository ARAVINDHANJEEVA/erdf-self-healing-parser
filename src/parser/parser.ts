/**
 * Recursive descent statement parser and Pratt expression parser for MiniLang.
 * Operates purely and deterministically on an immutable token sequence or VirtualTokenStream.
 * Tracks call frames and delimiter stacks for checkpointing and speculative recovery.
 */

import {
  CallFrame,
  Diagnostic,
  ParserCheckpoint,
  SourceSpan,
  Token,
  TokenKind,
} from '../language/types';
import type {
  BlockStatementNode,
  ExpressionNode,
  IdentifierNode,
  LetDeclarationNode,
  ParameterNode,
  ProgramNode,
  StatementNode,
} from '../language/ast';
import {
  createAssignmentExpression,
  createBinaryExpression,
  createBlockStatement,
  createCallExpression,
  createExpressionStatement,
  createGroupExpression,
  createIdentifierNode,
  createIfStatement,
  createWhileStatement,
  createLetDeclaration,
  createVariableDeclaration,
  createFunctionDeclaration,
  createParameterNode,
  createReturnStatement,
  createForStatement,
  createPreprocessorDirective,
  createLiteralNode,
  createProgram,
  createUnaryExpression,
  resetAstNodeCounter,
  isSideEffectExpression,
  formatExpressionRepr,
} from '../language/ast';
import { Precedence, getInfixPrecedence, isRightAssociative } from './pratt';
import { isTypeKeyword, TOKEN_DISPLAY_NAMES } from '../language/tokenKinds';
import { VirtualTokenStream } from './virtualStream';
import { createCheckpoint } from './checkpoint';

export interface ParseResult {
  readonly ast: ProgramNode;
  readonly diagnostics: readonly Diagnostic[];
}

export function combineSpans(first: SourceSpan, last: SourceSpan): SourceSpan {
  return {
    start: first.start,
    end: last.end,
    line: first.line,
    column: first.column,
  };
}

export const MAX_CALL_STACK_DEPTH = 250;

export interface ParserEventListener {
  onTokenConsumed?: (token: Token, cursor: number, activeRule: string) => void;
  onSyntaxErrorDetected?: (
    actualToken: Token,
    expectedKinds: readonly TokenKind[],
    context: string,
    grammarRule: string,
    checkpointCursor: number,
    delimiterStack: readonly TokenKind[]
  ) => void;
  onPanicDiscard?: (
    discardedTokens: readonly Token[],
    syncSet: readonly string[],
    resyncToken: Token,
    partialNodeId: string
  ) => void;
  onCandidateGenerated?: (cand: any) => void;
  onCandidatePruned?: (cand: any, pruneReason: string) => void;
  onCandidateValidated?: (cand: any) => void;
  onCandidateRejected?: (cand: any, rejectReason: string) => void;
  onRepairSelected?: (rep: any, conf: any, altCount: number) => void;
  onRepairCommitted?: (rep: any, resultingLength: number) => void;
  onNodeCreated?: (stmt: StatementNode) => void;
}

export class Parser {
  // Changed from `readonly` to `protected` mutable so subclasses can safely
  // replace the stream after applying repair edits, without unsafe `(this as any)` casts.
  protected stream: VirtualTokenStream;
  protected diagnostics: Diagnostic[] = [];
  protected callFrames: CallFrame[] = [];
  protected delimiterStack: TokenKind[] = [];
  protected currentStatementStart: number = 0;
  protected listener?: ParserEventListener;
  protected isPanicMode: boolean = false;
  private lastConsumedToken: Token | null = null;

  constructor(
    tokens: readonly Token[] | VirtualTokenStream,
    initialCallFrames: readonly CallFrame[] = [],
    initialDelimiterStack: readonly TokenKind[] = [],
    initialStatementStart: number = 0,
    listener?: ParserEventListener
  ) {
    if (tokens instanceof VirtualTokenStream) {
      this.stream = tokens;
    } else {
      this.stream = new VirtualTokenStream(tokens, 0);
    }
    this.callFrames = [...initialCallFrames];
    this.delimiterStack = [...initialDelimiterStack];
    this.currentStatementStart = initialStatementStart;
    this.listener = listener;
  }

  public getActiveRule(): string {
    if (this.callFrames.length > 0) {
      return this.callFrames[this.callFrames.length - 1].rule;
    }
    return 'statement';
  }

  /**
   * Safely replaces the active token stream after a repair edit has been applied.
   * Subclasses should call this instead of casting to `any`.
   */
  protected setStream(newStream: VirtualTokenStream): void {
    this.stream = newStream;
  }

  public parse(): ParseResult {
    resetAstNodeCounter();
    const statements: StatementNode[] = [];
    const firstToken = this.peek();

    while (!this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        statements.push(stmt);
        this.listener?.onNodeCreated?.(stmt);
      } catch {
        // In clean parser, synchronize to semicolon or next keyword on unexpected exception
        this.synchronize();
      }
    }

    if (this.check('EOF') && !this.stream.isAtEnd()) {
      this.advance();
    }

    const lastToken = this.lastConsumedToken || firstToken;
    const programSpan = combineSpans(firstToken.span, lastToken.span);
    const ast = createProgram(statements, programSpan);

    return {
      ast,
      diagnostics: this.diagnostics,
    };
  }

  public captureCheckpoint(): ParserCheckpoint {
    return createCheckpoint(
      this.stream.cursor(),
      this.currentStatementStart,
      this.callFrames,
      this.delimiterStack,
      this.diagnostics.length
    );
  }

  public getCallFrames(): readonly CallFrame[] {
    return this.callFrames;
  }

  public getDelimiterStack(): readonly TokenKind[] {
    return this.delimiterStack;
  }

  public getDiagnostics(): readonly Diagnostic[] {
    return this.diagnostics;
  }

  // --- Call Frame Helpers ---

  protected withCallFrame<T>(rule: string, phase: string, action: () => T): T {
    if (this.callFrames.length >= MAX_CALL_STACK_DEPTH) {
      const actual = this.peek();
      const diagnostic: Diagnostic = {
        id: `diag-parse-recursion-${actual.span.start}`,
        severity: 'error',
        message: `Parser maximum recursion depth exceeded (${MAX_CALL_STACK_DEPTH} frames).`,
        span: actual.span,
        code: 'PARSE_MAX_RECURSION_EXCEEDED',
      };
      this.diagnostics.push(diagnostic);
      throw new Error(diagnostic.message);
    }

    this.callFrames.push({ rule, phase });
    try {
      return action();
    } finally {
      this.callFrames.pop();
    }
  }

  // --- Token Stream Accessors ---

  protected isAtEnd(): boolean {
    return this.stream.isAtEnd();
  }

  protected peek(offset: number = 0): Token {
    return this.stream.peek(offset);
  }

  protected previous(): Token {
    return this.lastConsumedToken || this.peek();
  }

  protected advance(): Token {
    const cursor = this.stream.cursor();
    const token = this.stream.consume();
    this.lastConsumedToken = token;

    // Track unclosed delimiters
    if (token.kind === 'LPAREN' || token.kind === 'LBRACE') {
      this.delimiterStack.push(token.kind);
    } else if (token.kind === 'RPAREN') {
      if (this.delimiterStack.length > 0 && this.delimiterStack[this.delimiterStack.length - 1] === 'LPAREN') {
        this.delimiterStack.pop();
      }
    } else if (token.kind === 'RBRACE') {
      if (this.delimiterStack.length > 0 && this.delimiterStack[this.delimiterStack.length - 1] === 'LBRACE') {
        this.delimiterStack.pop();
      }
    }

    if (!this.isPanicMode) {
      const activeRule = this.getActiveRule();
      this.listener?.onTokenConsumed?.(token, cursor, activeRule);
    }

    return token;
  }

  protected check(kind: TokenKind): boolean {
    if (this.isAtEnd()) return kind === 'EOF';
    return this.peek().kind === kind;
  }

  protected match(...kinds: TokenKind[]): boolean {
    for (const kind of kinds) {
      if (this.check(kind)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  protected expect(expected: TokenKind, context: string): Token {
    const actual = this.peek();
    if (actual.kind === expected) {
      return this.advance();
    }

    const expectedName = TOKEN_DISPLAY_NAMES[expected] || expected;
    const actualName = TOKEN_DISPLAY_NAMES[actual.kind] || actual.kind;

    const diagnostic: Diagnostic = {
      id: `diag-parse-${actual.span.start}`,
      severity: 'error',
      message: `Expected '${expectedName}' in ${context}, but found '${actualName}'.`,
      span: actual.span,
      code: `PARSE_EXPECTED_${expected}`,
    };

    this.diagnostics.push(diagnostic);
    throw new Error(diagnostic.message);
  }

  protected synchronize(): void {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.previous().kind === 'SEMICOLON') return;
      const k = this.peek().kind;
      if (isTypeKeyword(k)) return;
      switch (k) {
        case 'LET':
        case 'IF':
        case 'WHILE':
        case 'FOR':
        case 'RETURN':
        case 'PREPROCESSOR':
        case 'LBRACE':
        case 'RBRACE':
          return;
      }
      this.advance();
    }
  }

  // --- Statement Parsing ---

  public parseStatement(): StatementNode {
    this.currentStatementStart = this.stream.cursor();
    return this.withCallFrame('statement', 'dispatch', () => {
      // Preprocessor directive: #include <stdio.h>, #define ...
      if (this.check('PREPROCESSOR')) {
        const tok = this.advance();
        return createPreprocessorDirective(tok.lexeme, tok.span);
      }

      // Return statement: return 0;
      if (this.check('RETURN')) {
        return this.parseReturnStatement();
      }

      // For loop: for (int i = 0; i < 10; i++) { ... }
      if (this.check('FOR')) {
        return this.parseForStatement();
      }

      // Let declaration
      if (this.check('LET')) {
        return this.parseLetDeclaration();
      }

      // If statement
      if (this.check('IF')) {
        return this.parseIfStatement();
      }

      // While statement
      if (this.check('WHILE')) {
        return this.parseWhileStatement();
      }

      // Block statement
      if (this.check('LBRACE')) {
        return this.parseBlockStatement();
      }

      // C Typed Declaration (Function or Variable)
      if (isTypeKeyword(this.peek().kind)) {
        return this.parseTypeDeclaration();
      }

      // Empty statement ;
      if (this.match('SEMICOLON')) {
        const span = this.previous().span;
        return createExpressionStatement(createLiteralNode(0, '0', 'number', span), span);
      }

      return this.parseExpressionStatement();
    });
  }

  protected parseTypeDeclaration(): StatementNode {
    return this.withCallFrame('typeDecl', 'body', () => {
      const typeToken = this.advance(); // e.g. int, float, void, char, etc.
      let isPointer = false;
      while (this.match('STAR')) {
        isPointer = true;
      }

      const nameToken = this.expect('IDENT', 'declaration name');
      const identifier = createIdentifierNode(nameToken.lexeme, nameToken.span);

      // If next token is '(', it is a Function Declaration or Definition!
      if (this.check('LPAREN')) {
        this.advance(); // consume '('
        const params: ParameterNode[] = [];
        if (!this.check('RPAREN')) {
          do {
            if (this.isAtEnd() || this.check('RPAREN')) break;
            this.withCallFrame('parameter', 'signature', () => {
              const paramTypeToken = this.advance();
              let paramIsPointer = false;
              while (this.match('STAR')) {
                paramIsPointer = true;
              }
              if (this.check('IDENT')) {
                const pName = this.advance();
                const pSpan = combineSpans(paramTypeToken.span, pName.span);
                params.push(
                  createParameterNode(
                    paramTypeToken.lexeme,
                    createIdentifierNode(pName.lexeme, pName.span),
                    pSpan,
                    paramIsPointer
                  )
                );
              } else {
                params.push(
                  createParameterNode(
                    paramTypeToken.lexeme,
                    createIdentifierNode('', paramTypeToken.span),
                    paramTypeToken.span,
                    paramIsPointer
                  )
                );
              }
            });
          } while (this.match('COMMA'));
        }
        this.expect('RPAREN', "closing parenthesis in parameter list (')')");

        // Function body or prototype
        if (this.check('LBRACE')) {
          const body = this.parseBlockStatement() as BlockStatementNode;
          const span = combineSpans(typeToken.span, body.span);
          return createFunctionDeclaration(typeToken.lexeme, identifier, params, body, span);
        } else {
          // Prototype: int add(int a, int b);
          const semi = this.expect('SEMICOLON', 'function prototype semicolon');
          const emptyBlock = createBlockStatement([], semi.span);
          const span = combineSpans(typeToken.span, semi.span);
          return createFunctionDeclaration(typeToken.lexeme, identifier, params, emptyBlock, span);
        }
      }

      // Otherwise, it is a Variable Declaration: int x = 10; or int x;
      let initializer: ExpressionNode | undefined = undefined;
      if (this.match('ASSIGN')) {
        initializer = this.parseExpression(Precedence.NONE);
      }
      const semicolon = this.expect('SEMICOLON', 'variable declaration semicolon');
      const span = combineSpans(typeToken.span, semicolon.span);
      return createVariableDeclaration(typeToken.lexeme, identifier, initializer, span, isPointer);
    });
  }

  protected parseReturnStatement(): StatementNode {
    return this.withCallFrame('returnStmt', 'body', () => {
      const returnToken = this.advance(); // consume 'return'
      let value: ExpressionNode | undefined = undefined;
      if (!this.check('SEMICOLON')) {
        value = this.parseExpression(Precedence.NONE);
      }
      const semicolon = this.expect('SEMICOLON', 'return statement');
      const span = combineSpans(returnToken.span, semicolon.span);
      return createReturnStatement(value, span);
    });
  }

  protected parseForStatement(): StatementNode {
    return this.withCallFrame('forStmt', 'body', () => {
      const forToken = this.advance(); // consume 'for'
      this.expect('LPAREN', "for loop ('(')");

      let initializer: StatementNode | undefined = undefined;
      if (this.match('SEMICOLON')) {
        // empty initializer
      } else if (this.check('LET')) {
        initializer = this.parseLetDeclaration();
      } else if (isTypeKeyword(this.peek().kind)) {
        initializer = this.parseTypeDeclaration();
      } else {
        initializer = this.parseExpressionStatement();
      }

      let condition: ExpressionNode | undefined = undefined;
      if (!this.check('SEMICOLON')) {
        condition = this.parseExpression(Precedence.NONE);
      }
      this.expect('SEMICOLON', "for loop condition (';')");

      let increment: ExpressionNode | undefined = undefined;
      if (!this.check('RPAREN')) {
        increment = this.parseExpression(Precedence.NONE);
      }
      this.expect('RPAREN', "for loop increment (')')");

      const body = this.parseStatement();
      const span = combineSpans(forToken.span, body.span);
      return createForStatement(initializer, condition, increment, body, span);
    });
  }

  protected parseLetDeclaration(): LetDeclarationNode {
    return this.withCallFrame('letDecl', 'body', () => {
      const letToken = this.advance(); // consume 'let'
      const nameToken = this.expect('IDENT', 'let declaration');
      const identifier = createIdentifierNode(nameToken.lexeme, nameToken.span);

      this.expect('ASSIGN', "let declaration after variable name ('=')");
      const initializer = this.parseExpression(Precedence.NONE);
      const semicolon = this.expect('SEMICOLON', 'let declaration');

      const span = combineSpans(letToken.span, semicolon.span);
      return createLetDeclaration(identifier, initializer, span);
    });
  }

  protected parseIfStatement(): StatementNode {
    return this.withCallFrame('ifStmt', 'body', () => {
      const ifToken = this.advance(); // consume 'if'
      this.expect('LPAREN', "if condition ('(')");
      const condition = this.parseExpression(Precedence.NONE);
      this.expect('RPAREN', "if condition (')')");

      const thenBranch = this.parseStatement();
      let elseBranch: StatementNode | undefined = undefined;

      if (this.match('ELSE')) {
        elseBranch = this.parseStatement();
      }

      const endSpan = elseBranch ? elseBranch.span : thenBranch.span;
      const span = combineSpans(ifToken.span, endSpan);
      return createIfStatement(condition, thenBranch, elseBranch, span);
    });
  }

  protected parseWhileStatement(): StatementNode {
    return this.withCallFrame('whileStmt', 'body', () => {
      const whileToken = this.advance(); // consume 'while'
      this.expect('LPAREN', "while condition ('(')");
      const condition = this.parseExpression(Precedence.NONE);
      this.expect('RPAREN', "while condition (')')");

      const body = this.parseStatement();
      const span = combineSpans(whileToken.span, body.span);
      return createWhileStatement(condition, body, span);
    });
  }

  protected parseBlockStatement(): StatementNode {
    return this.withCallFrame('block', 'body', () => {
      const openBrace = this.advance(); // consume '{'
      const statements: StatementNode[] = [];

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        if (this.check('ELSE')) {
          break;
        }
        statements.push(this.parseStatement());
      }

      const closeBrace = this.expect('RBRACE', "closing block brace ('}')");
      const span = combineSpans(openBrace.span, closeBrace.span);
      return createBlockStatement(statements, span);
    });
  }

  protected parseExpressionStatement(): StatementNode {
    return this.withCallFrame('exprStmt', 'body', () => {
      const expr = this.parseExpression(Precedence.NONE);
      const semicolon = this.expect('SEMICOLON', 'expression statement');
      const span = combineSpans(expr.span, semicolon.span);

      if (!isSideEffectExpression(expr)) {
        const repr = formatExpressionRepr(expr);
        const diag: Diagnostic = {
          id: `diag-parse-no-effect-${expr.span.start}`,
          severity: 'error',
          message: `Statement has no effect. Expression ${repr} is not an assignment, call, or increment/decrement.`,
          span: expr.span,
          code: 'PARSE_STATEMENT_NO_EFFECT',
        };
        this.diagnostics.push(diag);
      }

      return createExpressionStatement(expr, span);
    });
  }

  // --- Pratt Expression Parsing ---

  public parseExpression(minPrecedence: Precedence = Precedence.NONE): ExpressionNode {
    return this.withCallFrame('expression', 'pratt', () => {
      let left = this.parsePrefix();

      while (!this.isAtEnd()) {
        const nextKind = this.peek().kind;
        const infixPrec = getInfixPrecedence(nextKind);

        if (infixPrec === Precedence.NONE) {
          break;
        }

        const rightAssoc = isRightAssociative(infixPrec);
        if (rightAssoc ? infixPrec < minPrecedence : infixPrec <= minPrecedence) {
          break;
        }

        left = this.parseInfix(left, infixPrec);
      }

      return left;
    });
  }

  protected parsePrefix(): ExpressionNode {
    const token = this.peek();

    // Grouping: ( expr )
    if (token.kind === 'LPAREN') {
      const openParen = this.advance();
      const expr = this.parseExpression(Precedence.NONE);
      const closeParen = this.expect('RPAREN', "group expression (')')");
      const span = combineSpans(openParen.span, closeParen.span);
      return createGroupExpression(expr, span);
    }

    // Boolean literal
    if (token.kind === 'TRUE' || token.kind === 'FALSE') {
      const tok = this.advance();
      return createLiteralNode(tok.kind === 'TRUE', tok.lexeme, 'boolean', tok.span);
    }

    // Character literal
    if (token.kind === 'CHAR_LITERAL') {
      const tok = this.advance();
      const unquoted = tok.lexeme.slice(1, -1);
      return createLiteralNode(unquoted, tok.lexeme, 'string', tok.span);
    }

    // Unary: !, -, ++, --, * (dereference), & (address-of)
    if (
      token.kind === 'BANG' ||
      token.kind === 'MINUS' ||
      token.kind === 'PLUS_PLUS' ||
      token.kind === 'MINUS_MINUS' ||
      token.kind === 'STAR' ||
      token.kind === 'AMPERSAND'
    ) {
      const opToken = this.advance();
      const operand = this.parseExpression(Precedence.UNARY);
      const span = combineSpans(opToken.span, operand.span);
      return createUnaryExpression(opToken.lexeme, operand, span);
    }

    // Number literal
    if (token.kind === 'NUMBER') {
      const numToken = this.advance();
      const value = parseFloat(numToken.lexeme);
      return createLiteralNode(value, numToken.lexeme, 'number', numToken.span);
    }

    // String literal
    if (token.kind === 'STRING') {
      const strToken = this.advance();
      const unquoted = strToken.lexeme.slice(1, -1);
      return createLiteralNode(unquoted, strToken.lexeme, 'string', strToken.span);
    }

    // Identifier
    if (token.kind === 'IDENT') {
      const idToken = this.advance();
      return createIdentifierNode(idToken.lexeme, idToken.span);
    }

    // Mismatched token in prefix position
    const diagnostic: Diagnostic = {
      id: `diag-parse-${token.span.start}`,
      severity: 'error',
      message: `Expected expression, but found '${token.lexeme || token.kind}'.`,
      span: token.span,
      code: 'PARSE_EXPECTED_EXPRESSION',
    };
    this.diagnostics.push(diagnostic);
    throw new Error(diagnostic.message);
  }

  protected parseInfix(left: ExpressionNode, precedence: Precedence): ExpressionNode {
    const token = this.advance();

    // Postfix: x++ or x--
    if (token.kind === 'PLUS_PLUS' || token.kind === 'MINUS_MINUS') {
      const span = combineSpans(left.span, token.span);
      return createUnaryExpression(`postfix_${token.lexeme}`, left, span);
    }

    // Array subscript: arr[index]
    if (token.kind === 'LBRACKET') {
      const index = this.parseExpression(Precedence.NONE);
      const closeBracket = this.expect('RBRACKET', "array subscript (']')");
      const span = combineSpans(left.span, closeBracket.span);
      return createBinaryExpression(left, '[]', index, span);
    }

    // Member access: obj.member or ptr->member
    if (token.kind === 'DOT' || token.kind === 'ARROW') {
      const member = this.expect('IDENT', 'member name');
      const right = createIdentifierNode(member.lexeme, member.span);
      const span = combineSpans(left.span, member.span);
      return createBinaryExpression(left, token.lexeme, right, span);
    }

    // Assignment & Compound Assignments: =, +=, -=, *=, /=, %=
    if (
      token.kind === 'ASSIGN' ||
      token.kind === 'PLUS_EQUAL' ||
      token.kind === 'MINUS_EQUAL' ||
      token.kind === 'STAR_EQUAL' ||
      token.kind === 'SLASH_EQUAL' ||
      token.kind === 'PERCENT_EQUAL'
    ) {
      if (left.kind !== 'IdentifierNode') {
        const diag: Diagnostic = {
          id: `diag-parse-${left.span.start}`,
          severity: 'error',
          message: 'Invalid assignment target. Left-hand side must be an identifier.',
          span: left.span,
          code: 'PARSE_INVALID_ASSIGNMENT_TARGET',
        };
        this.diagnostics.push(diag);
      }
      const assignee = left as IdentifierNode;
      const value = this.parseExpression(precedence);
      const span = combineSpans(assignee.span, value.span);
      return createAssignmentExpression(assignee, value, span);
    }

    // Function call: callee(arg1, arg2, ...)
    if (token.kind === 'LPAREN') {
      const args: ExpressionNode[] = [];
      if (!this.check('RPAREN')) {
        do {
          args.push(this.parseExpression(Precedence.NONE));
        } while (this.match('COMMA'));
      }
      const closeParen = this.expect('RPAREN', "function arguments list (')')");
      const span = combineSpans(left.span, closeParen.span);
      return createCallExpression(left, args, span);
    }

    // Standard binary operators
    const nextPrecedence = isRightAssociative(precedence) ? precedence : precedence;
    const right = this.parseExpression(nextPrecedence);
    const span = combineSpans(left.span, right.span);
    return createBinaryExpression(left, token.lexeme, right, span);
  }
}

/**
 * Parses an immutable token array into an AST without recovery.
 */
export function parseClean(tokens: readonly Token[]): ParseResult {
  const parser = new Parser(tokens);
  return parser.parse();
}
