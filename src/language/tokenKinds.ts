/**
 * C (C99/C11) and MiniLang token kinds, keyword dictionaries, and classification helpers.
 */

export type TokenKind =
  // Keywords (MiniLang + C)
  | 'LET'
  | 'IF'
  | 'ELSE'
  | 'WHILE'
  | 'FOR'
  | 'DO'
  | 'RETURN'
  | 'SWITCH'
  | 'CASE'
  | 'BREAK'
  | 'CONTINUE'
  | 'DEFAULT'
  | 'SIZEOF'
  // C Types
  | 'INT'
  | 'FLOAT'
  | 'DOUBLE'
  | 'CHAR'
  | 'VOID'
  | 'BOOL'
  | 'LONG'
  | 'SHORT'
  | 'UNSIGNED'
  | 'SIGNED'
  | 'AUTO'
  | 'CONST'
  | 'STRUCT'
  // Identifiers & Literals
  | 'IDENT'
  | 'NUMBER'
  | 'STRING'
  | 'CHAR_LITERAL'
  | 'TRUE'
  | 'FALSE'
  // Preprocessor
  | 'PREPROCESSOR'
  // Operators
  | 'PLUS'          // +
  | 'MINUS'         // -
  | 'STAR'          // *
  | 'SLASH'         // /
  | 'PERCENT'       // %
  | 'ASSIGN'        // =
  | 'PLUS_EQUAL'    // +=
  | 'MINUS_EQUAL'   // -=
  | 'STAR_EQUAL'    // *=
  | 'SLASH_EQUAL'   // /=
  | 'PERCENT_EQUAL' // %=
  | 'PLUS_PLUS'     // ++
  | 'MINUS_MINUS'   // --
  | 'EQUAL'         // ==
  | 'NOT_EQUAL'     // !=
  | 'LESS'          // <
  | 'LESS_EQUAL'    // <=
  | 'GREATER'       // >
  | 'GREATER_EQUAL' // >=
  | 'BANG'          // !
  | 'AND'           // &&
  | 'OR'            // ||
  | 'AMPERSAND'     // &
  | 'PIPE'          // |
  | 'CARET'         // ^
  | 'TILDE'         // ~
  | 'SHIFT_LEFT'    // <<
  | 'SHIFT_RIGHT'   // >>
  | 'ARROW'         // ->
  | 'DOT'           // .
  | 'QUESTION'      // ?
  // Delimiters & Punctuation
  | 'LPAREN'        // (
  | 'RPAREN'        // )
  | 'LBRACE'        // {
  | 'RBRACE'        // }
  | 'LBRACKET'      // [
  | 'RBRACKET'      // ]
  | 'COMMA'         // ,
  | 'SEMICOLON'     // ;
  | 'COLON'         // :
  // Special
  | 'EOF'
  | 'ERROR';

export const KEYWORDS: Readonly<Record<string, TokenKind>> = {
  let: 'LET',
  if: 'IF',
  else: 'ELSE',
  while: 'WHILE',
  for: 'FOR',
  do: 'DO',
  return: 'RETURN',
  switch: 'SWITCH',
  case: 'CASE',
  break: 'BREAK',
  continue: 'CONTINUE',
  default: 'DEFAULT',
  sizeof: 'SIZEOF',
  true: 'TRUE',
  false: 'FALSE',
  int: 'INT',
  float: 'FLOAT',
  double: 'DOUBLE',
  char: 'CHAR',
  void: 'VOID',
  bool: 'BOOL',
  long: 'LONG',
  short: 'SHORT',
  unsigned: 'UNSIGNED',
  signed: 'SIGNED',
  auto: 'AUTO',
  const: 'CONST',
  struct: 'STRUCT',
};

