/**
 * Semantic Symbol Table & Scope Hierarchy with Levenshtein Typo Recovery.
 * Provides hierarchical scope tree management (Global, Function, Block),
 * symbol resolution, shadowing rules, and fuzzy string distance metrics.
 */

import { SourceSpan } from '../language/types';

export type SymbolKind = 'variable' | 'function' | 'parameter';

export interface SymbolDefinition {
  readonly id: string;
  readonly name: string;
  readonly typeSpecifier: string;
  readonly span: SourceSpan;
  readonly kind: SymbolKind;
  readonly scopeId: string;
  readonly isPointer?: boolean;
  readonly isConst?: boolean;
  readonly parameterTypes?: readonly string[];
  readonly returnType?: string;
}

export type ScopeKind = 'global' | 'function' | 'block';

let symbolCounter = 0;
let scopeCounter = 0;

export function resetSemanticCounters(): void {
  symbolCounter = 0;
  scopeCounter = 0;
}

export function nextSymbolId(prefix: string = 'sym'): string {
  return `${prefix}-${++symbolCounter}`;
}

export function nextScopeId(kind: ScopeKind): string {
  return `scope-${kind}-${++scopeCounter}`;
}

/**
 * Base Scope class providing hierarchical lookup, symbol storage,
 * and scope boundary tracking.
 */
export abstract class BaseScope {
  public readonly id: string;
  public readonly kind: ScopeKind;
  public readonly name: string;
  public readonly parent: BaseScope | null;
  public readonly children: BaseScope[] = [];
  public readonly symbols: Map<string, SymbolDefinition> = new Map();
  public readonly span: SourceSpan;

  constructor(
    id: string,
    kind: ScopeKind,
    name: string,
    parent: BaseScope | null,
    span: SourceSpan
  ) {
    this.id = id;
    this.kind = kind;
    this.name = name;
    this.parent = parent;
    this.span = span;

    if (parent) {
      parent.children.push(this);
    }
  }

  /**
   * Registers a symbol in the current immediate scope.
   * Returns true if newly added, or false if already defined in this exact scope.
   */
  public define(symbol: SymbolDefinition): boolean {
    const isNew = !this.symbols.has(symbol.name);
    this.symbols.set(symbol.name, symbol);
    return isNew;
  }

  /**
   * Looks up a symbol by name in this scope or any enclosing ancestor scopes.
   */
  public lookup(name: string): SymbolDefinition | undefined {
    const local = this.symbols.get(name);
    if (local) return local;
    if (this.parent) return this.parent.lookup(name);
    return undefined;
  }

  /**
   * Looks up a symbol strictly within this immediate scope (no ancestor traversal).
   */
  public lookupLocal(name: string): SymbolDefinition | undefined {
    return this.symbols.get(name);
  }

  /**
   * Retrieves all symbols visible from this scope, respecting variable shadowing.
   */
  public getInScopeSymbols(): SymbolDefinition[] {
    const map = new Map<string, SymbolDefinition>();
    if (this.parent) {
      for (const sym of this.parent.getInScopeSymbols()) {
        map.set(sym.name, sym);
      }
    }
    for (const [name, sym] of this.symbols) {
      map.set(name, sym);
    }
    return Array.from(map.values());
  }

  /**
   * Recursively collects all symbols defined across this scope and all descendant scopes.
   */
  public getAllSymbols(): SymbolDefinition[] {
    const list: SymbolDefinition[] = Array.from(this.symbols.values());
    for (const child of this.children) {
      list.push(...child.getAllSymbols());
    }
    return list;
  }

  /**
   * Recursively finds the deepest scope containing the given character offset.
   */
  public findScopeAtOffset(offset: number): BaseScope {
    for (const child of this.children) {
      if (offset >= child.span.start && offset <= child.span.end) {
        return child.findScopeAtOffset(offset);
      }
    }
    return this;
  }

