/**
 * Immutable parser checkpoints and state snapshotting for speculative recovery.
 */

import { CallFrame, ParserCheckpoint, TokenKind } from '../language/types';
import { fnv1a } from '../utils/hash';

export function computeCheckpointHash(
  cursor: number,
  statementStartCursor: number,
  callFrames: readonly CallFrame[],
  delimiterStack: readonly TokenKind[],
  diagnosticCount: number
): string {
  const frameStr = callFrames.map((f) => `${f.rule}:${f.phase}`).join('>');
  const delimStr = delimiterStack.join(',');
  const signature = `${cursor}|${statementStartCursor}|${frameStr}|${delimStr}|${diagnosticCount}`;
  return fnv1a(signature);
}

export function createCheckpoint(
  cursor: number,
  statementStartCursor: number,
  callFrames: readonly CallFrame[],
  delimiterStack: readonly TokenKind[],
  diagnosticCount: number
): ParserCheckpoint {
  const stateHash = computeCheckpointHash(
    cursor,
    statementStartCursor,
    callFrames,
    delimiterStack,
    diagnosticCount
  );

  return {
    cursor,
    statementStartCursor,
    callFrames: Object.freeze([...callFrames]),
    delimiterStack: Object.freeze([...delimiterStack]),
    diagnosticCount,
    stateHash,
  };
}

export function areCheckpointsEqual(
  a: ParserCheckpoint,
  b: ParserCheckpoint
): boolean {
  return a.stateHash === b.stateHash;
}
