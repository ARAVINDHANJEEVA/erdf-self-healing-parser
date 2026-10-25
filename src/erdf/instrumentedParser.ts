/**
 * Fully instrumented ERDF parser orchestrator.
 * Implements the pure core function:
 * parse(T, G, C) -> (A, D, E)
 * emitting append-only, schema-versioned ERDF events with state hashes.
 */

import { Diagnostic, RepairCandidate } from '../language/types';
import { tokenize } from '../language/lexer';
import { ProgramNode } from '../language/ast';
import { RecoveryConfig, DEFAULT_CONFIG } from '../config/defaultConfig';
import { ERDF_SCHEMA_VERSION, ErdfEvent, RunCompletedPayload } from './schema';
import { computeErdfStateHash, hashAst, hashObject, hashString } from './hasher';
import { RecoveringParser } from '../parser/recoveringParser';
import { ParserEventListener } from '../parser/parser';

export interface ErdfParseResult {
  readonly ast: ProgramNode;
  readonly diagnostics: readonly Diagnostic[];
  readonly events: readonly ErdfEvent[];
  readonly runSummary: RunCompletedPayload;
  readonly committedRepairs?: readonly RepairCandidate[];
}

export class InstrumentedParser {
  private readonly source: string;
  private readonly config: RecoveryConfig;
  private readonly runId: string;
  private events: ErdfEvent[] = [];
  private sequence: number = 0;

  constructor(source: string, config: RecoveryConfig = DEFAULT_CONFIG) {
    this.source = source;
    this.config = config;
    this.runId = `run-${hashString(source).slice(0, 8)}`;
  }

  public parse(): ErdfParseResult {
    const startTime = performance.now();
    this.events = [];
    this.sequence = 0;

    // 1. Lexing phase
    const lexResult = tokenize(this.source);
    const tokens = lexResult.tokens;

    // Emit lexical syntax error events if any
    for (const lexDiag of lexResult.diagnostics) {
      const errSpan = lexDiag.span;
      this.emitEvent('SyntaxErrorDetected', 'lex', 'cp-0', {
        actualToken: {
          kind: 'unknown',
          lexeme: this.source.slice(errSpan.start, errSpan.end) || '?',
          span: errSpan,
          origin: 'source',
        },
        expectedKinds: [],
        grammarRule: 'lexer',
        context: lexDiag.message,
        checkpointCursor: 0,
        delimiterStack: [],
      });
    }

    // 2. Real-time chronological event listener
    let activeCursor = 0;
    const listener: ParserEventListener = {
      onTokenConsumed: (token, cursor, activeRule) => {
        activeCursor = cursor;
        this.emitEvent('TokenConsumed', 'parse', `cp-${cursor}`, {
          token,
          cursor,
          activeRule,
        });
      },
      onSyntaxErrorDetected: (actualToken, expectedKinds, context, grammarRule, checkpointCursor, delimiterStack) => {
        this.emitEvent('SyntaxErrorDetected', 'recovery', `cp-${checkpointCursor}`, {
          actualToken,
          expectedKinds: [...expectedKinds],
          grammarRule,
          context,
          checkpointCursor,
          delimiterStack: [...delimiterStack],
        });
      },
      onCandidateGenerated: (cand) => {
        this.emitEvent('CandidateGenerated', 'recovery', `cp-${activeCursor}`, {
          candidateId: cand.id,
          strategy: cand.strategy,
          edits: cand.edits,
          expected: cand.expected,
          reason: cand.reasons[0] || 'Generated candidate',
        });
      },
      onCandidatePruned: (cand, pruneReason) => {
        this.emitEvent('CandidatePruned', 'recovery', `cp-${activeCursor}`, {
          candidateId: cand.id,
          pruneReason,
          cost: cand.cost,
        });
      },
      onCandidateValidated: (cand) => {
        this.emitEvent('CandidateValidated', 'recovery', `cp-${activeCursor}`, {
          candidateId: cand.id,
          validation: cand.validation,
          cost: cand.cost,
        });
      },
      onCandidateRejected: (cand, rejectReason) => {
        this.emitEvent('CandidateRejected', 'recovery', `cp-${activeCursor}`, {
          candidateId: cand.id,
          rejectReason,
          cost: cand.cost,
        });
      },
      onRepairSelected: (rep, conf, altCount) => {
        this.emitEvent('RepairSelected', 'recovery', `cp-${activeCursor}`, {
          winningCandidateId: rep.id,
          strategy: rep.strategy,
          cost: rep.cost,
          confidence: conf,
          alternativeCount: altCount,
        });
      },
      onRepairCommitted: (rep, resultingLength) => {
        this.emitEvent('RepairCommitted', 'commit', `cp-${activeCursor}`, {
          candidateId: rep.id,
          editsApplied: rep.edits,
          resultingStreamLength: resultingLength,
        });
      },
      onPanicDiscard: (discardedTokens, syncSet, resyncToken, partialNodeId) => {
        this.emitEvent('PanicDiscard', 'recovery', `cp-${activeCursor}`, {
          discardedTokens: [...discardedTokens],
          syncSet: [...syncSet],
          resyncToken,
          partialNodeId,
        });
      },
      onNodeCreated: (stmt) => {
        this.emitEvent('NodeCreated', 'commit', `cp-${activeCursor}`, {
          nodeId: stmt.id,
          kind: stmt.kind,
          span: stmt.span,
          provenance: stmt.provenance,
          repairIds: stmt.repairIds,
        });
      },
    };

    // 3. Instrumented parsing & recovery execution
    const parser = new RecoveringParser(tokens, this.config, listener);
    const parseResult = parser.parse();

    // 4. Final RunCompleted event
    const endTime = performance.now();
    const inputHash = hashString(this.source);
    const grammarHash = hashString(this.config.grammarVersion);
    const configHash = hashObject(this.config);
    const finalAstHash = hashAst(parseResult.ast);

    const combinedDiagnostics = [...lexResult.diagnostics, ...parseResult.diagnostics];

    const runSummary: RunCompletedPayload = {
      inputHash,
      grammarHash,
      configHash,
      finalAstHash,
      diagnosticCount: combinedDiagnostics.length,
      totalEvents: this.events.length + 1,
      executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
    };

    this.emitEvent('RunCompleted', 'commit', `cp-${activeCursor}`, runSummary);

    return {
      ast: parseResult.ast,
      diagnostics: combinedDiagnostics,
      events: this.events,
      runSummary,
      committedRepairs: parseResult.committedRepairs,
    };
  }

  private emitEvent<TType extends string, TPayload>(
    type: TType,
    phase: 'lex' | 'parse' | 'recovery' | 'commit',
    checkpointRef: string,
    payload: TPayload
  ): void {
    const sequence = ++this.sequence;
    const stateHash = computeErdfStateHash(
      sequence,
      this.events.length,
      0,
      0,
      0
    );

    const event: ErdfEvent = {
      eventId: sequence,
      runId: this.runId,
      schemaVersion: ERDF_SCHEMA_VERSION,
      sequence,
      phase,
      type,
      checkpointRef,
      payload: payload as any,
      stateHash,
    } as ErdfEvent;

    this.events.push(event);
  }
}

/**
 * Pure top-level API function executing parsing with full ERDF telemetry.
 */
export function parseWithErdf(
  source: string,
  config: RecoveryConfig = DEFAULT_CONFIG
): ErdfParseResult {
  const orchestrator = new InstrumentedParser(source, config);
  return orchestrator.parse();
}
