/**
 * Pure, immutable ERDF replay reducer for time-travel state reconstruction.
 */

import { Diagnostic, RepairCandidate, Token } from '../language/types';
import { ErdfEvent, ErdfPhase, NodeCreatedPayload } from './schema';
import { computeErdfStateHash } from './hasher';

export interface ReplayState {
  readonly sequence: number;
  readonly runId: string;
  readonly phase: ErdfPhase;
  readonly cursor: number;
  readonly tokens: readonly Token[];
  readonly activeRule?: string;
  readonly currentCheckpointRef?: string;
  readonly candidates: readonly RepairCandidate[];
  readonly winningCandidateId?: string;
  readonly committedRepairs: readonly RepairCandidate[];
  readonly createdNodes: readonly NodeCreatedPayload[];
  readonly diagnostics: readonly Diagnostic[];
  readonly stateHash: string;
}

export function createInitialReplayState(
  runId: string,
  initialTokens: readonly Token[]
): ReplayState {
  return {
    sequence: 0,
    runId,
    phase: 'lex',
    cursor: 0,
    tokens: Object.freeze([...initialTokens]),
    activeRule: 'program',
    currentCheckpointRef: 'cp-0',
    candidates: [],
    committedRepairs: [],
    createdNodes: [],
    diagnostics: [],
    stateHash: computeErdfStateHash(0, initialTokens.length, 0, 0, 0),
  };
}

