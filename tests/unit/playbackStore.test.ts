import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotCache } from '../../src/state/snapshotCache';
import { tokenize } from '../../src/language/lexer';
import { parseWithErdf } from '../../src/erdf/instrumentedParser';
import { createInitialReplayState, reduceErdfEvent } from '../../src/erdf/reducer';
import { useReplayStore } from '../../src/state/replayStore';
import { CURATED_DEMOS } from '../../src/demos/curatedDemos';

describe('Playback Store & Snapshot Cache (Stage 8)', () => {
  beforeEach(() => {
    // Reset store state
    useReplayStore.getState().loadDemo('unclosed-parenthesis');
  });

  it('guarantees that state at sequence N via SnapshotCache matches full replay from sequence 0', () => {
    const source = 'let a = (10 + 20;\nlet b = 30;\nlet c = 40;';
    const { tokens } = tokenize(source);
    const { events, runSummary } = parseWithErdf(source);

    const cache = new SnapshotCache(events, tokens, runSummary.inputHash, 5);

    // Verify for every sequence from 0 to events.length
    for (let seq = 0; seq <= events.length; seq++) {
      // 1. Direct reduction from sequence 0
      let groundTruth = createInitialReplayState(events[0]?.runId || 'test', tokens);
      for (let i = 0; i < seq; i++) {
        groundTruth = reduceErdfEvent(groundTruth, events[i]);
      }

      // 2. Accelerated retrieval via SnapshotCache
      const cachedState = cache.getStateAt(seq);

      expect(cachedState.sequence).toBe(groundTruth.sequence);
      expect(cachedState.cursor).toBe(groundTruth.cursor);
      expect(cachedState.stateHash).toBe(groundTruth.stateHash);
      expect(cachedState.candidates.length).toBe(groundTruth.candidates.length);
    }
  });

  it('steps forward and backward through the event stream', () => {
    const store = useReplayStore.getState();
    const totalEvents = store.parseResult?.events.length || 0;
    expect(totalEvents).toBeGreaterThan(0);

    // Seek to sequence 2
    store.seekToSequence(2);
    expect(useReplayStore.getState().currentSequence).toBe(2);

    // Step forward
    useReplayStore.getState().stepForward();
    expect(useReplayStore.getState().currentSequence).toBe(3);

    // Step backward
    useReplayStore.getState().stepBackward();
    expect(useReplayStore.getState().currentSequence).toBe(2);
  });

  it('jumps to recovery phase and syntax error events', () => {
    const store = useReplayStore.getState();

    // Jump to recovery phase
    store.jumpToPhase('recovery');
    const seq = useReplayStore.getState().currentSequence;
    const currentEvent = useReplayStore.getState().parseResult?.events[seq - 1];
    expect(currentEvent?.phase).toBe('recovery');

    // Jump to next error
    store.jumpToNextError();
    const errorSeq = useReplayStore.getState().currentSequence;
    expect(errorSeq).toBeGreaterThan(0);
  });

  it('selects counterfactual repair candidate non-destructively', () => {
    const store = useReplayStore.getState();
    const events = store.parseResult?.events || [];
    const eventCount = events.length;

    store.selectCounterfactual('cand-mincost-99');
    expect(useReplayStore.getState().selectedCandidateId).toBe('cand-mincost-99');

    // Verify underlying committed parse events were not mutated
    expect(useReplayStore.getState().parseResult?.events.length).toBe(eventCount);

    store.selectCounterfactual(null);
    expect(useReplayStore.getState().selectedCandidateId).toBeNull();
  });

  it('loads curated demo programs cleanly', () => {
    const store = useReplayStore.getState();
    const demo = CURATED_DEMOS[1]; // missing-semicolon

    store.loadDemo(demo.id);

    expect(useReplayStore.getState().sourceCode).toBe(demo.source);
    expect(useReplayStore.getState().parseResult).not.toBeNull();
    expect(useReplayStore.getState().currentSequence).toBeGreaterThan(0);
  });

  it('deep merges nested config weights without destroying existing keys', () => {
    const store = useReplayStore.getState();
    const originalWeights = store.config.weights;

    // Partial update to only structural weight
    store.setConfig({
      weights: { structural: 9.9 } as any,
    });

    const updatedConfig = useReplayStore.getState().config;
    expect(updatedConfig.weights.structural).toBe(9.9);
    // semanticRisk and diagnostic must be preserved!
    expect(updatedConfig.weights.semanticRisk).toBe(originalWeights.semanticRisk);
    expect(updatedConfig.weights.diagnostic).toBe(originalWeights.diagnostic);
  });

  it('applies candidate solution into code editor and reparses', () => {
    const store = useReplayStore.getState();
    store.loadDemo('unclosed-parenthesis');

    const winner = useReplayStore.getState().currentState.committedRepairs[0];
    expect(winner).toBeDefined();

    store.applyCandidateSolution(winner);

    expect(useReplayStore.getState().sourceCode).toContain('int total = (10 + 20);');
    expect(useReplayStore.getState().selectedCandidateId).toBeNull();
  });

  it('applies all winning repairs and clears errors', () => {
    const store = useReplayStore.getState();
    const sourceWithTwoErrors = `int main() {\n  int a = (10 + 20;\n  return a\n}`;
    store.setSourceCode(sourceWithTwoErrors);

    expect(useReplayStore.getState().currentState.committedRepairs.length).toBeGreaterThanOrEqual(2);

    store.applyAllWinningRepairs();

    expect(useReplayStore.getState().sourceCode).toContain('int a = (10 + 20);');
    expect(useReplayStore.getState().sourceCode).toContain('return a;');
    expect(useReplayStore.getState().parseResult?.diagnostics).toHaveLength(0);
  });

  it('manages dual engines in split mode and prevents left-right collisions', () => {
    const store = useReplayStore.getState();

    // Set split mode
    store.setAstDiffMode('split');
    expect(useReplayStore.getState().astDiffMode).toBe('split');

    // Default left and right should not be identical
    expect(useReplayStore.getState().dualLeftEngine).not.toBe(
      useReplayStore.getState().dualRightEngine
    );

    // Set Clang vs Tree-sitter
    store.setDualEngines('clang', 'treesitter');
    expect(useReplayStore.getState().dualLeftEngine).toBe('clang');
    expect(useReplayStore.getState().dualRightEngine).toBe('treesitter');

    // Attempt to set both to Clang (collision)
    store.setDualEngines('clang', 'clang');
    expect(useReplayStore.getState().dualLeftEngine).toBe('clang');
    expect(useReplayStore.getState().dualRightEngine).toBe('treesitter');

    // Attempt to set both to Tree-sitter (collision)
    store.setDualEngines('treesitter', 'treesitter');
    expect(useReplayStore.getState().dualLeftEngine).toBe('treesitter');
    expect(useReplayStore.getState().dualRightEngine).toBe('clang');

    // Attempt to set both to ERDF (collision)
    store.setDualEngines('erdf', 'erdf');
    expect(useReplayStore.getState().dualLeftEngine).toBe('erdf');
    expect(useReplayStore.getState().dualRightEngine).toBe('clang');
  });
});

