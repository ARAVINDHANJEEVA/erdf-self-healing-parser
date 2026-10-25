/**
 * Pratt parser precedence tables and binding powers for MiniLang expressions.
 */

import { TokenKind } from '../language/types';

export enum Precedence {
  NONE = 0,
  ASSIGNMENT = 1, // =, +=, -=, *=, /=, %= (right-associative)
  OR = 2,         // ||
  AND = 3,        // &&
  BITWISE_OR = 4, // |
  BITWISE_XOR = 5,// ^
  BITWISE_AND = 6,// &
  EQUALITY = 7,   // ==, !=
  COMPARISON = 8, // <, <=, >, >=
  SHIFT = 9,      // <<, >>
  TERM = 10,      // +, -
  FACTOR = 11,    // *, /, %
  UNARY = 12,     // !, -, ++, --, *, &
  CALL = 13,      // (, [, ., ->
  PRIMARY = 14,
}

export function getInfixPrecedence(kind: TokenKind): Precedence {
  switch (kind) {
    case 'ASSIGN':
    case 'PLUS_EQUAL':
    case 'MINUS_EQUAL':
    case 'STAR_EQUAL':
    case 'SLASH_EQUAL':
    case 'PERCENT_EQUAL':
      return Precedence.ASSIGNMENT;
    case 'OR':
      return Precedence.OR;
    case 'AND':
      return Precedence.AND;
    case 'PIPE':
      return Precedence.BITWISE_OR;
    case 'CARET':
      return Precedence.BITWISE_XOR;
    case 'AMPERSAND':
      return Precedence.BITWISE_AND;
    case 'EQUAL':
    case 'NOT_EQUAL':
      return Precedence.EQUALITY;
    case 'LESS':
    case 'LESS_EQUAL':
    case 'GREATER':
    case 'GREATER_EQUAL':
      return Precedence.COMPARISON;
    case 'SHIFT_LEFT':
    case 'SHIFT_RIGHT':
      return Precedence.SHIFT;
    case 'PLUS':
    case 'MINUS':
      return Precedence.TERM;
    case 'STAR':
    case 'SLASH':
    case 'PERCENT':
      return Precedence.FACTOR;
    case 'LPAREN':
    case 'LBRACKET':
    case 'DOT':
    case 'ARROW':
    case 'PLUS_PLUS':
    case 'MINUS_MINUS':
      return Precedence.CALL;
    default:
      return Precedence.NONE;
  }
}

export function isRightAssociative(precedence: Precedence): boolean {
  return precedence === Precedence.ASSIGNMENT;
}
