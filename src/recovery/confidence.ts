/**
 * Confidence heuristic and ambiguity evaluation for recovery candidate ranking.
 */

import { RepairCandidate } from '../language/types';

export interface ConfidenceAssessment {
  readonly confidence: number; // Normalized to [0.0, 1.0]
  readonly isAmbiguous: boolean;
  readonly margin: number;
  readonly winningCandidateId?: string;
  readonly runnerUpCandidateId?: string;
}

export function evaluateConfidence(
  rankedCandidates: readonly RepairCandidate[],
  maxCost: number = 20.0,
  ambiguityThreshold: number = 0.8
): ConfidenceAssessment {
  const viable = rankedCandidates.filter(
    (c) => c.validation.outcome === 'pass' && c.status !== 'pruned'
  );

  if (viable.length === 0) {
    return {
      confidence: 0,
      isAmbiguous: false,
      margin: 0,
    };
  }

  const winner = viable[0];
  const c1 = winner.cost.total;
  const costFactor = Math.max(0, Math.min(1, 1 - c1 / maxCost));

  const windowTarget = Math.max(1, winner.validation.window);
  const stability = Math.max(
    0.2,
    Math.min(1, winner.validation.sourceTokensProgressed / windowTarget)
  );

  if (viable.length === 1) {
    const confidence = Math.round(costFactor * stability * 100) / 100;
    return {
      confidence,
      isAmbiguous: false,
      margin: maxCost - c1,
      winningCandidateId: winner.id,
    };
  }

  const runnerUp = viable[1];
  const c2 = runnerUp.cost.total;
  const margin = Math.max(0, Math.round((c2 - c1) * 100) / 100);
  const marginFactor = Math.min(1, margin / 2.0);

  const confidence =
    Math.round(costFactor * stability * (0.6 + 0.4 * marginFactor) * 100) / 100;

  const isAmbiguous = margin <= ambiguityThreshold;

  return {
    confidence,
    isAmbiguous,
    margin,
    winningCandidateId: winner.id,
    runnerUpCandidateId: runnerUp.id,
  };
}
