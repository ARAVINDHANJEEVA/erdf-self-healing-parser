/**
 * Weighted Minimum-Cost Search Engine.
 * Explores bounded 1-edit and 2-edit repairs, prunes unpromising paths,
 * speculatively validates candidates, and ranks them with deterministic tie-breaking.
 */

import {
  CostBreakdown,
  Edit,
  ParserCheckpoint,
  RepairCandidate,
  Token,
  TokenKind,
} from '../language/types';
import { createSyntheticToken } from '../language/lexer';
import { RecoveryConfig, DEFAULT_CONFIG } from '../config/defaultConfig';
import { runSpeculativeParse } from '../parser/speculativeRunner';
import { calculateCandidateCost } from './costModel';
import { ConfidenceAssessment, evaluateConfidence } from './confidence';

let candidateCounter = 0;

export function resetCandidateCounter(): void {
  candidateCounter = 0;
}

export interface SearchResult {
  readonly candidates: readonly RepairCandidate[];
  readonly winningCandidate: RepairCandidate | null;
  readonly confidence: ConfidenceAssessment;
  readonly exploredStatesCount: number;
}

export function searchMinimumCostRepairs(
  baseTokens: readonly Token[],
  checkpoint: ParserCheckpoint,
  expectedKind: TokenKind,
  actualToken: Token,
  allowedExpectedKinds: readonly TokenKind[] = [expectedKind],
  config: RecoveryConfig = DEFAULT_CONFIG
): SearchResult {
  const candidates: RepairCandidate[] = [];
  let exploredCount = 0;
  const pos = checkpoint.cursor;
  const windowSize = config.budgets.lookaheadWindow;

  // 1. Generate 1-edit candidates: Insertions
  for (const exp of allowedExpectedKinds) {
    if (exploredCount >= config.budgets.maxExploredStates) break;
    exploredCount++;

    const synth = createSyntheticToken(
      exp,
      getLexemeForKind(exp),
      actualToken.span,
      `Insert '${getLexemeForKind(exp)}'`,
      ++candidateCounter
    );

    const edits: Edit[] = [{ action: 'insert', position: pos, token: synth }];
    const cand = evaluateCandidate(
      'minimum-cost',
      edits,
      [exp],
      baseTokens,
      checkpoint,
      windowSize,
      config,
      `1-edit: Insert '${synth.lexeme}' before '${actualToken.lexeme || actualToken.kind}'`
    );
    candidates.push(cand);
  }

  // 2. Generate 1-edit candidates: Deletion of actual token
  if (actualToken.kind !== 'EOF' && exploredCount < config.budgets.maxExploredStates) {
    exploredCount++;
    const edits: Edit[] = [
      { action: 'delete', position: pos, deletedToken: actualToken },
    ];
    const cand = evaluateCandidate(
      'minimum-cost',
      edits,
      [expectedKind],
      baseTokens,
      checkpoint,
      windowSize,
      config,
      `1-edit: Delete unexpected token '${actualToken.lexeme || actualToken.kind}'`
    );
    candidates.push(cand);
  }

  // 3. Generate 1-edit candidates: Substitution of actual token
  if (actualToken.kind !== 'EOF') {
    for (const exp of allowedExpectedKinds) {
      if (exploredCount >= config.budgets.maxExploredStates) break;
      exploredCount++;

      const synth = createSyntheticToken(
        exp,
        getLexemeForKind(exp),
        actualToken.span,
        `Substitute with '${getLexemeForKind(exp)}'`,
        ++candidateCounter
      );

      const edits: Edit[] = [
        {
          action: 'substitute',
          position: pos,
          token: synth,
          deletedToken: actualToken,
        },
      ];
      const cand = evaluateCandidate(
        'minimum-cost',
        edits,
        [exp],
        baseTokens,
        checkpoint,
        windowSize,
        config,
        `1-edit: Substitute '${actualToken.lexeme || actualToken.kind}' with '${synth.lexeme}'`
      );
      candidates.push(cand);
    }
  }

  // 4. Bounded 2-edit exploration: Only if no 1-edit candidate achieved passing validation
  const anyPassing1Edit = candidates.some((c) => c.validation.outcome === 'pass');

  if (!anyPassing1Edit && config.budgets.maxEdits >= 2) {
    // 2-edit: Delete actual token AND insert expected delimiter
    if (actualToken.kind !== 'EOF') {
      for (const exp of allowedExpectedKinds) {
        if (exploredCount >= config.budgets.maxExploredStates) break;
        exploredCount++;

        const synth = createSyntheticToken(
          exp,
          getLexemeForKind(exp),
          actualToken.span,
          `Insert '${getLexemeForKind(exp)}' after deletion`,
          ++candidateCounter
        );

        const edits: Edit[] = [
          { action: 'delete', position: pos, deletedToken: actualToken },
          { action: 'insert', position: pos, token: synth },
        ];

        const cand = evaluateCandidate(
          'minimum-cost',
          edits,
          [exp],
          baseTokens,
          checkpoint,
          windowSize,
          config,
          `2-edit: Delete '${actualToken.lexeme || actualToken.kind}' and insert '${synth.lexeme}'`
        );
        candidates.push(cand);
      }
    }

    // 2-edit: Insert closing parenthesis followed by semicolon (e.g. unclosed expr statement)
    if (expectedKind === 'RPAREN' && exploredCount < config.budgets.maxExploredStates) {
      exploredCount++;
      const synthParen = createSyntheticToken('RPAREN', ')', actualToken.span, 'Insert )', ++candidateCounter);
      const synthSemi = createSyntheticToken('SEMICOLON', ';', actualToken.span, 'Insert ;', ++candidateCounter);

      const edits: Edit[] = [
        { action: 'insert', position: pos, token: synthParen },
        { action: 'insert', position: pos + 1, token: synthSemi },
      ];

      const cand = evaluateCandidate(
        'minimum-cost',
        edits,
        ['RPAREN', 'SEMICOLON'],
        baseTokens,
        checkpoint,
        windowSize,
        config,
        `2-edit: Insert ')' and ';'`
      );
      candidates.push(cand);
    }
  }

  // 5. Deterministic Ranking
  const ranked = rankCandidates(candidates);

  // 6. Select winner
  const viableWinner = ranked.find(
    (c) => c.validation.outcome === 'pass' && c.status !== 'pruned'
  );

  if (viableWinner) {
    (viableWinner as { status: string }).status = 'selected';
  }

  const confidence = evaluateConfidence(
    ranked,
    config.budgets.maxCost,
    config.ambiguityThreshold
  );

  return {
    candidates: ranked,
    winningCandidate: viableWinner || null,
    confidence,
    exploredStatesCount: exploredCount,
  };
}

