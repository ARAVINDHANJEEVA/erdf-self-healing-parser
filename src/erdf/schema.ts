/**
 * ERDF (Explainable Recovery Decision Framework) Event Schema (erdf-1).
 * Formal append-only, JSON-serializable event contracts for deterministic replay.
 */

import {
  CostBreakdown,
  Edit,
  SourceSpan,
  Token,
  TokenKind,
  ValidationResult,
} from '../language/types';
import { ConfidenceAssessment } from '../recovery/confidence';

export const ERDF_SCHEMA_VERSION = 'erdf-1';

export type ErdfPhase = 'lex' | 'parse' | 'recovery' | 'commit';

export interface BaseErdfEvent<TType extends string, TPayload> {
  readonly eventId: number;
  readonly runId: string;
  readonly schemaVersion: 'erdf-1';
  readonly sequence: number;
  readonly phase: ErdfPhase;
  readonly type: TType;
  readonly checkpointRef: string;
  readonly payload: TPayload;
  readonly stateHash: string;
}

// Concrete Payloads

export interface TokenConsumedPayload {
  readonly token: Token;
  readonly cursor: number;
  readonly activeRule?: string;
}

export interface NodeCreatedPayload {
  readonly nodeId: string;
  readonly kind: string;
  readonly span: SourceSpan;
  readonly provenance: 'source' | 'recovered' | 'partial';
  readonly repairIds: readonly string[];
}

export interface SyntaxErrorDetectedPayload {
  readonly actualToken: Token;
  readonly expectedKinds: readonly TokenKind[];
  readonly grammarRule: string;
  readonly context: string;
  readonly checkpointCursor: number;
  readonly delimiterStack: readonly TokenKind[];
}

export interface CandidateGeneratedPayload {
  readonly candidateId: string;
  readonly strategy: 'phrase' | 'minimum-cost' | 'panic';
  readonly edits: readonly Edit[];
  readonly expected: readonly TokenKind[];
  readonly reason: string;
}

export interface CandidatePrunedPayload {
  readonly candidateId: string;
  readonly pruneReason: string;
  readonly cost: CostBreakdown;
}

export interface CandidateValidatedPayload {
  readonly candidateId: string;
  readonly validation: ValidationResult;
  readonly cost: CostBreakdown;
}

export interface CandidateRejectedPayload {
  readonly candidateId: string;
  readonly rejectReason: string;
  readonly cost: CostBreakdown;
}

export interface RepairSelectedPayload {
  readonly winningCandidateId: string;
  readonly strategy: string;
  readonly cost: CostBreakdown;
  readonly confidence: ConfidenceAssessment;
  readonly alternativeCount: number;
}

export interface RepairCommittedPayload {
  readonly candidateId: string;
  readonly editsApplied: readonly Edit[];
  readonly resultingStreamLength: number;
}

export interface PanicDiscardPayload {
  readonly discardedTokens: readonly Token[];
  readonly syncSet: readonly TokenKind[];
  readonly resyncToken: Token;
  readonly partialNodeId: string;
}

export interface AstPatchedPayload {
  readonly affectedNodeIds: readonly string[];
  readonly diagnosticId: string;
  readonly message: string;
}

export interface RunCompletedPayload {
  readonly inputHash: string;
  readonly grammarHash: string;
  readonly configHash: string;
  readonly finalAstHash: string;
  readonly diagnosticCount: number;
  readonly totalEvents: number;
  readonly executionTimeMs: number;
}

// Union of all ERDF events

export type TokenConsumedEvent = BaseErdfEvent<'TokenConsumed', TokenConsumedPayload>;
export type NodeCreatedEvent = BaseErdfEvent<'NodeCreated', NodeCreatedPayload>;
export type SyntaxErrorDetectedEvent = BaseErdfEvent<'SyntaxErrorDetected', SyntaxErrorDetectedPayload>;
export type CandidateGeneratedEvent = BaseErdfEvent<'CandidateGenerated', CandidateGeneratedPayload>;
export type CandidatePrunedEvent = BaseErdfEvent<'CandidatePruned', CandidatePrunedPayload>;
export type CandidateValidatedEvent = BaseErdfEvent<'CandidateValidated', CandidateValidatedPayload>;
export type CandidateRejectedEvent = BaseErdfEvent<'CandidateRejected', CandidateRejectedPayload>;
export type RepairSelectedEvent = BaseErdfEvent<'RepairSelected', RepairSelectedPayload>;
export type RepairCommittedEvent = BaseErdfEvent<'RepairCommitted', RepairCommittedPayload>;
export type PanicDiscardEvent = BaseErdfEvent<'PanicDiscard', PanicDiscardPayload>;
export type AstPatchedEvent = BaseErdfEvent<'AstPatched', AstPatchedPayload>;
export type RunCompletedEvent = BaseErdfEvent<'RunCompleted', RunCompletedPayload>;

export type ErdfEvent =
  | TokenConsumedEvent
  | NodeCreatedEvent
  | SyntaxErrorDetectedEvent
  | CandidateGeneratedEvent
  | CandidatePrunedEvent
  | CandidateValidatedEvent
  | CandidateRejectedEvent
  | RepairSelectedEvent
  | RepairCommittedEvent
  | PanicDiscardEvent
  | AstPatchedEvent
  | RunCompletedEvent;
