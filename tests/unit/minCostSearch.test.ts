import { describe, it, expect } from 'vitest';
import { tokenize, createSyntheticToken } from '../../src/language/lexer';
import { calculateCandidateCost } from '../../src/recovery/costModel';
import { evaluateConfidence } from '../../src/recovery/confidence';
import {
  searchMinimumCostRepairs,
  rankCandidates,
} from '../../src/recovery/minCostSearch';
import { createCheckpoint } from '../../src/parser/checkpoint';
import { Edit, RepairCandidate } from '../../src/language/types';
import { DEFAULT_CONFIG } from '../../src/config/defaultConfig';
import { parseWithBaselineRecovery } from '../../src/parser/recoveringParser';
import { LetDeclarationNode } from '../../src/language/ast';

describe('Weighted Minimum-Cost Search & Validation (Stage 6)', () => {
  it('calculates multi-factor costs with structural and semantic penalties', () => {
    const dummySpan = { start: 0, end: 1, line: 1, column: 1 };

    // Delimiter insertion (semicolon)
    const semiToken = createSyntheticToken('SEMICOLON', ';', dummySpan, 'test');
    const semiEdits: Edit[] = [{ action: 'insert', position: 0, token: semiToken }];
    const semiCost = calculateCandidateCost(semiEdits, {
      outcome: 'pass',
      sourceTokensProgressed: 4,
      failures: 0,
      reachedConstructEnd: true,
    });

    // Semicolon insertion has base lexical cost 1.0 + structural penalty (1.0 * 3.0) = 4.0
    expect(semiCost.lexical).toBe(1.0);
    expect(semiCost.structural).toBeGreaterThan(0);
    expect(semiCost.semanticRisk).toBe(0);
    expect(semiCost.diagnostic).toBe(0);

    // Identifier deletion
    const identToken = createSyntheticToken('IDENT', 'foo', dummySpan, 'test');
    const identEdits: Edit[] = [
      { action: 'delete', position: 0, deletedToken: identToken },
    ];
    const identCost = calculateCandidateCost(identEdits, {
      outcome: 'pass',
      sourceTokensProgressed: 4,
      failures: 0,
      reachedConstructEnd: true,
    });

    // Deleting an identifier incurs heavy semantic risk penalty
    expect(identCost.semanticRisk).toBeGreaterThan(0);
    expect(identCost.total).toBeGreaterThan(semiCost.total);
  });

  it('prunes candidates exceeding maxCost budget', () => {
    const source = 'let x = 10;';
    const { tokens } = tokenize(source);
    const cp = createCheckpoint(0, 0, [], [], 0);

    // Set an artificially tight maxCost budget of 0.5
    const tightConfig = {
      ...DEFAULT_CONFIG,
      budgets: {
        ...DEFAULT_CONFIG.budgets,
        maxCost: 0.5,
      },
    };

    const result = searchMinimumCostRepairs(
      tokens,
      cp,
      'SEMICOLON',
      tokens[0],
      ['SEMICOLON'],
      tightConfig
    );

    // Candidates whose cost > 0.5 should have status 'pruned'
    const prunedCandidates = result.candidates.filter((c) => c.status === 'pruned');
    expect(prunedCandidates.length).toBeGreaterThan(0);
  });

  it('ranks passing candidates deterministically by cost, progress, and ID', () => {
    const makeCandidate = (
      id: string,
      totalCost: number,
      outcome: 'pass' | 'fail',
      progress: number
    ): RepairCandidate => ({
      id,
      strategy: 'minimum-cost',
      edits: [],
      expected: ['SEMICOLON'],
      cost: { lexical: totalCost, structural: 0, semanticRisk: 0, diagnostic: 0, total: totalCost },
      validation: { window: 4, sourceTokensProgressed: progress, outcome, failures: outcome === 'pass' ? 0 : 1 },
      status: outcome === 'pass' ? 'generated' : 'rejected',
      reasons: [],
    });

    const c1 = makeCandidate('cand-1', 5.0, 'pass', 4);
    const c2 = makeCandidate('cand-2', 2.0, 'pass', 4);
    const c3 = makeCandidate('cand-3', 2.0, 'pass', 6);
    const c4 = makeCandidate('cand-4', 1.0, 'fail', 0);

    const ranked = rankCandidates([c1, c2, c3, c4]);

    // Passing candidates must precede failing candidates
    expect(ranked[3].id).toBe('cand-4');

    // c3 and c2 have cost 2.0, but c3 has higher progress (6 vs 4)
    expect(ranked[0].id).toBe('cand-3');
    expect(ranked[1].id).toBe('cand-2');
    expect(ranked[2].id).toBe('cand-1');
  });

  it('correctly assesses confidence and detects ambiguity', () => {
    const makeCandidate = (id: string, totalCost: number): RepairCandidate => ({
      id,
      strategy: 'minimum-cost',
      edits: [],
      expected: ['SEMICOLON'],
      cost: { lexical: totalCost, structural: 0, semanticRisk: 0, diagnostic: 0, total: totalCost },
      validation: { window: 4, sourceTokensProgressed: 4, outcome: 'pass', failures: 0 },
      status: 'generated',
      reasons: [],
    });

    // Clear winner: c1 cost 2.0, c2 cost 10.0 (large margin)
    const clearWinner = [makeCandidate('c1', 2.0), makeCandidate('c2', 10.0)];
    const confHigh = evaluateConfidence(clearWinner, 20.0, 0.8);
    expect(confHigh.confidence).toBeGreaterThan(0.7);
    expect(confHigh.isAmbiguous).toBe(false);

    // Ambiguous case: c1 cost 2.0, c2 cost 2.2 (small margin <= 0.8)
    const tiedCompetitors = [makeCandidate('c1', 2.0), makeCandidate('c2', 2.2)];
    const confAmbiguous = evaluateConfidence(tiedCompetitors, 20.0, 0.8);
    expect(confAmbiguous.isAmbiguous).toBe(true);
    expect(confAmbiguous.margin).toBeLessThanOrEqual(0.8);
  });

  it('end-to-end minimum-cost recovery recovers unclosed expression with high confidence', () => {
    const source = 'let sum = (10 + 20;\nlet next = 5;';
    const { tokens } = tokenize(source);
    const result = parseWithBaselineRecovery(tokens);

    expect(result.ast.body).toHaveLength(2);
    expect((result.ast.body[0] as LetDeclarationNode).identifier.name).toBe('sum');
    expect((result.ast.body[1] as LetDeclarationNode).identifier.name).toBe('next');

    // The winning repair should be committed and have confidence assessed
    expect(result.committedRepairs.length).toBeGreaterThan(0);
    expect(result.confidenceAssessments.length).toBeGreaterThan(0);
    expect(result.confidenceAssessments[0].winningCandidateId).toBeDefined();
  });
});
