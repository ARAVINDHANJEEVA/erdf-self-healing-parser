/**
 * Deterministic, zero-dependency hashing utilities (FNV-1a 32-bit).
 * Used for parser checkpoints, candidate deduplication, and ERDF state verification.
 */

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Deterministically stringifies an object with sorted keys.
 * Hardened against circular references and prototype pollution.
 */
export function canonicalJson(obj: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (seen.has(obj)) {
    return '"[Circular]"';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJson(item, seen)).join(',') + ']';
  }

  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => !UNSAFE_KEYS.has(k) && Object.prototype.hasOwnProperty.call(record, k))
    .sort();

  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJson(record[k], seen)}`
  );
  return '{' + entries.join(',') + '}';
}

