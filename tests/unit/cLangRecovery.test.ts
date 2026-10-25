import { describe, it, expect } from 'vitest';
import { parseClean } from '../../src/parser/parser';
import { tokenize } from '../../src/language/lexer';
import { parseWithBaselineRecovery } from '../../src/parser/recoveringParser';
import { parseWithErdf } from '../../src/erdf/instrumentedParser';
import { analyzeSemantics } from '../../src/semantics/typeChecker';
import { applyCandidateToSource } from '../../src/ui/utils/sourcePatcher';

describe('C Parsing & Self-Healing Recovery Support', () => {
  it('parses clean C functions, preprocessor headers, and types', () => {
    const source = `
      #include <stdio.h>

      int add(int a, int b) {
        return a + b;
      }

      int main() {
        int x = 10;
        float y = 3.14;
        int result = add(x, 20);
        return result;
      }
    `;

    const { tokens } = tokenize(source);
    const result = parseClean(tokens);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.ast.kind).toBe('Program');
    expect(result.ast.body.length).toBeGreaterThanOrEqual(3);

    const preprocessor = result.ast.body[0];
    expect(preprocessor.kind).toBe('PreprocessorDirective');

    const addFunc = result.ast.body[1];
    expect(addFunc.kind).toBe('FunctionDeclaration');
    if (addFunc.kind === 'FunctionDeclaration') {
      expect(addFunc.name.name).toBe('add');
      expect(addFunc.returnType).toBe('int');
      expect(addFunc.parameters).toHaveLength(2);
    }
  });

  it('parses C for loops and compound assignment expressions', () => {
    const source = `
      int compute() {
        int sum = 0;
        for (int i = 0; i < 10; i++) {
          sum += i;
        }
        return sum;
      }
    `;

    const { tokens } = tokenize(source);
    const result = parseClean(tokens);

    expect(result.diagnostics).toHaveLength(0);
    const fn = result.ast.body[0];
    expect(fn.kind).toBe('FunctionDeclaration');
  });

  it('self-heals missing parenthesis in C arithmetic expression', () => {
    const source = `
      int main() {
        int total = (10 + 20;
        return total;
      }
    `;

    const { tokens } = tokenize(source);
    const recoveryResult = parseWithBaselineRecovery(tokens);

    expect(recoveryResult.committedRepairs.length).toBeGreaterThan(0);
    const repair = recoveryResult.committedRepairs[0];
    expect(repair.edits.some((e) => e.token?.kind === 'RPAREN')).toBe(true);
  });

  it('self-heals missing semicolon in C declaration', () => {
    const source = `
      int main() {
        int price = 100
        int quantity = 3;
        return price * quantity;
      }
    `;

    const { tokens } = tokenize(source);
    const recoveryResult = parseWithBaselineRecovery(tokens);

    expect(recoveryResult.committedRepairs.length).toBeGreaterThan(0);
    const repair = recoveryResult.committedRepairs[0];
    expect(repair.edits.some((e) => e.token?.kind === 'SEMICOLON')).toBe(true);
  });

  it('generates deterministic ERDF traces for C execution', () => {
    const source = `
      #include <stdio.h>
      int main() {
        int count = 5;
        return count;
      }
    `;

    const result = parseWithErdf(source);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.runSummary.finalAstHash).toBeDefined();
    expect(result.runSummary.totalEvents).toBe(result.events.length);
  });

  it('flags error on isolated statement with no effect (total; tax;)', () => {
    const source = `#include <stdio.h>

int main() {
  int total = (10 + 20);
  int tax = 5;
  int final_sum = total;  tax;
  return final_sum;
}`;
    const { tokens } = tokenize(source);
    const clean = parseClean(tokens);
    const semantic = analyzeSemantics(clean.ast, source);

    expect(clean.diagnostics.length).toBeGreaterThan(0);
    expect(clean.diagnostics.some((d) => d.code === 'PARSE_STATEMENT_NO_EFFECT')).toBe(true);
    expect(semantic.diagnostics.length).toBeGreaterThan(0);
    expect(semantic.diagnostics.some((d) => d.code === 'SEM_STATEMENT_NO_EFFECT')).toBe(true);
  });

  it('flags error on isolated literal and identifier statements ((10); 20; and tax;)', () => {
    const source = `#include <stdio.h>

int main() {
  int total = (10); 20;
  int tax = 5;
  int final_sum = total;  tax;
  return final_sum;
}`;
    const { tokens } = tokenize(source);
    const clean = parseClean(tokens);
    const semantic = analyzeSemantics(clean.ast, source);

    expect(clean.diagnostics.length).toBe(2);
    expect(clean.diagnostics.every((d) => d.code === 'PARSE_STATEMENT_NO_EFFECT')).toBe(true);
    expect(semantic.diagnostics.length).toBe(2);
    expect(semantic.diagnostics.every((d) => d.code === 'SEM_STATEMENT_NO_EFFECT')).toBe(true);
  });

  it('self-heals missing RBRACE before ELSE and applies winning repair cleanly', () => {
    const source = `#include <stdio.h>

int add(int a, int b) {
  return a + b;
}

int main() {
  int result = add(10, 20) * 3 - 4 / 2;
  if (result > 50) {
    printf("High result: %d\\n", result);
    return 1;
   else {
    printf("Normal result: %d\\n", result);
    return 0;
  }
}`;
    const { tokens } = tokenize(source);
    const recovery = parseWithBaselineRecovery(tokens);

    expect(recovery.committedRepairs.length).toBeGreaterThanOrEqual(1);
    expect(recovery.committedRepairs[0].edits[0].token?.kind).toBe('RBRACE');
    expect(recovery.committedRepairs[0].expected).toContain('RBRACE');

    // Applying fix should produce clean valid C code
    const patched = applyCandidateToSource(source, recovery.committedRepairs[0], tokens);
    expect(patched).toContain('} else {');

    const cleanResult = parseClean(tokenize(patched).tokens);
    expect(cleanResult.diagnostics).toHaveLength(0);
    expect(cleanResult.ast.kind).toBe('Program');
  });
});
