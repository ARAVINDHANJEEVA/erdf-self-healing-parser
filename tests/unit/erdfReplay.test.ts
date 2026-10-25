import { describe, it, expect } from 'vitest';
import { parseWithErdf } from '../../src/erdf/instrumentedParser';
import { verifyTrace } from '../../src/erdf/verifier';
import { tokenize } from '../../src/language/lexer';
import { createInitialReplayState, reduceErdfEvent } from '../../src/erdf/reducer';
import { ErdfEvent } from '../../src/erdf/schema';

describe('ERDF Telemetry & Deterministic Replay (Stage 7)', () => {
  it('generates schema-compliant, monotonically sequenced erdf-1 traces', () => {
    const source = 'let x = (10 + 20;\nlet y = 30;';
    const result = parseWithErdf(source);

    expect(result.events.length).toBeGreaterThan(0);

    let expectedSeq = 1;
    for (const event of result.events) {
      expect(event.schemaVersion).toBe('erdf-1');
      expect(event.sequence).toBe(expectedSeq++);
      expect(event.stateHash).toBeDefined();
      expect(event.runId).toMatch(/^run-[0-9a-f]{8}$/);
    }

    const lastEvent = result.events[result.events.length - 1];
    expect(lastEvent.type).toBe('RunCompleted');
  });

  it('proves 100% bit-exact determinism across 50 consecutive runs', () => {
    const source = `
      let total = (10 + 20;
      let tax = 5;
      if (tax > 2) {
        let status = "ok";
      }
    `;

    // First baseline run
    const baseline = parseWithErdf(source);
    const baselineHashes = baseline.events.map((e) => `${e.type}:${e.stateHash}`);
    const baselineAstHash = baseline.runSummary.finalAstHash;

    // Run 50 repeated trials and verify complete hash agreement
    for (let trial = 0; trial < 50; trial++) {
      const run = parseWithErdf(source);
      const runHashes = run.events.map((e) => `${e.type}:${e.stateHash}`);

      expect(runHashes).toEqual(baselineHashes);
      expect(run.runSummary.finalAstHash).toBe(baselineAstHash);
      expect(run.runSummary.inputHash).toBe(baseline.runSummary.inputHash);
      expect(run.runSummary.grammarHash).toBe(baseline.runSummary.grammarHash);
    }
  });

  it('trace verifier verifies valid runs and catches tampered traces', () => {
    const source = 'let a = 100;\nlet b = 200;';
    const { tokens } = tokenize(source);
    const result = parseWithErdf(source);

    // Valid trace verification
    const verification = verifyTrace(result.events, tokens, result.runSummary);
    expect(verification.isValid).toBe(true);
    expect(verification.errors).toHaveLength(0);
    expect(verification.replayedEventCount).toBe(result.events.length);

    // Corrupted trace test (tampered sequence order)
    const tampered = [...result.events];
    const corruptedEvent: ErdfEvent = {
      ...tampered[1],
      sequence: 999, // Out of order!
    };
    tampered[1] = corruptedEvent;

    const invalidVerification = verifyTrace(tampered, tokens, result.runSummary);
    expect(invalidVerification.isValid).toBe(false);
    expect(invalidVerification.errors.some((e) => e.includes('Sequence mismatch'))).toBe(true);
  });

  it('reconstructs frame-by-frame state deterministically using replay reducer', () => {
    const source = 'let x = 10;';
    const { tokens } = tokenize(source);
    const { events } = parseWithErdf(source);

    let state = createInitialReplayState(events[0].runId, tokens);
    expect(state.cursor).toBe(0);

    for (const event of events) {
      state = reduceErdfEvent(state, event);
    }

    // After full reduction, final sequence matches total events
    expect(state.sequence).toBe(events.length);
  });

  it('emits ERDF events in true chronological order with contextual activeRule', () => {
    // Error occurs in first statement: missing RPAREN in (10 + 20;
    // Second statement 'let y = 30;' follows
    const source = 'let x = (10 + 20;\nlet y = 30;';
    const { events } = parseWithErdf(source);

    // 1. Check contextual activeRule (e.g. 'expression' for numeric tokens, 'letDecl' for let)
    const tokenEvents = events.filter((e) => e.type === 'TokenConsumed');
    const rules = tokenEvents.map((e) => (e.payload as any).activeRule);
    expect(rules).toContain('expression');
    expect(rules).toContain('letDecl');

    // 2. Chronological order check:
    // SyntaxErrorDetected must occur BEFORE the second statement's 'let' token is consumed!
    const errorIndex = events.findIndex((e) => e.type === 'SyntaxErrorDetected');
    expect(errorIndex).toBeGreaterThan(0);

    const secondLetIndex = events.findIndex(
      (e) => e.type === 'TokenConsumed' && (e.payload as any).token?.lexeme === 'y'
    );
    expect(secondLetIndex).toBeGreaterThan(errorIndex);
  });
});
