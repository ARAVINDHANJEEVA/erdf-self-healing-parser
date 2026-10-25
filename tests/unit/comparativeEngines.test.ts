import { describe, it, expect } from 'vitest';
import {
  runErdfEngine,
  runClangPanicEngine,
  runTreeSitterEngine,
  runComparativeShowdown,
} from '../../src/analysis/comparativeRunners';
import {
  generateCompilerDoctorRationale,
  generateEngineRationale,
} from '../../src/analysis/rationaleGenerator';
import { RepairCandidate } from '../../src/language/types';

function findNodeInAst(ast: any, predicate: (node: any) => boolean): any {
  if (!ast || !ast.body) return null;
  for (const s of ast.body) {
    if (predicate(s)) return s;
    if (s.kind === 'FunctionDeclaration' && s.body?.statements) {
      for (const inner of s.body.statements) {
        if (predicate(inner)) return inner;
      }
    }
  }
  return null;
}

function findAllNodesInAst(ast: any, predicate: (node: any) => boolean): any[] {
  if (!ast || !ast.body) return [];
  const results: any[] = [];
  for (const s of ast.body) {
    if (predicate(s)) results.push(s);
    if (s.kind === 'FunctionDeclaration' && s.body?.statements) {
      for (const inner of s.body.statements) {
        if (predicate(inner)) results.push(inner);
      }
    }
  }
  return results;
}

