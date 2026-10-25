/**
 * Snapshot Cache for Accelerated Time-Travel Scrubbing.
 * Caches intermediate ReplayStates every K events so seeking to any sequence N
 * requires at most K event reductions instead of replaying from sequence 0.
 */

import { Token } from '../language/types';
import { ErdfEvent } from '../erdf/schema';
import {
  ReplayState,
  createInitialReplayState,
  reduceErdfEvent,
} from '../erdf/reducer';

export class SnapshotCache {
  private readonly events: readonly ErdfEvent[];
  private readonly interval: number;
  private readonly snapshots: Map<number, ReplayState> = new Map();

  constructor(
    events: readonly ErdfEvent[],
    initialTokens: readonly Token[],
    runId: string,
    interval: number = 20
  ) {
    this.events = events;
    this.interval = Math.max(1, interval);

    // Seed index 0 with initial state
    const initialState = createInitialReplayState(runId, initialTokens);
    this.snapshots.set(0, initialState);
  }

  /**
   * Retrieves the reconstructed ReplayState at the given event sequence.
   * Leverages the closest prior snapshot and reduces only the delta.
   */
  public getStateAt(targetSequence: number): ReplayState {
    const clampedSeq = Math.max(
      0,
      Math.min(targetSequence, this.events.length)
    );

    if (clampedSeq === 0) {
      return this.snapshots.get(0)!;
    }

    // Find the nearest cached snapshot index <= clampedSeq
    const nearestBlockIndex = Math.floor(clampedSeq / this.interval) * this.interval;

    let baseState = this.getOrComputeSnapshot(nearestBlockIndex);

    // Reduce remaining delta events from nearestBlockIndex up to clampedSeq
    for (let seq = nearestBlockIndex + 1; seq <= clampedSeq; seq++) {
      const event = this.events[seq - 1]; // events are 1-indexed
      if (event) {
        baseState = reduceErdfEvent(baseState, event);
      }
    }

    return baseState;
  }

  private getOrComputeSnapshot(sequence: number): ReplayState {
    if (this.snapshots.has(sequence)) {
      return this.snapshots.get(sequence)!;
    }

    // Find the highest existing snapshot below sequence
    let highestKnown = 0;
    for (const key of this.snapshots.keys()) {
      if (key <= sequence && key > highestKnown) {
        highestKnown = key;
      }
    }

    let state = this.snapshots.get(highestKnown)!;

    // Step forward in chunks of this.interval, caching along the way
    for (let seq = highestKnown + 1; seq <= sequence; seq++) {
      const event = this.events[seq - 1];
      if (event) {
        state = reduceErdfEvent(state, event);
        if (seq % this.interval === 0) {
          this.snapshots.set(seq, state);
        }
      }
    }

    return state;
  }

  public getCachedSnapshotCount(): number {
    return this.snapshots.size;
  }
}
