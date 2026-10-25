import { describe, it, expect } from 'vitest';
import { tokenize, createSyntheticToken } from '../../src/language/lexer';
import { TokenKind } from '../../src/language/types';

describe('MiniLang Lexer (Stage 2)', () => {
  it('tokenizes all MiniLang keywords correctly', () => {
    const source = 'let if else while';
    const { tokens, diagnostics } = tokenize(source);

    expect(diagnostics).toHaveLength(0);
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual(['LET', 'IF', 'ELSE', 'WHILE', 'EOF']);
  });

  it('tokenizes identifiers and numbers (integers & decimals)', () => {
    const source = 'let count = 42;\nlet pi = 3.14159;\nlet total_sum = 0;';
    const { tokens, diagnostics } = tokenize(source);

    expect(diagnostics).toHaveLength(0);
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual([
      'LET', 'IDENT', 'ASSIGN', 'NUMBER', 'SEMICOLON',
      'LET', 'IDENT', 'ASSIGN', 'NUMBER', 'SEMICOLON',
      'LET', 'IDENT', 'ASSIGN', 'NUMBER', 'SEMICOLON',
      'EOF',
    ]);

    expect(tokens[1].lexeme).toBe('count');
    expect(tokens[3].lexeme).toBe('42');
    expect(tokens[8].lexeme).toBe('3.14159');
    expect(tokens[11].lexeme).toBe('total_sum');
    expect(tokens[13].lexeme).toBe('0');
  });

  it('tokenizes strings with escape sequences', () => {
    const source = 'let message = "hello \\"world\\"\\n";';
    const { tokens, diagnostics } = tokenize(source);

    expect(diagnostics).toHaveLength(0);
    expect(tokens[3].kind).toBe('STRING');
    expect(tokens[3].lexeme).toBe('"hello \\"world\\"\\n"');
  });

  it('tokenizes all operators and delimiters', () => {
    const source = '+ - * / = == != < <= > >= ! && || ( ) { } , ;';
    const { tokens, diagnostics } = tokenize(source);

    expect(diagnostics).toHaveLength(0);
    const expectedKinds: TokenKind[] = [
      'PLUS', 'MINUS', 'STAR', 'SLASH',
      'ASSIGN', 'EQUAL', 'NOT_EQUAL',
      'LESS', 'LESS_EQUAL', 'GREATER', 'GREATER_EQUAL',
      'BANG', 'AND', 'OR',
      'LPAREN', 'RPAREN', 'LBRACE', 'RBRACE', 'COMMA', 'SEMICOLON',
      'EOF',
    ];

    expect(tokens.map((t) => t.kind)).toEqual(expectedKinds);
  });

  it('verifies exact source span slicing for every emitted source token', () => {
    const source = `
      // Calculate tax and total
      let price = 100;
      let tax = (price * 0.15);
      if (tax > 10) {
        let flag = "high";
      } else {
        let flag = "low";
      }
    `;

    const { tokens, diagnostics } = tokenize(source);
    expect(diagnostics).toHaveLength(0);

    for (const token of tokens) {
      if (token.kind === 'EOF') {
        expect(token.span.start).toBe(source.length);
        expect(token.span.end).toBe(source.length);
        continue;
      }
      const sliced = source.slice(token.span.start, token.span.end);
      expect(sliced).toBe(token.lexeme);
      expect(token.origin).toBe('source');
    }
  });

  it('accurately tracks line numbers and 1-based column numbers', () => {
    const source = 'let x = 10;\nlet y = 20;';
    const { tokens } = tokenize(source);

    // Line 1: let (col 1), x (col 5), = (col 7), 10 (col 9), ; (col 11)
    expect(tokens[0].span).toMatchObject({ line: 1, column: 1, start: 0, end: 3 });
    expect(tokens[1].span).toMatchObject({ line: 1, column: 5, start: 4, end: 5 });
    expect(tokens[2].span).toMatchObject({ line: 1, column: 7, start: 6, end: 7 });
    expect(tokens[3].span).toMatchObject({ line: 1, column: 9, start: 8, end: 10 });
    expect(tokens[4].span).toMatchObject({ line: 1, column: 11, start: 10, end: 11 });

    // Line 2: let (col 1), y (col 5), = (col 7), 20 (col 9), ; (col 11)
    expect(tokens[5].span).toMatchObject({ line: 2, column: 1, start: 12, end: 15 });
    expect(tokens[6].span).toMatchObject({ line: 2, column: 5, start: 16, end: 17 });
  });

  it('handles single-line and multi-line comments cleanly', () => {
    const source = `
      // Initial comment
      let a = 1; /* inline block comment */
      /* Multi
         line
         comment */
      let b = 2;
    `;

    const { tokens, comments, diagnostics } = tokenize(source);
    expect(diagnostics).toHaveLength(0);
    expect(comments).toHaveLength(3);

    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual([
      'LET', 'IDENT', 'ASSIGN', 'NUMBER', 'SEMICOLON',
      'LET', 'IDENT', 'ASSIGN', 'NUMBER', 'SEMICOLON',
      'EOF',
    ]);
  });

  it('emits diagnostic for unterminated string without crashing', () => {
    const source = 'let str = "unclosed string;\nlet x = 10;';
    const { tokens, diagnostics } = tokenize(source);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('LEX_UNTERMINATED_STRING');
    expect(tokens[3].kind).toBe('ERROR');
    // Lexer continues to parse following line
    expect(tokens[4].kind).toBe('LET');
    expect(tokens[5].lexeme).toBe('x');
  });

  it('emits diagnostic for unterminated block comment', () => {
    const source = '/* unterminated block comment';
    const { diagnostics } = tokenize(source);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('LEX_UNTERMINATED_COMMENT');
  });

  it('emits diagnostic and ERROR token for invalid characters', () => {
    const source = 'let x = @ + #;';
    const { tokens, diagnostics } = tokenize(source);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].code).toBe('LEX_UNEXPECTED_CHAR');
    expect(diagnostics[1].code).toBe('LEX_UNEXPECTED_CHAR');

    const errorTokens = tokens.filter((t) => t.kind === 'ERROR');
    expect(errorTokens).toHaveLength(2);
    expect(errorTokens[0].lexeme).toBe('@');
    expect(errorTokens[1].lexeme).toBe('#');
  });

  it('creates synthetic tokens with proper origin and anchor span', () => {
    const anchor = { start: 15, end: 16, line: 2, column: 10 };
    const synthToken = createSyntheticToken('RPAREN', ')', anchor, 'Inserted missing closing parenthesis', 1);

    expect(synthToken.origin).toBe('synthetic');
    expect(synthToken.kind).toBe('RPAREN');
    expect(synthToken.lexeme).toBe(')');
    expect(synthToken.syntheticReason).toBe('Inserted missing closing parenthesis');
    expect(synthToken.span.start).toBe(15);
    expect(synthToken.span.end).toBe(15);
  });
});
