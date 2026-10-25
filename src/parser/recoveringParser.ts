/**
 * Self-healing parser supporting Weighted Minimum-Cost Search and Panic mode synchronization.
 * Explores bounded repair candidates, scores them using multi-factor cost penalties,
 * speculatively validates lookahead progress, and deterministically commits winning repairs.
 */

import {
  Diagnostic,
  RepairCandidate,
  Token,
  TokenKind,
} from '../language/types';
import { Parser, ParseResult, combineSpans, ParserEventListener } from './parser';
import { getSyncSetForRule } from '../recovery/syncSets';
import { performPanicRecovery } from '../recovery/panic';
import { StatementNode, createProgram, resetAstNodeCounter } from '../language/ast';
import { VirtualTokenStream } from './virtualStream';
import { RecoveryConfig, DEFAULT_CONFIG } from '../config/defaultConfig';
import { searchMinimumCostRepairs } from '../recovery/minCostSearch';
import { ConfidenceAssessment } from '../recovery/confidence';

export interface RecoveringParseResult extends ParseResult {
  readonly candidates: readonly RepairCandidate[];
  readonly committedRepairs: readonly RepairCandidate[];
  readonly confidenceAssessments: readonly ConfidenceAssessment[];
}

export class RecoveringParser extends Parser {
  private readonly config: RecoveryConfig;
  private readonly allCandidates: RepairCandidate[] = [];
  private readonly committedRepairs: RepairCandidate[] = [];
  private readonly confidenceAssessments: ConfidenceAssessment[] = [];

  constructor(
    tokens: readonly Token[],
    config: RecoveryConfig = DEFAULT_CONFIG,
    listener?: ParserEventListener
  ) {
    const stream = new VirtualTokenStream(tokens, 0);
    super(stream, [], [], 0, listener);
    this.config = config;
  }

  public override parse(): RecoveringParseResult {
    resetAstNodeCounter();
    const statements: StatementNode[] = [];
    const firstToken = this.peek();

    while (!this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        statements.push(stmt);
        this.listener?.onNodeCreated?.(stmt);
      } catch {
        // Fallback to panic mode at top-level statement boundary
        const syncSet = getSyncSetForRule('statement');
        this.isPanicMode = true;
        const panicResult = performPanicRecovery(
          () => this.advance(),
          () => this.peek(),
          () => this.isAtEnd(),
          syncSet,
          'statement',
          this.peek().span
        );
        this.isPanicMode = false;
        statements.push(panicResult.partialNode);
        this.diagnostics.push(panicResult.diagnostic);

        this.listener?.onPanicDiscard?.(
          panicResult.discardedTokens,
          Array.from(syncSet),
          panicResult.resyncToken,
          panicResult.partialNode.id
        );
        this.listener?.onNodeCreated?.(panicResult.partialNode);
      }
    }

    if (this.check('EOF') && !this.stream.isAtEnd()) {
      this.advance();
    }

    const lastToken = this.previous() || firstToken;
    const programSpan = combineSpans(firstToken.span, lastToken.span);
    const ast = createProgram(statements, programSpan);

    return {
      ast,
      diagnostics: this.diagnostics,
      candidates: this.allCandidates,
      committedRepairs: this.committedRepairs,
      confidenceAssessments: this.confidenceAssessments,
    };
  }

  protected override expect(expected: TokenKind, context: string): Token {
    const actual = this.peek();
    if (actual.kind === expected) {
      return this.advance();
    }

    // Capture checkpoint right at failure point
    const checkpoint = this.captureCheckpoint();
    const activeRule = this.getActiveRule();

    this.listener?.onSyntaxErrorDetected?.(
      actual,
      [expected],
      context,
      activeRule,
      checkpoint.cursor,
      this.getDelimiterStack()
    );

    // 1. Search for minimum-cost repairs
    const searchResult = searchMinimumCostRepairs(
      this.stream.toArray(),
      checkpoint,
      expected,
      actual,
      [expected],
      this.config
    );

    this.allCandidates.push(...searchResult.candidates);
    this.confidenceAssessments.push(searchResult.confidence);

    for (const cand of searchResult.candidates) {
      this.listener?.onCandidateGenerated?.(cand);
      if (cand.status === 'pruned') {
        this.listener?.onCandidatePruned?.(
          cand,
          cand.reasons[cand.reasons.length - 1] || 'Pruned by budget'
        );
      } else {
        this.listener?.onCandidateValidated?.(cand);
        if (cand.status === 'rejected') {
          this.listener?.onCandidateRejected?.(
            cand,
            cand.reasons[cand.reasons.length - 1] || 'Rejected in ranking'
          );
        }
      }
    }

    const winner = searchResult.winningCandidate;

    if (winner && winner.edits.length > 0) {
      // Commit winning repair
      this.committedRepairs.push(winner);

      const firstEdit = winner.edits[0];
      const repairDescription = winner.reasons[0] || 'Committed repair';

      this.listener?.onRepairSelected?.(
        winner,
        searchResult.confidence,
        searchResult.candidates.length
      );
      this.listener?.onRepairCommitted?.(
        winner,
        this.stream.toArray().length + winner.edits.length
      );

      this.diagnostics.push({
        id: `diag-recovery-${checkpoint.cursor}`,
        severity: 'warning',
        message: `Recovered (${winner.strategy}): ${repairDescription} (cost: ${winner.cost.total}, confidence: ${searchResult.confidence.confidence}).`,
        span: actual.span,
        code: `RECOVERY_${winner.strategy.toUpperCase()}_${expected}`,
      });

      // Construct a new virtual stream with all winner edits applied
      const newStream = VirtualTokenStream.fromEdits(
        this.stream.toArray(),
        winner.edits,
        checkpoint.cursor
      );

      this.setStream(newStream);

      // If the primary action was a deletion, the invalid token was removed;
      // retry expecting the required token
      if (firstEdit.action === 'delete') {
        return this.expect(expected, context);
      }

      // If the primary action was insertion or substitution, consume the newly available token
      return this.advance();
    }

    // 2. If no candidate validated, emit syntax error and throw for panic fallback
    const expectedName = expected;
    const actualName = actual.lexeme || actual.kind;

    const diagnostic: Diagnostic = {
      id: `diag-parse-${actual.span.start}`,
      severity: 'error',
      message: `Expected '${expectedName}' in ${context}, but found '${actualName}'.`,
      span: actual.span,
      code: `PARSE_EXPECTED_${expected}`,
    };

    this.diagnostics.push(diagnostic);
    throw new Error(diagnostic.message);
  }
}

/**
 * Convenience entry point to parse a token stream with weighted minimum-cost self-healing recovery.
 */
export function parseWithBaselineRecovery(
  tokens: readonly Token[],
  config: RecoveryConfig = DEFAULT_CONFIG
): RecoveringParseResult {
  const parser = new RecoveringParser(tokens, config);
  return parser.parse();
}