export function reduceErdfEvent(
  state: ReplayState,
  event: ErdfEvent
): ReplayState {
  const sequence = event.sequence;
  const phase = event.phase;
  const currentCheckpointRef = event.checkpointRef;

  switch (event.type) {
    case 'TokenConsumed': {
      const payload = event.payload;
      return {
        ...state,
        sequence,
        phase,
        cursor: payload.cursor + 1,
        activeRule: payload.activeRule || state.activeRule,
        currentCheckpointRef,
        stateHash: event.stateHash,
      };
    }

    case 'NodeCreated': {
      const payload = event.payload;
      return {
        ...state,
        sequence,
        phase,
        currentCheckpointRef,
        createdNodes: [...state.createdNodes, payload],
        stateHash: event.stateHash,
      };
    }

    case 'SyntaxErrorDetected': {
      const payload = event.payload;
      const diag: Diagnostic = {
        id: `diag-syntax-${payload.actualToken.span.start}`,
        severity: 'error',
        message: `Expected [${payload.expectedKinds.join(', ')}] in ${payload.context}, found '${payload.actualToken.lexeme || payload.actualToken.kind}'.`,
        span: payload.actualToken.span,
        code: `PARSE_ERROR_${payload.expectedKinds[0] || 'UNEXPECTED'}`,
      };
      return {
        ...state,
        sequence,
        phase,
        activeRule: payload.grammarRule,
        currentCheckpointRef,
        diagnostics: [...state.diagnostics, diag],
        stateHash: event.stateHash,
      };
    }

    case 'CandidateGenerated': {
      const payload = event.payload;
      const newCandidate: RepairCandidate = {
        id: payload.candidateId,
        strategy: payload.strategy,
        edits: payload.edits,
        expected: payload.expected,
        cost: { lexical: 0, structural: 0, semanticRisk: 0, diagnostic: 0, total: 0 },
        validation: { window: 4, sourceTokensProgressed: 0, outcome: 'limit', failures: 0 },
        status: 'generated',
        reasons: [payload.reason],
      };
      return {
        ...state,
        sequence,
        phase,
        candidates: [...state.candidates, newCandidate],
        stateHash: event.stateHash,
      };
    }

    case 'CandidatePruned': {
      const payload = event.payload;
      const updated = state.candidates.map((c) =>
        c.id === payload.candidateId
          ? {
              ...c,
              status: 'pruned' as const,
              cost: payload.cost,
              reasons: [...c.reasons, payload.pruneReason],
            }
          : c
      );
      return {
        ...state,
        sequence,
        phase,
        candidates: updated,
        stateHash: event.stateHash,
      };
    }

    case 'CandidateValidated': {
      const payload = event.payload;
      const updated = state.candidates.map((c) =>
        c.id === payload.candidateId
          ? {
              ...c,
              validation: payload.validation,
              cost: payload.cost,
            }
          : c
      );
      return {
        ...state,
        sequence,
        phase,
        candidates: updated,
        stateHash: event.stateHash,
      };
    }

    case 'CandidateRejected': {
      const payload = event.payload;
      const updated = state.candidates.map((c) =>
        c.id === payload.candidateId
          ? {
              ...c,
              status: 'rejected' as const,
              cost: payload.cost,
              reasons: [...c.reasons, payload.rejectReason],
            }
          : c
      );
      return {
        ...state,
        sequence,
        phase,
        candidates: updated,
        stateHash: event.stateHash,
      };
    }

    case 'RepairSelected': {
      const payload = event.payload;
      return {
        ...state,
        sequence,
        phase,
        winningCandidateId: payload.winningCandidateId,
        stateHash: event.stateHash,
      };
    }

    case 'RepairCommitted': {
      const payload = event.payload;
      const winner = state.candidates.find((c) => c.id === payload.candidateId);
      const updatedCandidates = state.candidates.map((c) =>
        c.id === payload.candidateId ? { ...c, status: 'selected' as const } : c
      );

      // Reconstruct patched virtual token stream
      const patchedTokens = [...state.tokens];
      const sortedEdits = [...payload.editsApplied].sort((a, b) => b.position - a.position);
      for (const edit of sortedEdits) {
        const pos = Math.max(0, Math.min(edit.position, patchedTokens.length));
        switch (edit.action) {
          case 'insert':
            if (edit.token) {
              patchedTokens.splice(pos, 0, edit.token);
            }
            break;
          case 'delete':
            if (pos < patchedTokens.length) {
              patchedTokens.splice(pos, 1);
            }
            break;
          case 'substitute':
            if (edit.token && pos < patchedTokens.length) {
              patchedTokens.splice(pos, 1, edit.token);
            }
            break;
        }
      }

      const repairDiag: Diagnostic | undefined = winner
        ? {
            id: `diag-recovery-${payload.candidateId}`,
            severity: 'warning',
            message: `Recovered (${winner.strategy}): ${winner.reasons[0] || 'Committed self-healing repair'}.`,
            span: winner.edits[0]?.token?.span || state.tokens[state.cursor]?.span || { start: 0, end: 0, line: 1, column: 1 },
            code: `RECOVERY_${winner.strategy.toUpperCase()}`,
          }
        : undefined;

      return {
        ...state,
        sequence,
        phase,
        tokens: Object.freeze(patchedTokens),
        candidates: updatedCandidates,
        committedRepairs: winner
          ? [...state.committedRepairs, { ...winner, status: 'selected' as const }]
          : state.committedRepairs,
        diagnostics: repairDiag ? [...state.diagnostics, repairDiag] : state.diagnostics,
        stateHash: event.stateHash,
      };
    }

    case 'PanicDiscard': {
      const payload = event.payload;
      const diag: Diagnostic = {
        id: `diag-panic-${payload.partialNodeId}`,
        severity: 'error',
        message: `Panic mode discarded ${payload.discardedTokens.length} tokens to resync at '${payload.resyncToken.lexeme || payload.resyncToken.kind}'.`,
        span: payload.resyncToken.span,
        code: 'RECOVERY_PANIC_DISCARD',
      };
      return {
        ...state,
        sequence,
        phase,
        diagnostics: [...state.diagnostics, diag],
        stateHash: event.stateHash,
      };
    }

    case 'AstPatched': {
      return {
        ...state,
        sequence,
        phase,
        stateHash: event.stateHash,
      };
    }

    case 'RunCompleted': {
      return {
        ...state,
        sequence,
        phase: 'commit',
        stateHash: event.stateHash,
      };
    }

    default:
      return state;
  }
}
