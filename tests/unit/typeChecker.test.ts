import { describe, it, expect, beforeEach } from 'vitest';
import { tokenize } from '../../src/language/lexer';
import { parseClean } from '../../src/parser/parser';
import {
  analyzeSemantics,
  areTypesCompatible,
  resetTypeCheckerCounters,
} from '../../src/semantics/typeChecker';

describe('Type Checker & Typo Recovery (src/semantics/typeChecker.ts)', () => {
  beforeEach(() => {
    resetTypeCheckerCounters();
  });

  describe('Type Compatibility & Inference', () => {
    it('verifies numeric type compatibility in C semantics', () => {
      expect(areTypesCompatible('int', 'int')).toBe(true);
      expect(areTypesCompatible('int', 'float')).toBe(true);
      expect(areTypesCompatible('float', 'double')).toBe(true);
      expect(areTypesCompatible('char', 'int')).toBe(true);
      expect(areTypesCompatible('bool', 'int')).toBe(true);
    });

    it('rejects incompatible string and numeric types', () => {
      expect(areTypesCompatible('int', 'string')).toBe(false);
      expect(areTypesCompatible('float', 'string')).toBe(false);
      expect(areTypesCompatible('string', 'int')).toBe(false);
    });

    it('verifies pointer compatibility rules', () => {
      expect(areTypesCompatible('void*', 'int*')).toBe(true);
      expect(areTypesCompatible('int*', 'NULL')).toBe(true);
      expect(areTypesCompatible('char*', 'string')).toBe(true);
      expect(areTypesCompatible('int', 'void*')).toBe(false);
    });
  });

  describe('Clean Programs Semantic Analysis', () => {
    it('analyzes clean variable declarations and functions without diagnostics', () => {
      const source = `
        #include <stdio.h>

        int add(int a, int b) {
          return a + b;
        }

        int main() {
          int total = 100;
          int tax = 15;
          int sum = total + tax;
          return sum;
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      expect(result.diagnostics).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);

      // Verify scopes
      expect(result.allScopes.length).toBeGreaterThanOrEqual(3); // Global, add(), main()
      const mainScope = result.allScopes.find(
        (s) => s.kind === 'function' && s.name.includes('main')
      );
      expect(mainScope).toBeDefined();

      const totalSym = mainScope?.lookup('total');
      expect(totalSym).toBeDefined();
      expect(totalSym?.typeSpecifier).toBe('int');
    });
  });

  describe('Undeclared Identifier & Levenshtein Typo Recovery', () => {
    it('detects misspelled "totl" and suggests in-scope "total" with 92% match', () => {
      const source = `
        int main() {
          int total = 100;
          int tax = 15;
          totl = (10 + 20);
          int final_sum = totl + tax;
          return final_sum;
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      // Both occurrences of 'totl' should be detected and flagged
      expect(result.diagnostics.length).toBeGreaterThanOrEqual(2);

      const totlDiags = result.diagnostics.filter(
        (d) => d.semanticKind === 'undeclared-identifier' && d.message.includes('totl')
      );
      expect(totlDiags.length).toBe(2);

      const firstDiag = totlDiags[0];
      expect(firstDiag.code).toBe('SEM_UNDECLARED_ID');
      expect(firstDiag.message).toContain("Did you mean 'total'?");
      expect(firstDiag.message).toContain('Dist: 1');
      expect(firstDiag.message).toContain('92% match');

      // Verify repair candidate object
      expect(firstDiag.symbolCandidate).toBeDefined();
      const cand = firstDiag.symbolCandidate!;
      expect(cand.originalName).toBe('totl');
      expect(cand.suggestedName).toBe('total');
      expect(cand.distance).toBe(1);
      expect(cand.matchPercentage).toBe(92);
      expect(cand.symbol.typeSpecifier).toBe('int');
      expect(cand.replacementSpan.line).toBe(5);
    });

    it('resolves built-in functions like printf and suggests printf for pritf', () => {
      const source = `
        int main() {
          pritf("Hello world\\n");
          return 0;
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
      const pritfDiag = result.diagnostics.find((d) => d.message.includes('pritf'));
      expect(pritfDiag).toBeDefined();
      expect(pritfDiag?.message).toContain("Did you mean 'printf'?");
      expect(pritfDiag?.symbolCandidate?.suggestedName).toBe('printf');
    });

    it('flags completely unknown identifiers without suggestions when no matches exist', () => {
      const source = `
        int main() {
          int x = 42;
          return zzz_unknown_var;
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      const diag = result.diagnostics.find((d) => d.message.includes('zzz_unknown_var'));
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe('error');
      expect(diag?.symbolCandidate).toBeUndefined();
    });
  });

  describe('Type Mismatch & Invalid Return Validation', () => {
    it('detects incompatible variable initialization (string to int)', () => {
      const source = `
        int main() {
          int count = "hello";
          return count;
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      const mismatch = result.diagnostics.find((d) => d.code === 'SEM_TYPE_MISMATCH');
      expect(mismatch).toBeDefined();
      expect(mismatch?.semanticKind).toBe('type-mismatch');
      expect(mismatch?.expectedType).toBe('int');
      expect(mismatch?.actualType).toBe('string');
      expect(mismatch?.message).toContain("incompatible type 'string'");
    });

    it('detects incompatible assignment (string to int)', () => {
      const source = `
        int main() {
          int count = 10;
          count = "invalid";
          return count;
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      const mismatch = result.diagnostics.find((d) => d.code === 'SEM_TYPE_MISMATCH');
      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("Cannot assign value of type 'string'");
    });

    it('detects void function returning a value', () => {
      const source = `
        void log_message(int code) {
          return code;
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      const invalidRet = result.diagnostics.find((d) => d.code === 'SEM_INVALID_RETURN');
      expect(invalidRet).toBeDefined();
      expect(invalidRet?.semanticKind).toBe('invalid-return');
      expect(invalidRet?.message).toContain("Void function 'log_message' cannot return a value");
    });

    it('detects function returning incompatible type', () => {
      const source = `
        int get_number() {
          return "not a number";
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      const invalidRet = result.diagnostics.find((d) => d.code === 'SEM_INVALID_RETURN');
      expect(invalidRet).toBeDefined();
      expect(invalidRet?.message).toContain("returns 'int' but return expression is of type 'string'");
    });

    it('detects duplicate parameter in function declaration', () => {
      const source = `
        int calculate(int x, float x) {
          return 0;
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      const redef = result.diagnostics.find(
        (d) => d.code === 'SEM_REDEFINITION' && d.message.includes("Duplicate parameter 'x'")
      );
      expect(redef).toBeDefined();
    });

    it('detects incompatible function call arguments', () => {
      const source = `
        int add(int a, int b) {
          return a + b;
        }

        int main() {
          return add(10, "invalid_arg");
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      const mismatch = result.diagnostics.find((d) => d.code === 'SEM_TYPE_MISMATCH');
      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("Argument 2 of 'add' expects type 'int' but got 'string'");
    });

    it('creates nested block scopes for if and while statements', () => {
      const source = `
        int main() {
          int outer = 1;
          if (outer > 0) {
            int inner_if = 2;
          }
          while (outer > 0) {
            int inner_while = 3;
          }
          return outer;
        }
      `;
      const { tokens } = tokenize(source);
      const { ast } = parseClean(tokens);
      const result = analyzeSemantics(ast, source);

      expect(result.diagnostics).toHaveLength(0);

      const ifScope = result.allScopes.find((s) => s.name === 'if block');
      expect(ifScope).toBeDefined();
      expect(ifScope?.lookup('inner_if')?.name).toBe('inner_if');
      expect(ifScope?.lookup('outer')?.name).toBe('outer');

      const whileScope = result.allScopes.find((s) => s.name === 'while block');
      expect(whileScope).toBeDefined();
      expect(whileScope?.lookup('inner_while')?.name).toBe('inner_while');
      expect(whileScope?.lookup('outer')?.name).toBe('outer');
    });
  });
});
