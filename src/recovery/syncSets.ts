/**
 * Synchronization token sets for MiniLang constructs.
 * Used by panic-mode recovery to safely resume parsing.
 */

import { TokenKind } from '../language/types';

export const STATEMENT_SYNC_SET: ReadonlySet<TokenKind> = new Set<TokenKind>([
  'SEMICOLON',
  'RBRACE',
  'LET',
  'INT',
  'FLOAT',
  'DOUBLE',
  'CHAR',
  'VOID',
  'BOOL',
  'AUTO',
  'CONST',
  'RETURN',
  'IF',
  'WHILE',
  'FOR',
  'PREPROCESSOR',
  'EOF',
]);

export const EXPRESSION_SYNC_SET: ReadonlySet<TokenKind> = new Set<TokenKind>([
  'RPAREN',
  'RBRACKET',
  'COMMA',
  'SEMICOLON',
  'RBRACE',
  'EOF',
]);

export const BLOCK_SYNC_SET: ReadonlySet<TokenKind> = new Set<TokenKind>([
  'RBRACE',
  'LET',
  'INT',
  'FLOAT',
  'DOUBLE',
  'CHAR',
  'VOID',
  'BOOL',
  'RETURN',
  'IF',
  'WHILE',
  'FOR',
  'PREPROCESSOR',
  'EOF',
]);

export function getSyncSetForRule(rule: string): ReadonlySet<TokenKind> {
  switch (rule) {
    case 'ifStmt':
    case 'whileStmt':
    case 'expression':
      return EXPRESSION_SYNC_SET;
    case 'block':
      return BLOCK_SYNC_SET;
    case 'letDecl':
    case 'exprStmt':
    case 'statement':
    default:
      return STATEMENT_SYNC_SET;
  }
}
