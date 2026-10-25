/**
 * Offline and CI trace verifier.
 * Replays an append-only ERDF event stream to verify determinism,
 * sequence monotonicity, schema compliance, and hash agreement.
 */

import { Token } from '../language/types';
import { ERDF_SCHEMA_VERSION, ErdfEvent, RunCompletedPayload } from './schema';
import { createInitialReplayState, reduceErdfEvent } from './reducer';

export interface VerificationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly replayedEventCount: number;
  readonly finalStateHash: string;
}

export function verifyTrace(
  events: readonly ErdfEvent[],
  initialTokens: readonly Token[],
  expectedSummary?: RunCompletedPayload
): VerificationResult {
  const errors: string[] = [];

  if (events.length === 0) {
    return {
      isValid: false,
      errors: ['Empty event trace.'],
      replayedEventCount: 0,
      finalStateHash: '',
    };
  }

  // 1. Sequence monotonicity and schema check
  let expectedSeq = 1;
  const runId = events[0].runId;

  for (const event of events) {
    if (event.schemaVersion !== ERDF_SCHEMA_VERSION) {
      errors.push(
        `Event #${event.sequence} has invalid schemaVersion '${event.schemaVersion}'. Expected '${ERDF_SCHEMA_VERSION}'.`
      );
    }

    if (event.sequence !== expectedSeq) {
      errors.push(
        `Sequence mismatch at event #${event.eventId}: got sequence ${event.sequence}, expected ${expectedSeq}.`
      );
    }
    expectedSeq++;

    if (event.runId !== runId) {
      errors.push(
        `runId mismatch at event #${event.sequence}: '${event.runId}' vs expected '${runId}'.`
      );
    }
  }

  // 2. Replay state reduction
  let state = createInitialReplayState(runId, initialTokens);
  for (const event of events) {
    try {
      state = reduceErdfEvent(state, event);
    } catch (err) {
      errors.push(`Reducer threw exception at event #${event.sequence}: ${String(err)}`);
    }
  }

  // 3. Compare with RunCompleted summary
  const lastEvent = events[events.length - 1];
  if (lastEvent.type !== 'RunCompleted') {
    errors.push(`Last event must be 'RunCompleted', found '${lastEvent.type}'.`);
  } else if (expectedSummary) {
    const summary = lastEvent.payload as RunCompletedPayload;
    if (summary.finalAstHash !== expectedSummary.finalAstHash) {
      errors.push(
        `AST hash mismatch: trace summary '${summary.finalAstHash}' vs expected '${expectedSummary.finalAstHash}'.`
      );
    }
    if (summary.totalEvents !== events.length) {
      errors.push(
        `Total events mismatch: summary reported ${summary.totalEvents}, trace length is ${events.length}.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    replayedEventCount: events.length,
    finalStateHash: state.stateHash,
  };
}
