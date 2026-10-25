/**
 * Canonical serializer and state hasher for ERDF deterministic replay verification.
 */

import { fnv1a, canonicalJson } from '../utils/hash';
import { ProgramNode } from '../language/ast';

export function hashString(str: string): string {
  return fnv1a(str);
}

export function hashObject(obj: unknown): string {
  return fnv1a(canonicalJson(obj));
}

export function computeErdfStateHash(
  cursor: number,
  tokensLength: number,
  nodeCount: number,
  diagnosticCount: number,
  committedRepairsCount: number
): string {
  const signature = `${cursor}:${tokensLength}:${nodeCount}:${diagnosticCount}:${committedRepairsCount}`;
  return fnv1a(signature);
}

export function hashAst(ast: ProgramNode): string {
  // Normalize AST node ids (strip variable memory addresses/timestamps) to verify structural equivalence
  const canonicalForm = stripVolatileAstFields(ast);
  return fnv1a(canonicalJson(canonicalForm));
}

function stripVolatileAstFields(node: unknown): unknown {
  if (node === null || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(stripVolatileAstFields);
  }
  const obj = node as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    // Retain kind, operator, lexeme, value, provenance, children
    if (key === 'id') {
      // Normalize node id to kind
      clean[key] = String(obj['kind'] || 'node');
    } else {
      clean[key] = stripVolatileAstFields(obj[key]);
    }
  }
  return clean;
}
