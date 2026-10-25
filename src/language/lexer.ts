/**
 * High-precision, location-aware lexer for MiniLang.
 * Emits immutable tokens with source spans and coordinates (0-based offset, 1-based line/col).
 */

import { Diagnostic, SourceSpan, Token, TokenKind, TokenOrigin } from './types';
import { KEYWORDS } from './tokenKinds';

export interface LexerResult {
  readonly tokens: Token[];
  readonly diagnostics: Diagnostic[];
  readonly comments: Token[];
}

export class Lexer {
  private readonly source: string;
  private readonly length: number;
  private cursor: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokenIndex: number = 0;
  private diagnostics: Diagnostic[] = [];
  private comments: Token[] = [];
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
    this.length = source.length;
  }

  public tokenize(): LexerResult {
    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd()) break;

      const token = this.scanToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    // Terminal EOF token
    const eofSpan: SourceSpan = {
      start: this.length,
      end: this.length,
      line: this.line,
      column: this.column,
    };

    const eofToken: Token = {
      id: `tok-${this.tokenIndex++}-${this.length}-${this.length}`,
      kind: 'EOF',
      lexeme: '',
      span: eofSpan,
      origin: 'source',
    };
    this.tokens.push(eofToken);

    return {
      tokens: this.tokens,
      diagnostics: this.diagnostics,
      comments: this.comments,
    };
  }

  private isAtEnd(): boolean {
    return this.cursor >= this.length;
  }

  private peek(offset: number = 0): string {
    const pos = this.cursor + offset;
    return pos < this.length ? this.source[pos] : '\0';
  }

  private advance(): string {
    const ch = this.source[this.cursor++];
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd() || this.source[this.cursor] !== expected) {
      return false;
    }
    this.advance();
    return true;
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();

      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
      } else if (ch === '/' && this.peek(1) === '/') {
        // Single line comment
        const start = this.cursor;
        const line = this.line;
        const column = this.column;
        this.advance(); // consume '/'
        this.advance(); // consume '/'
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
        const commentLexeme = this.source.slice(start, this.cursor);
        this.comments.push({
          id: `comment-${start}-${this.cursor}`,
          kind: 'ERROR', // comment trivia
          lexeme: commentLexeme,
          span: { start, end: this.cursor, line, column },
          origin: 'source',
        });
      } else if (ch === '/' && this.peek(1) === '*') {
        // Multi-line block comment
        const start = this.cursor;
        const line = this.line;
        const column = this.column;
        this.advance(); // consume '/'
        this.advance(); // consume '*'

        let closed = false;
        while (!this.isAtEnd()) {
          if (this.peek() === '*' && this.peek(1) === '/') {
            this.advance(); // consume '*'
            this.advance(); // consume '/'
            closed = true;
            break;
          }
          this.advance();
        }

        const commentSpan: SourceSpan = {
          start,
          end: this.cursor,
          line,
          column,
        };

        if (!closed) {
          this.diagnostics.push({
            id: `diag-lex-${start}`,
            severity: 'error',
            message: 'Unterminated block comment.',
            span: commentSpan,
            code: 'LEX_UNTERMINATED_COMMENT',
          });
        }

        this.comments.push({
          id: `comment-${start}-${this.cursor}`,
          kind: 'ERROR',
          lexeme: this.source.slice(start, this.cursor),
          span: commentSpan,
          origin: 'source',
        });
      } else {
        break;
      }
    }
  }

  private scanToken(): Token | null {
    const start = this.cursor;
    const line = this.line;
    const column = this.column;

    const ch = this.advance();

    // Identifiers or keywords
    if (this.isAlpha(ch)) {
      while (this.isAlphaNumeric(this.peek())) {
        this.advance();
      }
      const lexeme = this.source.slice(start, this.cursor);
      const kind = KEYWORDS[lexeme] || 'IDENT';
      return this.createToken(kind, lexeme, start, this.cursor, line, column);
    }

    // Numbers (integer or decimal)
    if (this.isDigit(ch)) {
      while (this.isDigit(this.peek())) {
        this.advance();
      }
      // Check decimal point followed by digit
      if (this.peek() === '.' && this.isDigit(this.peek(1))) {
        this.advance(); // consume '.'
        while (this.isDigit(this.peek())) {
          this.advance();
        }
      }
      const lexeme = this.source.slice(start, this.cursor);
      return this.createToken('NUMBER', lexeme, start, this.cursor, line, column);
    }

    // String literals
    if (ch === '"') {
      return this.scanString(start, line, column);
    }

    // Character literals
    if (ch === '\'') {
      return this.scanChar(start, line, column);
    }

    // Preprocessor directives: #include <stdio.h>, #define ...
    if (ch === '#') {
      let tempOffset = 0;
      while (this.peek(tempOffset) === ' ' || this.peek(tempOffset) === '\t') {
        tempOffset++;
      }
      let directiveWord = '';
      let wIdx = tempOffset;
      while (this.isAlpha(this.peek(wIdx))) {
        directiveWord += this.peek(wIdx);
        wIdx++;
      }
      const isDirective =
        directiveWord === 'include' ||
        directiveWord === 'define' ||
        directiveWord === 'pragma' ||
        directiveWord === 'ifdef' ||
        directiveWord === 'ifndef' ||
        directiveWord === 'endif' ||
        directiveWord === 'if' ||
        directiveWord === 'else' ||
        directiveWord === 'elif' ||
        directiveWord === 'undef' ||
        directiveWord === 'error' ||
        directiveWord === 'warning';

      if (isDirective) {
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
        const lexeme = this.source.slice(start, this.cursor).trim();
        return this.createToken('PREPROCESSOR', lexeme, start, this.cursor, line, column);
      }
    }

    // Single or double character operators & delimiters
    switch (ch) {
      case '(':
        return this.createToken('LPAREN', '(', start, this.cursor, line, column);
      case ')':
        return this.createToken('RPAREN', ')', start, this.cursor, line, column);
      case '{':
        return this.createToken('LBRACE', '{', start, this.cursor, line, column);
      case '}':
        return this.createToken('RBRACE', '}', start, this.cursor, line, column);
      case '[':
        return this.createToken('LBRACKET', '[', start, this.cursor, line, column);
      case ']':
        return this.createToken('RBRACKET', ']', start, this.cursor, line, column);
      case ':':
        return this.createToken('COLON', ':', start, this.cursor, line, column);
      case '?':
        return this.createToken('QUESTION', '?', start, this.cursor, line, column);
      case '.':
        return this.createToken('DOT', '.', start, this.cursor, line, column);
      case '~':
        return this.createToken('TILDE', '~', start, this.cursor, line, column);
      case '^':
        return this.createToken('CARET', '^', start, this.cursor, line, column);
      case '%':
        if (this.match('=')) {
          return this.createToken('PERCENT_EQUAL', '%=', start, this.cursor, line, column);
        }
        return this.createToken('PERCENT', '%', start, this.cursor, line, column);
      case ',':
        return this.createToken('COMMA', ',', start, this.cursor, line, column);
      case ';':
        return this.createToken('SEMICOLON', ';', start, this.cursor, line, column);
      case '+':
        if (this.match('+')) {
          return this.createToken('PLUS_PLUS', '++', start, this.cursor, line, column);
        }
        if (this.match('=')) {
          return this.createToken('PLUS_EQUAL', '+=', start, this.cursor, line, column);
        }
        return this.createToken('PLUS', '+', start, this.cursor, line, column);
      case '-':
        if (this.match('-')) {
          return this.createToken('MINUS_MINUS', '--', start, this.cursor, line, column);
        }
        if (this.match('=')) {
          return this.createToken('MINUS_EQUAL', '-=', start, this.cursor, line, column);
        }
        if (this.match('>')) {
          return this.createToken('ARROW', '->', start, this.cursor, line, column);
        }
        return this.createToken('MINUS', '-', start, this.cursor, line, column);
      case '*':
        if (this.match('=')) {
          return this.createToken('STAR_EQUAL', '*=', start, this.cursor, line, column);
        }
        return this.createToken('STAR', '*', start, this.cursor, line, column);
      case '/':
        if (this.match('=')) {
          return this.createToken('SLASH_EQUAL', '/=', start, this.cursor, line, column);
        }
        return this.createToken('SLASH', '/', start, this.cursor, line, column);
      case '=':
        if (this.match('=')) {
          return this.createToken('EQUAL', '==', start, this.cursor, line, column);
        }
        return this.createToken('ASSIGN', '=', start, this.cursor, line, column);
      case '!':
        if (this.match('=')) {
          return this.createToken('NOT_EQUAL', '!=', start, this.cursor, line, column);
        }
        return this.createToken('BANG', '!', start, this.cursor, line, column);
      case '<':
        if (this.match('<')) {
          return this.createToken('SHIFT_LEFT', '<<', start, this.cursor, line, column);
        }
        if (this.match('=')) {
          return this.createToken('LESS_EQUAL', '<=', start, this.cursor, line, column);
        }
        return this.createToken('LESS', '<', start, this.cursor, line, column);
      case '>':
        if (this.match('>')) {
          return this.createToken('SHIFT_RIGHT', '>>', start, this.cursor, line, column);
        }
        if (this.match('=')) {
          return this.createToken('GREATER_EQUAL', '>=', start, this.cursor, line, column);
        }
        return this.createToken('GREATER', '>', start, this.cursor, line, column);
      case '&':
        if (this.match('&')) {
          return this.createToken('AND', '&&', start, this.cursor, line, column);
        }
        return this.createToken('AMPERSAND', '&', start, this.cursor, line, column);
      case '|':
        if (this.match('|')) {
          return this.createToken('OR', '||', start, this.cursor, line, column);
        }
        return this.createToken('PIPE', '|', start, this.cursor, line, column);
    }

    // Invalid character
    const invalidChar = this.source.slice(start, this.cursor);
    const span: SourceSpan = { start, end: this.cursor, line, column };
    this.diagnostics.push({
      id: `diag-lex-${start}`,
      severity: 'error',
      message: `Unexpected character: '${invalidChar}'`,
      span,
      code: 'LEX_UNEXPECTED_CHAR',
    });

    return this.createToken('ERROR', invalidChar, start, this.cursor, line, column);
  }

  private scanString(start: number, line: number, column: number): Token {
    let hasError = false;

    while (!this.isAtEnd() && this.peek() !== '"' && this.peek() !== '\n') {
      if (this.peek() === '\\') {
        this.advance(); // consume '\'
        if (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance(); // consume escaped char
        }
      } else {
        this.advance();
      }
    }

    if (this.isAtEnd() || this.peek() === '\n') {
      hasError = true;
      const span: SourceSpan = { start, end: this.cursor, line, column };
      this.diagnostics.push({
        id: `diag-lex-${start}`,
        severity: 'error',
        message: 'Unterminated string literal.',
        span,
        code: 'LEX_UNTERMINATED_STRING',
      });
      return this.createToken('ERROR', this.source.slice(start, this.cursor), start, this.cursor, line, column);
    }

    // Consume closing quote
    this.advance();

    const lexeme = this.source.slice(start, this.cursor);
    return this.createToken(
      hasError ? 'ERROR' : 'STRING',
      lexeme,
      start,
      this.cursor,
      line,
      column
    );
  }

  private scanChar(start: number, line: number, column: number): Token {
    while (!this.isAtEnd() && this.peek() !== '\'' && this.peek() !== '\n') {
      if (this.peek() === '\\') {
        this.advance();
      }
      this.advance();
    }
    if (this.isAtEnd() || this.peek() === '\n') {
      const span: SourceSpan = { start, end: this.cursor, line, column };
      this.diagnostics.push({
        id: `diag-lex-${start}`,
        severity: 'error',
        message: 'Unterminated character literal.',
        span,
        code: 'LEX_UNTERMINATED_CHAR',
      });
      return this.createToken('ERROR', this.source.slice(start, this.cursor), start, this.cursor, line, column);
    }
    this.advance(); // consume closing quote
    const lexeme = this.source.slice(start, this.cursor);
    return this.createToken('CHAR_LITERAL', lexeme, start, this.cursor, line, column);
  }

  private createToken(
    kind: TokenKind,
    lexeme: string,
    start: number,
    end: number,
    line: number,
    column: number,
    origin: TokenOrigin = 'source',
    syntheticReason?: string
  ): Token {
    return {
      id: `tok-${this.tokenIndex++}-${start}-${end}`,
      kind,
      lexeme,
      span: { start, end, line, column },
      origin,
      syntheticReason,
    };
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch);
  }
}

/**
 * Convenience helper function to tokenize a MiniLang source string.
 */
export function tokenize(source: string): LexerResult {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}

/**
 * Creates a synthetic / ghost token anchored at a reference location.
 */
export function createSyntheticToken(
  kind: TokenKind,
  lexeme: string,
  anchorSpan: SourceSpan,
  reason: string,
  syntheticIndex: number = 0
): Token {
  return {
    id: `synth-${kind.toLowerCase()}-${syntheticIndex}-${anchorSpan.start}`,
    kind,
    lexeme,
    span: {
      start: anchorSpan.start,
      end: anchorSpan.start, // 0-width span anchored at repair point
      line: anchorSpan.line,
      column: anchorSpan.column,
    },
    origin: 'synthetic',
    syntheticReason: reason,
  };
}
