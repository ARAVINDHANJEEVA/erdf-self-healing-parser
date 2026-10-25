import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/language/lexer';
import { parseClean } from '../../src/parser/parser';
import { parseWithBaselineRecovery } from '../../src/parser/recoveringParser';
import { parseWithErdf } from '../../src/erdf/instrumentedParser';
import { analyzeSemantics } from '../../src/semantics/typeChecker';
import { applyCandidateToSource, applyMultipleCandidatesToSource } from '../../src/ui/utils/sourcePatcher';
import { calculateCandidateCost } from '../../src/recovery/costModel';
import { Edit, Token } from '../../src/language/types';

describe('User Reported Bugs Investigation & Robustness Suite', () => {
  it('Bug 1: flags error on isolated identifier statement (final_sum = total; tax;)', () => {
    const code1 = `#include <stdio.h>

int main() {
  int total = (10 + 20);
  int tax = 5;
  int final_sum = total;  tax;
  return final_sum;
}`;
    const { tokens } = tokenize(code1);
    const clean = parseClean(tokens);
    const semantic = analyzeSemantics(clean.ast, code1);

    expect(clean.diagnostics.length).toBeGreaterThan(0);
    expect(clean.diagnostics.some((d) => d.code === 'PARSE_STATEMENT_NO_EFFECT')).toBe(true);
    expect(clean.diagnostics.find((d) => d.code === 'PARSE_STATEMENT_NO_EFFECT')?.message).toContain("'tax'");
    expect(semantic.diagnostics.length).toBeGreaterThan(0);
    expect(semantic.diagnostics.some((d) => d.code === 'SEM_STATEMENT_NO_EFFECT')).toBe(true);
  });

  it('Bug 2: flags syntax error on isolated literal and identifier statements ((10); 20; and tax;)', () => {
    const code2 = `#include <stdio.h>

int main() {
  int total = (10); 20;
  int tax = 5;
  int final_sum = total;  tax;
  return final_sum;
}`;
    const { tokens } = tokenize(code2);
    const clean = parseClean(tokens);
    const semantic = analyzeSemantics(clean.ast, code2);

    expect(clean.diagnostics.length).toBe(2);
    expect(clean.diagnostics.every((d) => d.code === 'PARSE_STATEMENT_NO_EFFECT')).toBe(true);
    expect(clean.diagnostics[0].message).toContain("'20'");
    expect(clean.diagnostics[1].message).toContain("'tax'");
    expect(semantic.diagnostics.length).toBe(2);
    expect(semantic.diagnostics.every((d) => d.code === 'SEM_STATEMENT_NO_EFFECT')).toBe(true);
  });

  it('Bug 3: self-heals missing RBRACE before ELSE and applies winning fix cleanly', () => {
    const code3 = `#include <stdio.h>

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
    const { tokens } = tokenize(code3);
    const recovery = parseWithBaselineRecovery(tokens);

    expect(recovery.committedRepairs.length).toBeGreaterThanOrEqual(1);
    expect(recovery.committedRepairs[0].edits[0].token?.kind).toBe('RBRACE');
    expect(recovery.committedRepairs[0].expected).toContain('RBRACE');

    // Applying fix should produce clean valid C code
    const patched = applyCandidateToSource(code3, recovery.committedRepairs[0], tokens);
    expect(patched).toContain('} else {');

    const cleanResult = parseClean(tokenize(patched).tokens);
    expect(cleanResult.diagnostics).toHaveLength(0);
    expect(cleanResult.ast.kind).toBe('Program');

    // Also verify ERDF event instrumentation produces winning repairs
    const erdfResult = parseWithErdf(code3);
    expect(erdfResult.committedRepairs).toBeDefined();
    expect(erdfResult.committedRepairs!.length).toBeGreaterThanOrEqual(1);
    expect(erdfResult.events.some((e) => e.type === 'RepairCommitted')).toBe(true);
  });

  describe('Side-effect expression classification edge cases', () => {
    it('does NOT flag parenthesized assignment statement (x = 10);', () => {
      const code = `int main() {
  int x = 0;
  (x = 10);
  return x;
}`;
      const { tokens } = tokenize(code);
      const clean = parseClean(tokens);
      expect(clean.diagnostics.filter((d) => d.code === 'PARSE_STATEMENT_NO_EFFECT')).toHaveLength(0);
    });

    it('does NOT flag parenthesized function call (printf("hello"));', () => {
      const code = `int main() {
  (printf("hello\\n"));
  return 0;
}`;
      const { tokens } = tokenize(code);
      const clean = parseClean(tokens);
      expect(clean.diagnostics.filter((d) => d.code === 'PARSE_STATEMENT_NO_EFFECT')).toHaveLength(0);
    });

    it('does NOT flag pointer increment (*ptr++);', () => {
      const code = `int main() {
  int* ptr = 0;
  *ptr++;
  return 0;
}`;
      const { tokens } = tokenize(code);
      const clean = parseClean(tokens);
      expect(clean.diagnostics.filter((d) => d.code === 'PARSE_STATEMENT_NO_EFFECT')).toHaveLength(0);
    });

    it('DOES flag isolated parenthesized binary expression (10 + 20);', () => {
      const code = `int main() {
  (10 + 20);
  return 0;
}`;
      const { tokens } = tokenize(code);
      const clean = parseClean(tokens);
      const noEffectDiags = clean.diagnostics.filter((d) => d.code === 'PARSE_STATEMENT_NO_EFFECT');
      expect(noEffectDiags).toHaveLength(1);
      expect(noEffectDiags[0].message).toContain("'(10 + 20)'");
    });
  });

  describe('Multi-incident simultaneous recovery', () => {
    it('applies multiple repair solutions simultaneously without drift', () => {
      const code = `int main() {
  int a = 1
  if (a > 0) {
    return 1;
   else {
    return 0;
  }
}`;
      const { tokens } = tokenize(code);
      const recovery = parseWithBaselineRecovery(tokens);

      expect(recovery.committedRepairs.length).toBeGreaterThanOrEqual(2);
      const patched = applyMultipleCandidatesToSource(code, recovery.committedRepairs, tokens);

      const clean = parseClean(tokenize(patched).tokens);
      expect(clean.diagnostics).toHaveLength(0);
    });
  });

  describe('Keyword deletion & substitution penalty verification in cost model', () => {
    const dummySpan = { start: 0, end: 4, line: 1, column: 1 };
    const elseToken: Token = { id: 't1', kind: 'ELSE', lexeme: 'else', span: dummySpan, origin: 'source' };
    const rbraceToken: Token = { id: 't2', kind: 'RBRACE', lexeme: '}', span: dummySpan, origin: 'synthetic' };
    const mockValidation = { window: 4, sourceTokensProgressed: 2, outcome: 'pass' as const, failures: 0, reachedConstructEnd: true };

    it('heavily penalizes deleting keywords (ELSE, IF, WHILE, FOR, RETURN)', () => {
      const deleteElseEdit: Edit = { action: 'delete', position: 0, deletedToken: elseToken };
      const deleteCost = calculateCandidateCost([deleteElseEdit], mockValidation);

      const insertRbraceEdit: Edit = { action: 'insert', position: 0, token: rbraceToken };
      const insertCost = calculateCandidateCost([insertRbraceEdit], mockValidation);

      // Deleting else must incur structural (>= 6) and semantic risk (>= 8) penalties
      expect(deleteCost.structural).toBeGreaterThanOrEqual(6.0);
      expect(deleteCost.semanticRisk).toBeGreaterThanOrEqual(8.0);
      expect(deleteCost.total).toBeGreaterThan(insertCost.total * 2);
    });

    it('heavily penalizes substituting keywords away with delimiters', () => {
      const substituteElseEdit: Edit = {
        action: 'substitute',
        position: 0,
        token: rbraceToken,
        deletedToken: elseToken,
      };
      const subCost = calculateCandidateCost([substituteElseEdit], mockValidation);

      const insertRbraceEdit: Edit = { action: 'insert', position: 0, token: rbraceToken };
      const insertCost = calculateCandidateCost([insertRbraceEdit], mockValidation);

      // Substituting away 'else' must incur keyword destruction penalties
      expect(subCost.structural).toBeGreaterThanOrEqual(6.0);
      expect(subCost.semanticRisk).toBeGreaterThanOrEqual(8.0);
      expect(subCost.total).toBeGreaterThan(insertCost.total * 2);
    });
  });

  describe('Nested control-flow scopes missing brace before else', () => {
    it('accurately recovers missing brace in nested if inside for loop', () => {
      const nestedCode = `int process(int n) {
  int count = 0;
  for (int i = 0; i < n; i++) {
    if (i % 2 == 0) {
      count += i;
     else {
      count -= 1;
    }
  }
  return count;
}`;
      const { tokens } = tokenize(nestedCode);
      const recovery = parseWithBaselineRecovery(tokens);

      expect(recovery.committedRepairs.length).toBeGreaterThanOrEqual(1);
      const winner = recovery.committedRepairs[0];
      expect(winner.edits[0].token?.kind).toBe('RBRACE');

      const patched = applyCandidateToSource(nestedCode, winner, tokens);
      expect(patched).toContain('} else {');

      const clean = parseClean(tokenize(patched).tokens);
      expect(clean.diagnostics).toHaveLength(0);
      expect(clean.ast.kind).toBe('Program');
    });
  });
});