  /**
   * Recursively finds the deepest scope containing the given source span.
   */
  public findScopeForSpan(span: SourceSpan): BaseScope {
    for (const child of this.children) {
      if (span.start >= child.span.start && span.end <= child.span.end) {
        return child.findScopeForSpan(span);
      }
    }
    return this;
  }
}

/**
 * Global Scope at the root of the compilation unit.
 */
export class GlobalScope extends BaseScope {
  constructor(span: SourceSpan = { start: 0, end: 0, line: 1, column: 1 }) {
    super(nextScopeId('global'), 'global', 'global', null, span);
  }

  /**
   * Seeds standard built-in C runtime functions and primitives.
   */
  public seedBuiltins(): void {
    const dummySpan: SourceSpan = { start: 0, end: 0, line: 1, column: 1 };
    const builtins: Array<{
      name: string;
      type: string;
      kind: SymbolKind;
      paramTypes?: string[];
      returnType?: string;
    }> = [
      { name: 'printf', type: 'int', kind: 'function', paramTypes: ['string'], returnType: 'int' },
      { name: 'scanf', type: 'int', kind: 'function', paramTypes: ['string'], returnType: 'int' },
      { name: 'puts', type: 'int', kind: 'function', paramTypes: ['string'], returnType: 'int' },
      { name: 'putchar', type: 'int', kind: 'function', paramTypes: ['int'], returnType: 'int' },
      { name: 'getchar', type: 'int', kind: 'function', paramTypes: [], returnType: 'int' },
      { name: 'malloc', type: 'void*', kind: 'function', paramTypes: ['int'], returnType: 'void*' },
      { name: 'free', type: 'void', kind: 'function', paramTypes: ['void*'], returnType: 'void' },
      { name: 'sizeof', type: 'int', kind: 'function', paramTypes: ['unknown'], returnType: 'int' },
      { name: 'NULL', type: 'void*', kind: 'variable' },
      { name: 'true', type: 'bool', kind: 'variable' },
      { name: 'false', type: 'bool', kind: 'variable' },
    ];

    for (const b of builtins) {
      if (!this.symbols.has(b.name)) {
        this.define({
          id: nextSymbolId('builtin'),
          name: b.name,
          typeSpecifier: b.type,
          span: dummySpan,
          kind: b.kind,
          scopeId: this.id,
          parameterTypes: b.paramTypes,
          returnType: b.returnType,
        });
      }
    }
  }
}

/**
 * Function Scope enclosing parameters and the function body.
 */
export class FunctionScope extends BaseScope {
  public readonly functionName: string;
  public readonly returnType: string;

  constructor(
    functionName: string,
    parent: BaseScope,
    span: SourceSpan,
    returnType: string = 'void'
  ) {
    super(nextScopeId('function'), 'function', `function ${functionName}()`, parent, span);
    this.functionName = functionName;
    this.returnType = returnType;
  }
}

/**
 * Block Scope enclosing local statements within compound braces `{ ... }`,
 * if/else branches, while loops, and for loops.
 */
export class BlockScope extends BaseScope {
  public readonly blockKind: 'block' | 'if' | 'else' | 'while' | 'for';

  constructor(
    blockKind: 'block' | 'if' | 'else' | 'while' | 'for',
    parent: BaseScope,
    span: SourceSpan
  ) {
    const label = blockKind === 'block' ? 'block' : `${blockKind} block`;
    super(nextScopeId('block'), 'block', label, parent, span);
    this.blockKind = blockKind;
  }
}

// =========================================================================
// Levenshtein Metric & Typo Suggestion Algorithm
// =========================================================================

/**
 * Computes standard Wagner-Fischer Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = new Array(n + 1);
  let currRow = new Array(n + 1);

  for (let j = 0; j <= n; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    const c1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const c2 = s2.charCodeAt(j - 1);
      const cost = c1 === c2 ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,       // deletion
        currRow[j - 1] + 1,   // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[n];
}

/**
 * Computes raw similarity between two strings as a fraction [0.0, 1.0].
 */
export function calculateSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, (maxLen - dist) / maxLen);
}