export const TOKEN_DISPLAY_NAMES: Readonly<Record<TokenKind, string>> = {
  LET: 'let',
  IF: 'if',
  ELSE: 'else',
  WHILE: 'while',
  FOR: 'for',
  DO: 'do',
  RETURN: 'return',
  SWITCH: 'switch',
  CASE: 'case',
  BREAK: 'break',
  CONTINUE: 'continue',
  DEFAULT: 'default',
  SIZEOF: 'sizeof',
  TRUE: 'true',
  FALSE: 'false',
  INT: 'int',
  FLOAT: 'float',
  DOUBLE: 'double',
  CHAR: 'char',
  VOID: 'void',
  BOOL: 'bool',
  LONG: 'long',
  SHORT: 'short',
  UNSIGNED: 'unsigned',
  SIGNED: 'signed',
  AUTO: 'auto',
  CONST: 'const',
  STRUCT: 'struct',
  IDENT: 'identifier',
  NUMBER: 'number literal',
  STRING: 'string literal',
  CHAR_LITERAL: 'character literal',
  PREPROCESSOR: 'preprocessor directive',
  PLUS: '+',
  MINUS: '-',
  STAR: '*',
  SLASH: '/',
  PERCENT: '%',
  ASSIGN: '=',
  PLUS_EQUAL: '+=',
  MINUS_EQUAL: '-=',
  STAR_EQUAL: '*=',
  SLASH_EQUAL: '/=',
  PERCENT_EQUAL: '%=',
  PLUS_PLUS: '++',
  MINUS_MINUS: '--',
  EQUAL: '==',
  NOT_EQUAL: '!=',
  LESS: '<',
  LESS_EQUAL: '<=',
  GREATER: '>',
  GREATER_EQUAL: '>=',
  BANG: '!',
  AND: '&&',
  OR: '||',
  AMPERSAND: '&',
  PIPE: '|',
  CARET: '^',
  TILDE: '~',
  SHIFT_LEFT: '<<',
  SHIFT_RIGHT: '>>',
  ARROW: '->',
  DOT: '.',
  QUESTION: '?',
  LPAREN: '(',
  RPAREN: ')',
  LBRACE: '{',
  RBRACE: '}',
  LBRACKET: '[',
  RBRACKET: ']',
  COMMA: ',',
  SEMICOLON: ';',
  COLON: ':',
  EOF: '<EOF>',
  ERROR: '<lexical-error>',
};

export function isTypeKeyword(kind: TokenKind): boolean {
  return (
    kind === 'INT' ||
    kind === 'FLOAT' ||
    kind === 'DOUBLE' ||
    kind === 'CHAR' ||
    kind === 'VOID' ||
    kind === 'BOOL' ||
    kind === 'LONG' ||
    kind === 'SHORT' ||
    kind === 'UNSIGNED' ||
    kind === 'SIGNED' ||
    kind === 'AUTO' ||
    kind === 'CONST' ||
    kind === 'STRUCT'
  );
}

export function isKeyword(kind: TokenKind): boolean {
  return (
    kind === 'LET' ||
    kind === 'IF' ||
    kind === 'ELSE' ||
    kind === 'WHILE' ||
    kind === 'FOR' ||
    kind === 'DO' ||
    kind === 'RETURN' ||
    kind === 'SWITCH' ||
    kind === 'CASE' ||
    kind === 'BREAK' ||
    kind === 'CONTINUE' ||
    kind === 'DEFAULT' ||
    kind === 'SIZEOF' ||
    kind === 'TRUE' ||
    kind === 'FALSE' ||
    isTypeKeyword(kind)
  );
}

export function isStatementStart(kind: TokenKind): boolean {
  return (
    kind === 'LET' ||
    isTypeKeyword(kind) ||
    kind === 'IF' ||
    kind === 'WHILE' ||
    kind === 'FOR' ||
    kind === 'DO' ||
    kind === 'RETURN' ||
    kind === 'SWITCH' ||
    kind === 'PREPROCESSOR' ||
    kind === 'RBRACE' ||
    kind === 'EOF'
  );
}

export function isLiteral(kind: TokenKind): boolean {
  return (
    kind === 'NUMBER' ||
    kind === 'STRING' ||
    kind === 'CHAR_LITERAL' ||
    kind === 'TRUE' ||
    kind === 'FALSE'
  );
}

export function isBinaryOperator(kind: TokenKind): boolean {
  return (
    kind === 'PLUS' ||
    kind === 'MINUS' ||
    kind === 'STAR' ||
    kind === 'SLASH' ||
    kind === 'PERCENT' ||
    kind === 'ASSIGN' ||
    kind === 'PLUS_EQUAL' ||
    kind === 'MINUS_EQUAL' ||
    kind === 'STAR_EQUAL' ||
    kind === 'SLASH_EQUAL' ||
    kind === 'PERCENT_EQUAL' ||
    kind === 'EQUAL' ||
    kind === 'NOT_EQUAL' ||
    kind === 'LESS' ||
    kind === 'LESS_EQUAL' ||
    kind === 'GREATER' ||
    kind === 'GREATER_EQUAL' ||
    kind === 'AND' ||
    kind === 'OR' ||
    kind === 'AMPERSAND' ||
    kind === 'PIPE' ||
    kind === 'CARET' ||
    kind === 'SHIFT_LEFT' ||
    kind === 'SHIFT_RIGHT'
  );
}

export function isDelimiter(kind: TokenKind): boolean {
  return (
    kind === 'LPAREN' ||
    kind === 'RPAREN' ||
    kind === 'LBRACE' ||
    kind === 'RBRACE' ||
    kind === 'LBRACKET' ||
    kind === 'RBRACKET' ||
    kind === 'COMMA' ||
    kind === 'SEMICOLON' ||
    kind === 'COLON'
  );
}
