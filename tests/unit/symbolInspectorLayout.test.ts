import { describe, it, expect, beforeEach } from 'vitest';
import { tokenize } from '../../src/language/lexer';
import { parseClean } from '../../src/parser/parser';
import {
  analyzeSemantics,
  resetTypeCheckerCounters,
  SemanticRepairCandidate,
} from '../../src/semantics/typeChecker';
import { ContextDrawerTab } from '../../src/ui/components/ContextDrawer';
import { useReplayStore } from '../../src/state/replayStore';

describe('Symbol Checking in Inspector & 3-Column Layout (Editor | AST | Inspector)', () => {
  beforeEach(() => {
    resetTypeCheckerCounters();
  });

  describe('ContextDrawer Inspector Tabs Configuration', () => {
    it('supports symbols tab in ContextDrawerTab union', () => {
      const activeTab: ContextDrawerTab = 'symbols';
      expect(activeTab).toBe('symbols');

      const allTabs: ContextDrawerTab[] = [
        'arena',
        'showdown',
        'doctor',
        'inspector',
        'symbols',
        'diagnostics',
      ];
      expect(allTabs).toContain('inspector');
      expect(allTabs).toContain('symbols');
      expect(allTabs).toHaveLength(6);
    });
  });

  describe('Symbol Typo Fixes & Actionable Recommendations ("Did you mean...?")', () => {
    it('detects undeclared typo "totl" and suggests quick-fix "total" with match percentage', () => {
      const code = `
int main() {
  int total = 100;
  return totl;
}
`;
      const { tokens } = tokenize(code);
      const parseRes = parseClean(tokens);
      expect(parseRes.ast).toBeDefined();

      const semanticRes = analyzeSemantics(parseRes.ast, code);
      expect(semanticRes.suggestions).toHaveLength(1);

      const fix = semanticRes.suggestions[0];
      expect(fix.originalName).toBe('totl');
      expect(fix.suggestedName).toBe('total');
      expect(fix.distance).toBe(1);
      expect(fix.matchPercentage).toBeGreaterThanOrEqual(80);
      expect(fix.symbol.name).toBe('total');
      expect(fix.symbol.typeSpecifier).toBe('int');
    });

    it('provides scope diagnostic recommendations for undeclared identifiers', () => {
      const code = `
int main() {
  int x = 5;
  return unknown_var;
}
`;
      const { tokens } = tokenize(code);
      const parseRes = parseClean(tokens);
      const semanticRes = analyzeSemantics(parseRes.ast, code);

      expect(semanticRes.diagnostics.length).toBeGreaterThanOrEqual(1);
      const undeclaredDiag = semanticRes.diagnostics.find(
        (d) => d.semanticKind === 'undeclared-identifier'
      );
      expect(undeclaredDiag).toBeDefined();
      expect(undeclaredDiag?.message).toContain('unknown_var');
    });

    it('reassures clean status when all identifiers and scopes resolve correctly', () => {
      const code = `
int compute(int val) {
  return val * 2;
}

int main() {
  int initial = 10;
  int doubled = compute(initial);
  return doubled;
}
`;
      const { tokens } = tokenize(code);
      const parseRes = parseClean(tokens);
      const semanticRes = analyzeSemantics(parseRes.ast, code);

      expect(semanticRes.suggestions).toHaveLength(0);
      expect(semanticRes.diagnostics).toHaveLength(0);
      expect(semanticRes.allScopes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Quick-Fix Patch Application in Store', () => {
    it('applies semantic typo fix replacing original name with suggested name', () => {
      const store = useReplayStore.getState();
      const codeWithTypo = `int main() {\n  int score = 42;\n  return scor;\n}`;
      store.setSourceCode(codeWithTypo);
      store.runParser();

      const stateAfterParse = useReplayStore.getState();
      expect(stateAfterParse.semanticResult?.suggestions.length).toBeGreaterThanOrEqual(1);

      const typoCandidate: SemanticRepairCandidate =
        stateAfterParse.semanticResult!.suggestions[0];
      expect(typoCandidate.originalName).toBe('scor');
      expect(typoCandidate.suggestedName).toBe('score');

      // Apply the semantic quick fix
      store.applySemanticFix(typoCandidate);

      const patchedState = useReplayStore.getState();
      expect(patchedState.sourceCode).toContain('return score;');
      expect(patchedState.sourceCode).not.toContain('return scor;');
      expect(patchedState.semanticResult?.suggestions).toHaveLength(0);
    });
  });

  describe('Comprehensive Semantic Recommendations & Multi-Typo Edge Cases', () => {
    it('generates accurate recommendations for type mismatches, redefinitions, and invalid returns', async () => {
      const { getSemanticRecommendation } = await import('../../src/semantics/typeChecker');

      const undeclaredRec = getSemanticRecommendation({
        semanticKind: 'undeclared-identifier',
        message: "Undeclared identifier 'x'",
      });
      expect(undeclaredRec).toContain('Declare the variable before usage');

      const mismatchRec = getSemanticRecommendation({
        semanticKind: 'type-mismatch',
        message: 'Type mismatch in initialization',
        actualType: 'char*',
        expectedType: 'int',
      });
      expect(mismatchRec).toContain("Ensure expression type 'char*' is compatible with target 'int'");

      const redefRec = getSemanticRecommendation({
        semanticKind: 'redefinition',
        message: "Redefinition of 'x'",
      });
      expect(redefRec).toContain('Rename this variable or remove the redundant declaration');

      const invalidReturnRec = getSemanticRecommendation({
        semanticKind: 'invalid-return',
        message: 'Invalid return type',
      });
      expect(invalidReturnRec).toContain('Ensure returned expression matches the declared return type');
    });

    it('detects multiple typos without truncation and provides recommendations for all of them', () => {
      const code = `
int main() {
  int total = 10;
  int count = 20;
  int price = 30;
  return totl + cout + pric;
}
`;
      const { tokens } = tokenize(code);
      const parseRes = parseClean(tokens);
      const semanticRes = analyzeSemantics(parseRes.ast, code);

      expect(semanticRes.suggestions).toHaveLength(3);
      const suggestedNames = semanticRes.suggestions.map((s) => s.suggestedName).sort();
      expect(suggestedNames).toEqual(['count', 'price', 'total']);
    });

    it('does not falsely report clean when semantic type errors exist without typos', () => {
      const code = `
int main() {
  int total = 10;
  return unknown_symbol;
}
`;
      const { tokens } = tokenize(code);
      const parseRes = parseClean(tokens);
      const semanticRes = analyzeSemantics(parseRes.ast, code);

      // Suggestions may be empty if distance > 2, but diagnostics must reflect the error
      expect(semanticRes.diagnostics.length).toBeGreaterThan(0);
      const isClean = semanticRes.suggestions.length === 0 && semanticRes.diagnostics.length === 0;
      expect(isClean).toBe(false);
    });
  });
});