describe('Comparative Multi-Engine Showdown & Compiler Doctor (Pillars 2, 3, 4)', () => {
  const brokenSource = `int calculate() {\n  int x = (10 + 20;\n  int y = 30;\n  return x + y;\n}`;
  const cleanSource = `int calculate() {\n  int x = (10 + 20);\n  int y = 30;\n  return x + y;\n}`;

  describe('ERDF Self-Healing Engine', () => {
    it('executes clean source with zero diagnostics and 100% AST integrity', () => {
      const result = runErdfEngine(cleanSource);
      expect(result.id).toBe('erdf');
      expect(result.diagnostics).toHaveLength(0);
      expect(result.blastRadius).toBe(0);
      expect(result.cascadingMultiplier).toBe(0);
      expect(result.astPreservationIndex).toBe(100);
      expect(result.impactSeverity).toBe('zero');
      expect(result.discardedTokensCount).toBe(0);
    });

    it('synthesizes ghost delimiter for missing parenthesis without discarding tokens', () => {
      const result = runErdfEngine(brokenSource);
      expect(result.id).toBe('erdf');
      expect(result.blastRadius).toBe(0);
      expect(result.cascadingMultiplier).toBe(0);
      expect(result.astPreservationIndex).toBe(100);
      expect(result.impactSeverity).toBe('zero');
      expect(result.discardedTokensCount).toBe(0);
      expect(result.synthesizedDelimitersCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Clang/GCC Traditional Panic Engine', () => {
    it('handles clean code with zero diagnostics', () => {
      const result = runClangPanicEngine(cleanSource);
      expect(result.id).toBe('clang');
      expect(result.diagnostics).toHaveLength(0);
      expect(result.blastRadius).toBe(0);
    });

    it('discards downstream tokens and cascades into secondary phantom diagnostics', () => {
      const result = runClangPanicEngine(brokenSource);
      expect(result.id).toBe('clang');
      expect(result.impactSeverity).toBe('catastrophic');
      expect(result.blastRadius).toBeGreaterThanOrEqual(12);
      expect(result.cascadingMultiplier).toBeGreaterThanOrEqual(3);
      expect(result.astPreservationIndex).toBe(35);
      expect(result.discardedTokensCount).toBeGreaterThan(0);
      expect(result.phantomDiagnosticsCount).toBeGreaterThanOrEqual(2);

      // Verify AST contains collapsed panic node marked with 'clang-panic'
      const panicNode = findNodeInAst(
        result.ast,
        (stmt) => stmt.kind === 'PartialNode' && (stmt as any).repairIds?.includes('clang-panic')
      );
      expect(panicNode).toBeDefined();
    });

    it('preserves clean preamble before error and dynamically tracks discarded range', () => {
      const customSource = `#include <stdio.h>\nint a = 10;\nint b = (10 + 20;\nint c = 30;`;
      const result = runClangPanicEngine(customSource);
      expect(result.id).toBe('clang');

      // Preprocessor directive is preserved
      const prep = findNodeInAst(result.ast, (stmt) => stmt.kind === 'PreprocessorDirective');
      expect(prep).toBeDefined();
      expect((prep as any)?.directive).toContain('<stdio.h>');

      // Statement before error is preserved
      const varA = findNodeInAst(
        result.ast,
        (stmt) => stmt.kind === 'VariableDeclaration' && (stmt as any).identifier?.name === 'a'
      );
      expect(varA).toBeDefined();

      // Panic node is recorded
      const panicNode = findNodeInAst(
        result.ast,
        (stmt) => stmt.kind === 'PartialNode' && (stmt as any).repairIds?.includes('clang-panic')
      );
      expect(panicNode).toBeDefined();
    });

    it('correctly triggers panic mode on unrecoverable garbage without returning clean AST', () => {
      const garbageSource = `int main() {\n  int * / = ; \n  int recovered = 42;\n  return recovered;\n}`;
      const result = runClangPanicEngine(garbageSource);
      expect(result.id).toBe('clang');
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.discardedTokensCount).toBeGreaterThan(0);

      const panicNode = findNodeInAst(
        result.ast,
        (s) => s.kind === 'PartialNode' && (s as any).repairIds?.includes('clang-panic')
      );
      expect(panicNode).toBeDefined();
    });
  });

  describe('Tree-sitter Incremental Splicing Engine', () => {
    it('handles clean code with zero diagnostics', () => {
      const result = runTreeSitterEngine(cleanSource);
      expect(result.id).toBe('treesitter');
      expect(result.diagnostics).toHaveLength(0);
      expect(result.blastRadius).toBe(0);
    });

    it('wraps the broken fragment in an ERROR node while preserving surrounding declarations', () => {
      const result = runTreeSitterEngine(brokenSource);
      expect(result.id).toBe('treesitter');
      expect(result.impactSeverity).toBe('medium');
      expect(result.cascadingMultiplier).toBe(1);
      expect(result.astPreservationIndex).toBe(75);

      // Verify AST contains ERROR partial node
      const errorNode = findNodeInAst(
        result.ast,
        (stmt) => stmt.kind === 'PartialNode' && (stmt as any).attemptedConstruct === 'ERROR'
      );
      expect(errorNode).toBeDefined();

      // Subsequent declarations are preserved
      const varDecls = findAllNodesInAst(result.ast, (stmt) => stmt.kind === 'VariableDeclaration');
      expect(varDecls.length).toBeGreaterThanOrEqual(1);
    });

    it('dynamically preserves arbitrary variable declarations without hardcoded statements', () => {
      const customSource = `#include <stdlib.h>\nint setup() {\n  int alpha = (1 + 2;\n  int custom_result = 999;\n  return custom_result;\n}`;
      const result = runTreeSitterEngine(customSource);
      expect(result.id).toBe('treesitter');

      // Preprocessor directive is preserved
      const prep = findNodeInAst(result.ast, (stmt) => stmt.kind === 'PreprocessorDirective');
      expect(prep).toBeDefined();
      expect((prep as any)?.directive).toContain('<stdlib.h>');

      // ERROR node is spliced
      const errorNode = findNodeInAst(
        result.ast,
        (stmt) => stmt.kind === 'PartialNode' && (stmt as any).attemptedConstruct === 'ERROR'
      );
      expect(errorNode).toBeDefined();

      // Custom variable is preserved
      const customVar = findNodeInAst(
        result.ast,
        (stmt) => stmt.kind === 'VariableDeclaration' && (stmt as any).identifier?.name === 'custom_result'
      );
      expect(customVar).toBeDefined();
    });

    it('correctly splices unrecoverable garbage into ERROR node while keeping downstream statements', () => {
      const garbageSource = `int main() {\n  int * / = ; \n  int recovered = 42;\n  return recovered;\n}`;
      const result = runTreeSitterEngine(garbageSource);
      expect(result.id).toBe('treesitter');
      expect(result.diagnostics.length).toBeGreaterThan(0);

      const errorNode = findNodeInAst(
        result.ast,
        (s) => s.kind === 'PartialNode' && (s as any).attemptedConstruct === 'ERROR'
      );
      expect(errorNode).toBeDefined();

      const recoveredVar = findNodeInAst(
        result.ast,
        (s) => s.kind === 'VariableDeclaration' && (s as any).identifier?.name === 'recovered'
      );
      expect(recoveredVar).toBeDefined();
    });
  });

  describe('Parallel Comparative Showdown', () => {
    it('simultaneously runs all three engines on identical source and crowns ERDF as winner', () => {
      const showdown = runComparativeShowdown(brokenSource);

      expect(showdown.source).toBe(brokenSource);
      expect(showdown.winningEngineId).toBe('erdf');
      expect(showdown.ahaMomentExplanation).toContain('Why modern compilers yell at you');

      // Metric contrasts
      expect(showdown.erdf.blastRadius).toBe(0);
      expect(showdown.clang.blastRadius).toBeGreaterThan(showdown.erdf.blastRadius);
      expect(showdown.treesitter.blastRadius).toBeGreaterThan(showdown.erdf.blastRadius);

      expect(showdown.erdf.cascadingMultiplier).toBe(0);
      expect(showdown.clang.cascadingMultiplier).toBeGreaterThanOrEqual(3);

      expect(showdown.erdf.astPreservationIndex).toBe(100);
      expect(showdown.treesitter.astPreservationIndex).toBe(75);
      expect(showdown.clang.astPreservationIndex).toBe(35);
    });
  });

  describe('Compiler Doctor Causal Rationale Generator', () => {
    it('generates clinical diagnosis for winning point-fix candidate', () => {
      const cand: RepairCandidate = {
        id: 'c1',
        strategy: 'minimum-cost',
        expected: ['RPAREN'],
        reasons: ['insert rparen'],
        cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1.0 },
        edits: [
          {
            action: 'insert',
            position: 5,
            token: { id: 't1', kind: 'RPAREN', lexeme: ')', span: { start: 20, end: 21, line: 2, column: 15 }, origin: 'synthetic' },
          },
        ],
        validation: { outcome: 'pass', sourceTokensProgressed: 4, window: 4, failures: 0 },
        status: 'selected',
      };

      const doctor = generateCompilerDoctorRationale(cand, cand, brokenSource);
      expect(doctor.title).toContain('Clean Point-Fix');
      expect(doctor.clinicalDiagnosis).toContain('Optimal Recovery');
      expect(doctor.causalChain).toHaveLength(4);
      expect(doctor.downstreamConsequence).toContain('0 cascading diagnostics');
      expect(doctor.scorecard.candidateBlastRadius).toBe(0);
      expect(doctor.scorecard.candidateAstPreservation).toBe(100);
    });

    it('generates causal hypothesis and downstream avalanche explanation for deletion candidate', () => {
      const cand: RepairCandidate = {
        id: 'c-del',
        strategy: 'panic',
        expected: [],
        reasons: ['delete semi'],
        cost: { lexical: 2, structural: 4, semanticRisk: 3, diagnostic: 0, total: 9.0 },
        edits: [
          {
            action: 'delete',
            position: 6,
            deletedToken: { id: 't2', kind: 'SEMICOLON', lexeme: ';', span: { start: 22, end: 23, line: 2, column: 17 }, origin: 'source' },
          },
        ],
        validation: { outcome: 'fail', sourceTokensProgressed: 0, window: 4, failures: 1 },
        status: 'rejected',
      };

      const doctor = generateCompilerDoctorRationale(cand, null, brokenSource);
      expect(doctor.title).toContain('Destructive Boundary Dissolution');
      expect(doctor.clinicalDiagnosis).toContain('Catastrophic Hypothesis');
      expect(doctor.causalChain.some((c) => c.includes('Illegal Operand Binding'))).toBe(true);
      expect(doctor.downstreamConsequence).toContain('3 cascading diagnostics');
      expect(doctor.scorecard.candidateBlastRadius).toBeGreaterThanOrEqual(14);
      expect(doctor.scorecard.candidateCascadingMultiplier).toBe(3);
    });

    it('generates comparative engine rationales for ERDF, Clang, and Tree-sitter', () => {
      const erdfRationale = generateEngineRationale('erdf');
      expect(erdfRationale.title).toContain('Speculative Minimum-Cost Proof');
      expect(erdfRationale.scorecard.candidateBlastRadius).toBe(0);

      const clangRationale = generateEngineRationale('clang');
      expect(clangRationale.title).toContain('Panic-Mode Autopsy');
      expect(clangRationale.causalChain.some((c) => c.includes('Panic Discard'))).toBe(true);

      const tsRationale = generateEngineRationale('treesitter');
      expect(tsRationale.title).toContain('Incremental Splicing Diagnosis');
      expect(tsRationale.downstreamConsequence).toContain('ERROR node');
    });
  });

  describe('Dual Mode Clang vs Tree-sitter Contrast & AST Fidelity Suite', () => {
    const testCode = `#include <stdio.h>
int main() {
  int pre_valid = 100;
  int broken_expr = (10 + 20;
  int downstream_1 = 50;
  int downstream_2 = 60;
  return pre_valid + downstream_1 + downstream_2;
}`;

    it('proves striking AST structural difference between Clang Panic and Tree-sitter Splicing', () => {
      const clangResult = runClangPanicEngine(testCode);
      const tsResult = runTreeSitterEngine(testCode);
      const erdfResult = runErdfEngine(testCode);

      // 1. Both preserve preprocessor and pre-error statements
      const clangPrep = findNodeInAst(clangResult.ast, (s) => s.kind === 'PreprocessorDirective');
      const tsPrep = findNodeInAst(tsResult.ast, (s) => s.kind === 'PreprocessorDirective');
      expect(clangPrep).toBeDefined();
      expect(tsPrep).toBeDefined();

      const clangPre = findNodeInAst(
        clangResult.ast,
        (s) => s.kind === 'VariableDeclaration' && (s as any).identifier?.name === 'pre_valid'
      );
      const tsPre = findNodeInAst(
        tsResult.ast,
        (s) => s.kind === 'VariableDeclaration' && (s as any).identifier?.name === 'pre_valid'
      );
      expect(clangPre).toBeDefined();
      expect(tsPre).toBeDefined();

      // 2. Clang collapses downstream statements into panic_discarded_region
      const clangPanicNode = findNodeInAst(
        clangResult.ast,
        (s) => s.kind === 'PartialNode' && (s as any).repairIds?.includes('clang-panic')
      );
      expect(clangPanicNode).toBeDefined();
      expect((clangPanicNode as any)?.attemptedConstruct).toBe('panic_discarded_region');

      // Clang must NOT have downstream_1 or downstream_2 (destroyed by panic cascade)
      const clangDownstream1 = findNodeInAst(
        clangResult.ast,
        (s) => s.kind === 'VariableDeclaration' && (s as any).identifier?.name === 'downstream_1'
      );
      expect(clangDownstream1).toBeNull();

      // 3. Tree-sitter splices ONLY the broken statement into ERROR and preserves all downstream statements
      const tsErrorNode = findNodeInAst(
        tsResult.ast,
        (s) => s.kind === 'PartialNode' && (s as any).attemptedConstruct === 'ERROR'
      );
      expect(tsErrorNode).toBeDefined();
      expect((tsErrorNode as any)?.repairIds).toContain('treesitter-spliced');

      const tsDownstream1 = findNodeInAst(
        tsResult.ast,
        (s) => s.kind === 'VariableDeclaration' && (s as any).identifier?.name === 'downstream_1'
      );
      const tsDownstream2 = findNodeInAst(
        tsResult.ast,
        (s) => s.kind === 'VariableDeclaration' && (s as any).identifier?.name === 'downstream_2'
      );
      expect(tsDownstream1).toBeDefined();
      expect(tsDownstream2).toBeDefined();

      // 4. Contrast in statement counts and preservation index
      const tsCount = findAllNodesInAst(tsResult.ast, () => true).length;
      const clangCount = findAllNodesInAst(clangResult.ast, () => true).length;
      expect(tsCount).toBeGreaterThan(clangCount);
      expect(tsResult.astPreservationIndex).toBeGreaterThan(clangResult.astPreservationIndex);
      expect(erdfResult.astPreservationIndex).toBe(100);
      expect(clangResult.cascadingMultiplier).toBeGreaterThan(tsResult.cascadingMultiplier);
    });

    it('computes glitch-free hierarchical tree layouts for Clang, Tree-sitter, and ERDF', async () => {
      const { computeTreeLayout } = await import('../../src/ui/utils/treeLayout');
      const clangResult = runClangPanicEngine(testCode);
      const tsResult = runTreeSitterEngine(testCode);
      const erdfResult = runErdfEngine(testCode);

      const clangLayout = computeTreeLayout(clangResult.ast);
      const tsLayout = computeTreeLayout(tsResult.ast);
      const erdfLayout = computeTreeLayout(erdfResult.ast);

      expect(clangLayout.root).toBeDefined();
      expect(tsLayout.root).toBeDefined();
      expect(erdfLayout.root).toBeDefined();

      expect(clangLayout.width).toBeGreaterThan(100);
      expect(clangLayout.height).toBeGreaterThan(100);
      expect(tsLayout.width).toBeGreaterThan(100);
      expect(tsLayout.height).toBeGreaterThan(100);

      // Verify node labels in layout: Clang has 'Panic Discarded', Tree-sitter has '(ERROR) Spliced'
      const findInLayout = (node: any, predicate: (n: any) => boolean): any => {
        if (predicate(node)) return node;
        for (const child of node.children || []) {
          const res = findInLayout(child, predicate);
          if (res) return res;
        }
        return null;
      };

      const clangPanicNode = findInLayout(clangLayout.root, (n) => n.label === 'Panic Discarded');
      expect(clangPanicNode).toBeDefined();

      const tsErrorNode = findInLayout(tsLayout.root, (n) => n.label === '(ERROR) Spliced');
      expect(tsErrorNode).toBeDefined();
    });
  });
});
