import { describe, it, expect, beforeEach } from 'vitest';
import { tokenize } from '../../src/language/lexer';
import { parseClean } from '../../src/parser/parser';
import {
  analyzeSemantics,
  resetTypeCheckerCounters,
} from '../../src/semantics/typeChecker';
import { extractCodeSymbols } from '../../src/ui/components/SymbolTableView';

describe('Symbol Table in Bottom Dock & Used-In-Code Filtering (Issue 3)', () => {
  beforeEach(() => {
    resetTypeCheckerCounters();
  });

  it('returns empty array when semanticResult is null', () => {
    const symbols = extractCodeSymbols(null, []);
    expect(symbols).toEqual([]);
  });

  it('includes only user-declared symbols and excludes all unused standard builtins', () => {
    const code = `
int main() {
  int total = 100;
  int tax = 5;
  int final_sum = total + tax;
  return final_sum;
}
`;
    const { tokens } = tokenize(code);
    const parseRes = parseClean(tokens);
    const semanticRes = analyzeSemantics(parseRes.ast, code);

    const symbols = extractCodeSymbols(semanticRes, tokens);

    // Symbols should be: main, total, tax, final_sum
    const names = symbols.map((s) => s.name);
    expect(names).toContain('main');
    expect(names).toContain('total');
    expect(names).toContain('tax');
    expect(names).toContain('final_sum');
    expect(symbols).toHaveLength(4);

    // CRITICAL REQUIREMENT: None of the C library builtins must be present!
    const unusedBuiltins = [
      'printf',
      'scanf',
      'puts',
      'putchar',
      'getchar',
      'malloc',
      'free',
      'sizeof',
      'NULL',
      'true',
      'false',
    ];
    for (const builtin of unusedBuiltins) {
      expect(names).not.toContain(builtin);
    }

    // Verify metadata for declared symbols
    const totalSym = symbols.find((s) => s.name === 'total')!;
    expect(totalSym.kind).toBe('variable');
    expect(totalSym.typeSpecifier).toBe('int');
    expect(totalSym.scopeName).toBe('main()');
    expect(totalSym.status).toBe('declared');
    expect(totalSym.usages).toBe(2); // declaration + expression

    const mainSym = symbols.find((s) => s.name === 'main')!;
    expect(mainSym.kind).toBe('function');
    expect(mainSym.scopeName).toBe('Global');
    expect(mainSym.status).toBe('declared');
  });

  it('includes a standard builtin ONLY when it is referenced/used in the code', () => {
    const code = `
#include <stdio.h>

int main() {
  printf("Hello, World!\\n");
  return 0;
}
`;
    const { tokens } = tokenize(code);
    const parseRes = parseClean(tokens);
    const semanticRes = analyzeSemantics(parseRes.ast, code);

    const symbols = extractCodeSymbols(semanticRes, tokens);
    const names = symbols.map((s) => s.name);

    // printf IS used in code, so it MUST be included
    expect(names).toContain('printf');
    expect(names).toContain('main');

    const printfSym = symbols.find((s) => s.name === 'printf')!;
    expect(printfSym.status).toBe('builtin');
    expect(printfSym.kind).toBe('function');
    expect(printfSym.scopeName).toBe('Global (Built-in)');
    expect(printfSym.usages).toBeGreaterThanOrEqual(1);

    // Other builtins NOT used in code must NOT be included
    expect(names).not.toContain('malloc');
    expect(names).not.toContain('free');
    expect(names).not.toContain('scanf');
    expect(names).not.toContain('sizeof');
    expect(names).not.toContain('getchar');
  });

  it('captures function parameters with parameter kind and enclosing function scope', () => {
    const code = `
int add(int a, int b) {
  return a + b;
}

int main() {
  int result = add(10, 20);
  return result;
}
`;
    const { tokens } = tokenize(code);
    const parseRes = parseClean(tokens);
    const semanticRes = analyzeSemantics(parseRes.ast, code);

    const symbols = extractCodeSymbols(semanticRes, tokens);
    const names = symbols.map((s) => s.name);

    expect(names).toContain('add');
    expect(names).toContain('a');
    expect(names).toContain('b');
    expect(names).toContain('main');
    expect(names).toContain('result');

    const paramA = symbols.find((s) => s.name === 'a')!;
    expect(paramA.kind).toBe('parameter');
    expect(paramA.typeSpecifier).toBe('int');
    expect(paramA.scopeName).toBe('add()');
    expect(paramA.status).toBe('declared');
    expect(paramA.usages).toBe(2); // declaration + return a
  });

  it('surfaces undeclared identifiers used in code with undeclared status', () => {
    const code = `
int main() {
  int score = 42;
  return scor;
}
`;
    const { tokens } = tokenize(code);
    const parseRes = parseClean(tokens);
    const semanticRes = analyzeSemantics(parseRes.ast, code);

    const symbols = extractCodeSymbols(semanticRes, tokens);
    const names = symbols.map((s) => s.name);

    expect(names).toContain('main');
    expect(names).toContain('score');
    expect(names).toContain('scor');

    const typoSym = symbols.find((s) => s.name === 'scor')!;
    expect(typoSym.status).toBe('undeclared');
    expect(typoSym.kind).toBe('undeclared');
    expect(typoSym.typeSpecifier).toBe('unknown');
    expect(typoSym.scopeName).toBe('Unresolved');
  });

  it('correctly handles shadowed variables across block scopes', () => {
    const code = `
int main() {
  int x = 1;
  {
    int x = 2;
  }
  return x;
}
`;
    const { tokens } = tokenize(code);
    const parseRes = parseClean(tokens);
    const semanticRes = analyzeSemantics(parseRes.ast, code);

    const symbols = extractCodeSymbols(semanticRes, tokens);
    const xSymbols = symbols.filter((s) => s.name === 'x');

    // Both x definitions exist in their respective scopes
    expect(xSymbols.length).toBe(2);
    const innerX = xSymbols.find((s) => s.isShadowed);
    expect(innerX).toBeDefined();
    expect(innerX?.isShadowed).toBe(true);
  });

  it('correctly maps nested block scopes to their enclosing function name (e.g. main() block)', () => {
    const code = `
int main() {
  if (1) {
    {
      int nested_var = 42;
    }
  }
  return 0;
}
`;
    const { tokens } = tokenize(code);
    const parseRes = parseClean(tokens);
    const semanticRes = analyzeSemantics(parseRes.ast, code);

    const symbols = extractCodeSymbols(semanticRes, tokens);
    const nestedSym = symbols.find((s) => s.name === 'nested_var');
    expect(nestedSym).toBeDefined();
    // Must be mapped to "main() block", NOT a generic "Block"
    expect(nestedSym?.scopeName).toBe('main() block');
  });

  it('does NOT suppress undeclared identifiers in one function when declared locally in a different function', () => {
    const code = `
int helper() {
  int count = 10;
  return count;
}

int main() {
  return count;
}
`;
    const { tokens } = tokenize(code);
    const parseRes = parseClean(tokens);
    const semanticRes = analyzeSemantics(parseRes.ast, code);

    // Diagnostics should report undeclared 'count' in main()
    const undeclaredDiags = semanticRes.diagnostics.filter((d) => d.semanticKind === 'undeclared-identifier');
    expect(undeclaredDiags.length).toBeGreaterThanOrEqual(1);

    const symbols = extractCodeSymbols(semanticRes, tokens);
    const countSymbols = symbols.filter((s) => s.name === 'count');

    // Should have BOTH the declared count in helper() AND the undeclared count in main()
    expect(countSymbols.length).toBe(2);
    const declaredCount = countSymbols.find((s) => s.status === 'declared');
    const undeclaredCount = countSymbols.find((s) => s.status === 'undeclared');
    expect(declaredCount).toBeDefined();
    expect(declaredCount?.scopeName).toBe('helper()');
    expect(undeclaredCount).toBeDefined();
    expect(undeclaredCount?.status).toBe('undeclared');
  });
});