function evaluateCandidate(
  strategy: 'minimum-cost',
  edits: readonly Edit[],
  expected: readonly TokenKind[],
  baseTokens: readonly Token[],
  checkpoint: ParserCheckpoint,
  windowSize: number,
  config: RecoveryConfig,
  reason: string
): RepairCandidate {
  const reasons: string[] = [reason];

  // Speculative validation
  const spec = runSpeculativeParse(baseTokens, checkpoint, edits, windowSize);

  // Cost calculation
  const cost: CostBreakdown = calculateCandidateCost(edits, spec, config);

  // Pruning check
  let status: 'generated' | 'pruned' | 'rejected' = 'generated';
  if (cost.total > config.budgets.maxCost) {
    status = 'pruned';
    reasons.push(`Pruned: cost ${cost.total} exceeds maxCost budget ${config.budgets.maxCost}`);
  } else if (spec.outcome === 'fail') {
    status = 'rejected';
    reasons.push('Rejected: secondary syntax error in lookahead window');
  }

  return {
    id: `cand-mincost-${++candidateCounter}`,
    strategy,
    edits,
    expected,
    cost,
    validation: {
      window: windowSize,
      sourceTokensProgressed: spec.sourceTokensProgressed,
      outcome: spec.outcome,
      failures: spec.failures,
    },
    status,
    reasons,
  };
}

export function rankCandidates(
  candidates: readonly RepairCandidate[]
): RepairCandidate[] {
  return [...candidates].sort((a, b) => {
    // 1. Passing validation outcome prioritized over fail/limit
    const aPass = a.validation.outcome === 'pass' && a.status !== 'pruned' ? 1 : 0;
    const bPass = b.validation.outcome === 'pass' && b.status !== 'pruned' ? 1 : 0;
    if (aPass !== bPass) return bPass - aPass;

    // 2. Lower total cost
    if (Math.abs(a.cost.total - b.cost.total) > 0.001) {
      return a.cost.total - b.cost.total;
    }

    // 3. Greater source tokens progressed in validation window
    if (a.validation.sourceTokensProgressed !== b.validation.sourceTokensProgressed) {
      return b.validation.sourceTokensProgressed - a.validation.sourceTokensProgressed;
    }

    // 4. Fewer edits
    if (a.edits.length !== b.edits.length) {
      return a.edits.length - b.edits.length;
    }

    // 5. Deterministic tie-breaker by ID
    return a.id.localeCompare(b.id);
  });
}

function getLexemeForKind(kind: TokenKind): string {
  switch (kind) {
    case 'SEMICOLON':
      return ';';
    case 'RPAREN':
      return ')';
    case 'LPAREN':
      return '(';
    case 'RBRACE':
      return '}';
    case 'LBRACE':
      return '{';
    case 'COMMA':
      return ',';
    case 'ASSIGN':
      return '=';
    case 'PLUS':
      return '+';
    default:
      return kind.toLowerCase();
  }
}
