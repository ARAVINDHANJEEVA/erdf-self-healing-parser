/**
 * Foundational domain models and type contracts for MiniLang and ERDF.
 */

export type TokenOrigin = 'source' | 'synthetic';

export interface SourceSpan {
  readonly start: number;  // 0-based character index
  readonly end: number;    // exclusive end character index
  readonly line: number;   // 1-based line number
  readonly column: number; // 1-based column number
}

import { TokenKind } from './tokenKinds';
export type { TokenKind };

export interface Token {
  readonly id: string;
  readonly kind: TokenKind;
  readonly lexeme: string;
  readonly span: SourceSpan;
  readonly origin: TokenOrigin;
  readonly syntheticReason?: string;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly id: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly span: SourceSpan;
  readonly code: string;
}

export type AstProvenance = 'source' | 'recovered' | 'partial';

export interface BaseAstNode {
  readonly id: string;
  readonly kind: string;
  readonly span: SourceSpan;
  readonly provenance: AstProvenance;
  readonly repairIds: readonly string[];
}

export interface CallFrame {
  readonly rule: string;
  readonly phase: string;
}

export interface ParserCheckpoint {
  readonly cursor: number;
  readonly statementStartCursor: number;
  readonly callFrames: readonly CallFrame[];
  readonly delimiterStack: readonly TokenKind[];
  readonly diagnosticCount: number;
  readonly stateHash: string;
}

export type EditAction = 'insert' | 'delete' | 'substitute';

export interface Edit {
  readonly action: EditAction;
  readonly position: number; // index in token stream
  readonly token?: Token;    // token inserted or substituted
  readonly deletedToken?: Token;
}

export type RecoveryStrategyKind = 'phrase' | 'minimum-cost' | 'panic';

export type CandidateStatus = 'generated' | 'pruned' | 'rejected' | 'selected';

export interface CostBreakdown {
  readonly lexical: number;
  readonly structural: number;
  readonly semanticRisk: number;
  readonly diagnostic: number;
  readonly total: number;
}

export interface ValidationResult {
  readonly window: number;
  readonly sourceTokensProgressed: number;
  readonly outcome: 'pass' | 'fail' | 'limit';
  readonly failures: number;
}

export interface RepairCandidate {
  readonly id: string;
  readonly strategy: RecoveryStrategyKind;
  readonly edits: readonly Edit[];
  readonly expected: readonly TokenKind[];
  readonly cost: CostBreakdown;
  readonly validation: ValidationResult;
  readonly status: CandidateStatus;
  readonly reasons: readonly string[];
  readonly branchAstRef?: string;
}
