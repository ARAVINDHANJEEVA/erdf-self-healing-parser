import { describe, it, expect } from 'vitest';
import {
  countAstConstructs,
  countHealthyConstructs,
  calculateCandidateBlastRadius,
  calculateEngineBlastRadius,
} from '../../src/analysis/blastRadiusEngine';
import {
  createProgram,
  createVariableDeclaration,
  createIdentifierNode,
  createLiteralNode,
  createBlockStatement,
  createPartialNode,
  createIfStatement,
  createReturnStatement,
} from '../../src/language/ast';
import { Diagnostic, RepairCandidate } from '../../src/language/types';

describe('Blast Radius & Impact Analysis Engine (Pillar 1)', () => {
  describe('AST Construct Counting', () => {
    it('accurately counts healthy and partial constructs in hierarchical AST', () => {
      const dummySpan = { start: 0, end: 10, line: 1, column: 1 };
      const ident1 = createIdentifierNode('x', dummySpan);
      const lit1 = createLiteralNode(42, '42', 'number', dummySpan);
      const varDecl = createVariableDeclaration('int', ident1, lit1, dummySpan);

      const partialStmt = createPartialNode('error_stmt', [], 'diag-1', dummySpan);
      const block = createBlockStatement([varDecl, partialStmt], dummySpan);
      const program = createProgram([block], dummySpan);

      // Total constructs: program (1) + block (1) + varDecl (1) + partialStmt (1) = 4
      const total = countAstConstructs(program);
      expect(total).toBe(4);

      // Healthy constructs: program (1) + block (1) + varDecl (1) = 3 (partialStmt excluded)
      const healthy = countHealthyConstructs(program);
      expect(healthy).toBe(3);
    });

    it('handles nested if-statements and conditional branches', () => {
      const dummySpan = { start: 0, end: 10, line: 1, column: 1 };
      const cond = createIdentifierNode('flag', dummySpan);
      const thenStmt = createReturnStatement(createLiteralNode(1, '1', 'number', dummySpan), dummySpan);
      const elseStmt = createReturnStatement(createLiteralNode(0, '0', 'number', dummySpan), dummySpan);
      const ifStmt = createIfStatement(cond, thenStmt, elseStmt, dummySpan);
      const program = createProgram([ifStmt], dummySpan);

      // Program + ifStmt + cond + thenStmt + elseStmt
      const total = countAstConstructs(program);
      expect(total).toBeGreaterThanOrEqual(4);
      expect(countHealthyConstructs(program)).toBe(total);
    });

    it('handles null or empty AST gracefully', () => {
      expect(countAstConstructs(null)).toBe(0);
      expect(countHealthyConstructs(null)).toBe(0);
      expect(countAstConstructs(undefined)).toBe(0);
    });
  });

  describe('Candidate Blast-Radius Evaluation', () => {
    const sampleSource = `int compute() {\n  int a = (10 + 20;\n  int b = 30;\n  return a + b;\n}`;

    it('classifies winning point-fix candidate in Emerald Zone (Zero Blast Radius)', () => {
      const winningCand: RepairCandidate = {
        id: 'cand-winner-1',
        strategy: 'minimum-cost',
        expected: ['RPAREN'],
        reasons: ['synthesize ghost delimiter'],
        cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1.0 },
        edits: [
          {
            action: 'insert',
            position: 8,
            token: {
              id: 'tok-rparen',
              kind: 'RPAREN',
              lexeme: ')',
              span: { start: 33, end: 34, line: 2, column: 19 },
              origin: 'synthetic',
            },
          },
        ],
        validation: {
          outcome: 'pass',
          sourceTokensProgressed: 4,
          window: 4,
          failures: 0,
        },
        status: 'selected',
      };

      const assessment = calculateCandidateBlastRadius(sampleSource, winningCand, [winningCand], winningCand);

      expect(assessment.severity).toBe('zero');
      expect(assessment.zoneName).toBe('Emerald Zone (Zero Blast Radius)');
      expect(assessment.blastRadius).toBe(0);
      expect(assessment.cascadingMultiplier).toBe(0);
      expect(assessment.astPreservationIndex).toBe(100);
      expect(assessment.affectedLines).toEqual([2]);
      expect(assessment.secondaryDiagnostics).toHaveLength(0);
    });

    it('classifies deletion repair candidate in Crimson Avalanche Zone (Catastrophic)', () => {
      const destructiveCand: RepairCandidate = {
        id: 'cand-del-semi',
        strategy: 'panic',
        expected: [],
        reasons: ['delete unexpected delimiter'],
        cost: { lexical: 1.5, structural: 4, semanticRisk: 3, diagnostic: 0, total: 8.5 },
        edits: [
          {
            action: 'delete',
            position: 9,
            deletedToken: {
              id: 'tok-semi',
              kind: 'SEMICOLON',
              lexeme: ';',
              span: { start: 34, end: 35, line: 2, column: 20 },
              origin: 'source',
            },
          },
        ],
        validation: {
          outcome: 'fail',
          sourceTokensProgressed: 0,
          window: 4,
          failures: 1,
        },
        status: 'rejected',
      };

      const assessment = calculateCandidateBlastRadius(sampleSource, destructiveCand, [destructiveCand], null);

      expect(assessment.severity).toBe('catastrophic');
      expect(assessment.zoneName).toBe('Crimson Avalanche Zone (Catastrophic Blast Radius)');
      expect(assessment.blastRadius).toBeGreaterThanOrEqual(14);
      expect(assessment.cascadingMultiplier).toBeGreaterThanOrEqual(3);
      expect(assessment.astPreservationIndex).toBeLessThanOrEqual(45);
      expect(assessment.affectedLines.length).toBeGreaterThanOrEqual(2);
      expect(assessment.explanation).toContain('Catastrophic Avalanche');
    });

    it('classifies pruned candidate with partial progress in Amber Shockwave (Medium)', () => {
      const partialCand: RepairCandidate = {
        id: 'cand-sub-tok',
        strategy: 'minimum-cost',
        expected: ['IDENT'],
        reasons: ['substitute identifier'],
        cost: { lexical: 2.5, structural: 2.0, semanticRisk: 1.5, diagnostic: 0, total: 6.0 },
        edits: [
          {
            action: 'substitute',
            position: 8,
            token: {
              id: 'tok-ident',
              kind: 'IDENT',
              lexeme: 'temp',
              span: { start: 33, end: 34, line: 2, column: 19 },
              origin: 'synthetic',
            },
          },
        ],
        validation: {
          outcome: 'fail',
          sourceTokensProgressed: 2,
          window: 4,
          failures: 1,
        },
        status: 'pruned',
      };

      const assessment = calculateCandidateBlastRadius(sampleSource, partialCand, [partialCand], null);

      expect(assessment.severity).toBe('medium');
      expect(assessment.zoneName).toBe('Amber Shockwave (Medium Blast Radius)');
      expect(assessment.blastRadius).toBeGreaterThan(0);
      expect(assessment.cascadingMultiplier).toBeGreaterThanOrEqual(1);
      expect(assessment.astPreservationIndex).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Comparative Engine Blast-Radius Evaluation', () => {
    const dummySpan = { start: 0, end: 30, line: 1, column: 1 };
    const dummyAst = createProgram([], dummySpan);

    it('evaluates ERDF engine with zero impact and 100% preservation', () => {
      const assessment = calculateEngineBlastRadius('let a = (10;\nlet b = 20;', 'erdf', [], dummyAst, 0);

      expect(assessment.severity).toBe('zero');
      expect(assessment.blastRadius).toBe(0);
      expect(assessment.cascadingMultiplier).toBe(0);
      expect(assessment.astPreservationIndex).toBe(100);
      expect(assessment.zoneName).toContain('Emerald');
      expect(assessment.affectedLines).toEqual([]);

      const recoveredDiags: Diagnostic[] = [
        { id: 'd0', severity: 'warning', message: 'recovered', span: { start: 10, end: 11, line: 2, column: 5 }, code: 'R1' },
      ];
      const recoveredAssessment = calculateEngineBlastRadius('let a = 10;\nlet b = (20;', 'erdf', recoveredDiags, dummyAst, 0);
      expect(recoveredAssessment.affectedLines).toEqual([2]);
    });

    it('evaluates Clang panic mode with catastrophic avalanche and cascading phantom errors', () => {
      const mockDiags: Diagnostic[] = [
        { id: 'd1', severity: 'error', message: 'expected )', span: { start: 10, end: 11, line: 1, column: 11 }, code: 'C100' },
        { id: 'd2', severity: 'error', message: 'type keyword illegal', span: { start: 20, end: 23, line: 2, column: 1 }, code: 'C101' },
        { id: 'd3', severity: 'error', message: 'undeclared identifier', span: { start: 30, end: 31, line: 3, column: 1 }, code: 'C102' },
        { id: 'd4', severity: 'error', message: 'missing return', span: { start: 40, end: 41, line: 4, column: 1 }, code: 'C103' },
      ];

      const assessment = calculateEngineBlastRadius('let a = (10;\nlet b = 20;\nreturn a;', 'clang', mockDiags, dummyAst, 15);

      expect(assessment.severity).toBe('catastrophic');
      expect(assessment.zoneName).toContain('Crimson');
      expect(assessment.blastRadius).toBeGreaterThanOrEqual(12);
      expect(assessment.cascadingMultiplier).toBeGreaterThanOrEqual(3);
      expect(assessment.astPreservationIndex).toBe(35);
      expect(assessment.affectedLines.length).toBeGreaterThanOrEqual(2);
    });

    it('evaluates Tree-sitter splicing with contained medium shockwave', () => {
      const mockDiags: Diagnostic[] = [
        { id: 'd1', severity: 'error', message: 'unparsable statement', span: { start: 10, end: 11, line: 1, column: 11 }, code: 'TS100' },
      ];

      const assessment = calculateEngineBlastRadius('let a = (10;\nlet b = 20;', 'treesitter', mockDiags, dummyAst, 4);

      expect(assessment.severity).toBe('medium');
      expect(assessment.zoneName).toContain('Amber');
      expect(assessment.blastRadius).toBe(4);
      expect(assessment.cascadingMultiplier).toBe(1);
      expect(assessment.astPreservationIndex).toBe(75);
    });
  });
});