export interface TypoConfidenceResult {
  readonly distance: number;
  readonly similarity: number; // 0.0 - 1.0
  readonly confidence: number; // 0.0 - 1.0
  readonly matchPercentage: number; // 0 - 100
}

/**
 * Calculates a comprehensive confidence score and match percentage for typo recovery.
 * Includes prefix matching bonus, suffix matching bonus, and length similarity bonus.
 */
export function calculateTypoConfidence(query: string, candidate: string): TypoConfidenceResult {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  const dist = levenshteinDistance(q, c);
  const maxLen = Math.max(q.length, c.length);

  if (maxLen === 0) {
    return { distance: 0, similarity: 1, confidence: 1, matchPercentage: 100 };
  }

  const rawSim = Math.max(0, (maxLen - dist) / maxLen);

  // Bonus factors for high-probability human typos
  let bonus = 0;
  // Matching first character (crucial human anchor)
  if (q.length > 0 && c.length > 0 && q[0] === c[0]) {
    bonus += 0.06;
  }
  // Matching trailing character
  if (q.length > 1 && c.length > 1 && q[q.length - 1] === c[c.length - 1]) {
    bonus += 0.04;
  }
  // Bounded length difference
  if (Math.abs(q.length - c.length) <= 1) {
    bonus += 0.02;
  }

  const confidence = Math.min(1.0, Math.max(0.0, rawSim + bonus));
  const matchPercentage = Math.round(confidence * 100);

  return {
    distance: dist,
    similarity: Math.round(rawSim * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    matchPercentage,
  };
}

export interface TypoSuggestion {
  readonly name: string;
  readonly distance: number;
  readonly similarity: number;
  readonly confidence: number;
  readonly matchPercentage: number;
  readonly symbol?: SymbolDefinition;
}

export interface TypoSuggestionOptions {
  readonly maxDistance?: number;
  readonly minConfidence?: number;
  readonly limit?: number;
}

/**
 * Searches in-scope symbols for the closest fuzzy matches to an undeclared/misspelled identifier.
 * Ranks candidates by lowest distance, highest confidence score, and shortest length delta.
 */
export function findTypoSuggestions(
  misspelledName: string,
  inScopeSymbols: readonly (SymbolDefinition | string)[],
  options: TypoSuggestionOptions = {}
): TypoSuggestion[] {
  if (!misspelledName || inScopeSymbols.length === 0) {
    return [];
  }

  const queryLen = misspelledName.length;
  const defaultMaxDist = queryLen <= 3 ? 1 : queryLen <= 6 ? 2 : 3;
  const maxDistance = options.maxDistance ?? defaultMaxDist;
  const minConfidence = options.minConfidence ?? 0.45;
  const limit = options.limit ?? 5;

  const suggestions: TypoSuggestion[] = [];
  const seenNames = new Set<string>();

  for (const item of inScopeSymbols) {
    const candName = typeof item === 'string' ? item : item.name;
    const candSymbol = typeof item === 'string' ? undefined : item;

    // Skip exact matches (since query is supposedly undeclared or misspelled)
    if (candName === misspelledName) continue;
    if (seenNames.has(candName)) continue;
    seenNames.add(candName);

    const metrics = calculateTypoConfidence(misspelledName, candName);

    if (metrics.distance <= maxDistance && metrics.confidence >= minConfidence) {
      suggestions.push({
        name: candName,
        distance: metrics.distance,
        similarity: metrics.similarity,
        confidence: metrics.confidence,
        matchPercentage: metrics.matchPercentage,
        symbol: candSymbol,
      });
    }
  }

  // Sort: lowest distance first, then highest confidence, then length proximity, then alphabetical
  suggestions.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    const lenDeltaA = Math.abs(a.name.length - queryLen);
    const lenDeltaB = Math.abs(b.name.length - queryLen);
    if (lenDeltaA !== lenDeltaB) {
      return lenDeltaA - lenDeltaB;
    }
    return a.name.localeCompare(b.name);
  });

  return suggestions.slice(0, limit);
}
