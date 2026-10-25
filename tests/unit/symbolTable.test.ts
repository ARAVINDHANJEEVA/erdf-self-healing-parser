import { describe, it, expect, beforeEach } from 'vitest';
import {
  BlockScope,
  FunctionScope,
  GlobalScope,
  calculateSimilarity,
  calculateTypoConfidence,
  findTypoSuggestions,
  levenshteinDistance,
  resetSemanticCounters,
  SymbolDefinition,
} from '../../src/semantics/symbolTable';
import { SourceSpan } from '../../src/language/types';

describe('Symbol Table & Typo Recovery (src/semantics/symbolTable.ts)', () => {
  beforeEach(() => {
    resetSemanticCounters();
  });

  const dummySpan: SourceSpan = { start: 0, end: 10, line: 1, column: 1 };

  describe('Levenshtein Distance Metric', () => {
    it('calculates 0 distance for identical strings', () => {
      expect(levenshteinDistance('', '')).toBe(0);
      expect(levenshteinDistance('total', 'total')).toBe(0);
      expect(levenshteinDistance('counter', 'counter')).toBe(0);
    });

    it('calculates insertion, deletion, and substitution distances correctly', () => {
      // Insertion: 'totl' -> 'total'
      expect(levenshteinDistance('totl', 'total')).toBe(1);
      // Deletion: 'total' -> 'totl'
      expect(levenshteinDistance('total', 'totl')).toBe(1);
      // Substitution: 'tatol' -> 'total'
      expect(levenshteinDistance('tatol', 'total')).toBe(2);
      // Classic test: 'kitten' -> 'sitting'
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    it('handles empty string edge cases', () => {
      expect(levenshteinDistance('', 'hello')).toBe(5);
      expect(levenshteinDistance('world', '')).toBe(5);
    });
  });

  describe('Typo Confidence & Match Percentage', () => {
    it('calculates 92% match confidence for totl vs total', () => {
      const res = calculateTypoConfidence('totl', 'total');
      expect(res.distance).toBe(1);
      expect(res.matchPercentage).toBe(92);
      expect(res.confidence).toBe(0.92);
    });

    it('calculates high match percentage for single-char typos', () => {
      const res = calculateTypoConfidence('pritf', 'printf');
      expect(res.distance).toBe(1);
      expect(res.matchPercentage).toBeGreaterThanOrEqual(90);
    });

    it('calculates 0% or low score for completely unrelated identifiers', () => {
      const res = calculateTypoConfidence('xyz', 'total');
      expect(res.distance).toBe(5);
      expect(res.matchPercentage).toBe(0);
    });

    it('computes raw similarity correctly', () => {
      expect(calculateSimilarity('test', 'test')).toBe(1);
      expect(calculateSimilarity('abcd', 'abce')).toBe(0.75);
    });
  });

  describe('findTypoSuggestions', () => {
    it('finds and ranks in-scope suggestions for misspelled identifiers', () => {
      const symbols: SymbolDefinition[] = [
        {
          id: 's1',
          name: 'total',
          typeSpecifier: 'int',
          span: dummySpan,
          kind: 'variable',
          scopeId: 'scope-1',
        },
        {
          id: 's2',
          name: 'tax',
          typeSpecifier: 'int',
          span: dummySpan,
          kind: 'variable',
          scopeId: 'scope-1',
        },
        {
          id: 's3',
          name: 'final_sum',
          typeSpecifier: 'int',
          span: dummySpan,
          kind: 'variable',
          scopeId: 'scope-1',
        },
      ];

      const suggestions = findTypoSuggestions('totl', symbols);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].name).toBe('total');
      expect(suggestions[0].distance).toBe(1);
      expect(suggestions[0].matchPercentage).toBe(92);
      expect(suggestions[0].symbol?.typeSpecifier).toBe('int');
    });

    it('ranks closer edit distance ahead of distant candidates', () => {
      const candidates = ['counter', 'count', 'counting', 'other'];
      const suggestions = findTypoSuggestions('countr', candidates);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].name).toBe('counter');
      expect(suggestions[0].distance).toBe(1);
    });

    it('filters out candidates exceeding maxDistance or below minConfidence', () => {
      const candidates = ['unrelated', 'another_long_name'];
      const suggestions = findTypoSuggestions('x', candidates, { maxDistance: 1 });
      expect(suggestions).toHaveLength(0);
    });

    it('returns empty array when input is empty', () => {
      expect(findTypoSuggestions('', ['total'])).toEqual([]);
      expect(findTypoSuggestions('totl', [])).toEqual([]);
    });
  });

  describe('Scope Tree Hierarchy & Symbol Resolution', () => {
    it('creates GlobalScope and seeds standard builtins', () => {
      const global = new GlobalScope();
      global.seedBuiltins();

      expect(global.kind).toBe('global');
      expect(global.name).toBe('global');
      expect(global.parent).toBeNull();

      // Check standard builtins
      const printf = global.lookup('printf');
      expect(printf).toBeDefined();
      expect(printf?.kind).toBe('function');
      expect(printf?.returnType).toBe('int');

      const nullSym = global.lookup('NULL');
      expect(nullSym).toBeDefined();
      expect(nullSym?.typeSpecifier).toBe('void*');
    });

    it('defines and resolves symbols hierarchically', () => {
      const global = new GlobalScope();
      global.define({
        id: 'sym-global-g',
        name: 'global_var',
        typeSpecifier: 'int',
        span: dummySpan,
        kind: 'variable',
        scopeId: global.id,
      });

      const fnScope = new FunctionScope(
        'compute',
        global,
        { start: 10, end: 100, line: 2, column: 1 },
        'int'
      );
      fnScope.define({
        id: 'sym-param-x',
        name: 'x',
        typeSpecifier: 'int',
        span: { start: 15, end: 20, line: 2, column: 10 },
        kind: 'parameter',
        scopeId: fnScope.id,
      });

      const blockScope = new BlockScope('if', fnScope, {
        start: 30,
        end: 80,
        line: 3,
        column: 5,
      });
      blockScope.define({
        id: 'sym-local-temp',
        name: 'temp',
        typeSpecifier: 'float',
        span: { start: 35, end: 40, line: 3, column: 10 },
        kind: 'variable',
        scopeId: blockScope.id,
      });

      // Resolution from innermost block scope
      expect(blockScope.lookup('temp')?.name).toBe('temp');
      expect(blockScope.lookup('x')?.name).toBe('x');
      expect(blockScope.lookup('global_var')?.name).toBe('global_var');
      expect(blockScope.lookup('non_existent')).toBeUndefined();

      // Resolution from function scope cannot see inner block scope variable
      expect(fnScope.lookup('temp')).toBeUndefined();
      expect(fnScope.lookup('x')?.name).toBe('x');
      expect(fnScope.lookup('global_var')?.name).toBe('global_var');

      // Global scope cannot see function or block variables
      expect(global.lookup('x')).toBeUndefined();
      expect(global.lookup('temp')).toBeUndefined();
    });

    it('handles variable shadowing correctly in getInScopeSymbols', () => {
      const global = new GlobalScope();
      global.define({
        id: 'sym-g-x',
        name: 'x',
        typeSpecifier: 'int',
        span: dummySpan,
        kind: 'variable',
        scopeId: global.id,
      });

      const fnScope = new FunctionScope('foo', global, dummySpan, 'void');
      fnScope.define({
        id: 'sym-fn-x',
        name: 'x',
        typeSpecifier: 'float',
        span: dummySpan,
        kind: 'variable',
        scopeId: fnScope.id,
      });

      // In fnScope, 'x' should resolve to float, shadowing global int
      const resolved = fnScope.lookup('x');
      expect(resolved?.typeSpecifier).toBe('float');
      expect(resolved?.scopeId).toBe(fnScope.id);

      // getInScopeSymbols should only contain the shadowing 'x' (float)
      const inScope = fnScope.getInScopeSymbols();
      const xSyms = inScope.filter((s) => s.name === 'x');
      expect(xSyms).toHaveLength(1);
      expect(xSyms[0].typeSpecifier).toBe('float');
    });

    it('finds deepest scope containing character offset or span', () => {
      const global = new GlobalScope({ start: 0, end: 200, line: 1, column: 1 });
      const fnScope = new FunctionScope(
        'main',
        global,
        { start: 20, end: 150, line: 2, column: 1 },
        'int'
      );
      const innerBlock = new BlockScope('while', fnScope, {
        start: 50,
        end: 100,
        line: 4,
        column: 3,
      });

      expect(global.findScopeAtOffset(10).id).toBe(global.id);
      expect(global.findScopeAtOffset(30).id).toBe(fnScope.id);
      expect(global.findScopeAtOffset(75).id).toBe(innerBlock.id);
      expect(global.findScopeAtOffset(120).id).toBe(fnScope.id);
      expect(global.findScopeAtOffset(180).id).toBe(global.id);
    });
  });
});
