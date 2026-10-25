/**
 * Multi-Incident Grouping Utility.
 * Groups flat repair candidates and committed repairs into structured Error Incidents
 * for clean organization, tab filtering, and multi-error resolution in the visual workbench.
 */

import { Diagnostic, RepairCandidate } from '../../language/types';

export interface ErrorIncident {
  readonly id: string;
  readonly index: number;
  readonly line: number;
  readonly column: number;
  readonly description: string;
  readonly candidates: readonly RepairCandidate[];
  readonly winningCandidate: RepairCandidate | null;
  readonly isResolved: boolean;
}

interface IncidentBucket {
  readonly key: string;
  readonly position: number;
  readonly start: number;
  readonly line: number;
  readonly column: number;
  readonly candidates: RepairCandidate[];
}

/**
 * Extracts line, column, and position coordinates from a repair candidate.
 */
function getCandidateLocation(cand: RepairCandidate): {
  position: number;
  start: number;
  line: number;
  column: number;
} {
  const firstEdit = cand.edits[0];
  const span = firstEdit?.token?.span || firstEdit?.deletedToken?.span;
  return {
    position: firstEdit?.position ?? 0,
    start: span?.start ?? 0,
    line: span?.line ?? 1,
    column: span?.column ?? 1,
  };
}

/**
 * Groups flat repair candidates and committed repairs into structured Error Incidents.
 */
export function groupCandidatesByIncident(
  candidates: readonly RepairCandidate[] = [],
  committedRepairs: readonly RepairCandidate[] = [],
  diagnostics: readonly Diagnostic[] = []
): ErrorIncident[] {
  const bucketMap = new Map<string, IncidentBucket>();

  const getBucketKey = (loc: { position: number; start: number }): string => {
    return loc.start > 0 ? `start_${loc.start}` : `pos_${loc.position}`;
  };

  // 1. Group candidates by their error checkpoint location
  for (const cand of candidates) {
    const loc = getCandidateLocation(cand);
    const key = getBucketKey(loc);

    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        key,
        position: loc.position,
        start: loc.start,
        line: loc.line,
        column: loc.column,
        candidates: [],
      };
      bucketMap.set(key, bucket);
    }
    bucket.candidates.push(cand);
  }

  // Set of committed repair IDs for fast lookup
  const committedIds = new Set(committedRepairs.map((r) => r.id));

  // Also ensure every committed repair is included in a bucket
  for (const rep of committedRepairs) {
    const loc = getCandidateLocation(rep);
    const key = getBucketKey(loc);

    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        key,
        position: loc.position,
        start: loc.start,
        line: loc.line,
        column: loc.column,
        candidates: [rep],
      };
      bucketMap.set(key, bucket);
    } else if (!bucket.candidates.some((c) => c.id === rep.id)) {
      bucket.candidates.push(rep);
    }
  }

  // 2. Build incident structures from candidate buckets
  const rawIncidents: Array<{
    line: number;
    column: number;
    candidates: RepairCandidate[];
    winningCandidate: RepairCandidate | null;
    description: string;
    isResolved: boolean;
  }> = [];

  for (const bucket of bucketMap.values()) {
    // Determine the winning candidate for this incident
    // Check if any candidate was committed or marked selected
    let winner: RepairCandidate | null =
      bucket.candidates.find(
        (c) => committedIds.has(c.id) || c.status === 'selected'
      ) || null;

    // Fallback: if not yet committed, look for a passing viable winner
    if (!winner) {
      winner =
        bucket.candidates.find(
          (c) => c.validation.outcome === 'pass' && c.status !== 'pruned' && c.status !== 'rejected'
        ) || null;
    }

    // Associate with diagnostic description if available
    const matchingDiag =
      diagnostics.find(
        (d) =>
          d.severity === 'error' &&
          (Math.abs(d.span.line - bucket.line) <= 1 ||
            (d.span.start <= bucket.start && bucket.start <= d.span.end + 5))
      ) ||
      diagnostics.find(
        (d) =>
          Math.abs(d.span.line - bucket.line) <= 1 ||
          (d.span.start <= bucket.start && bucket.start <= d.span.end + 5)
      );

    let description = '';
    if (matchingDiag) {
      description = matchingDiag.message;
    } else if (winner && winner.reasons.length > 0) {
      description = winner.reasons[0];
    } else if (bucket.candidates[0]?.reasons.length > 0) {
      description = bucket.candidates[0].reasons[0];
    } else {
      description = `Syntax error at line ${bucket.line}, col ${bucket.column}`;
    }

    const isResolved =
      winner !== null &&
      (winner.status === 'selected' || committedIds.has(winner.id));

    rawIncidents.push({
      line: bucket.line,
      column: bucket.column,
      candidates: bucket.candidates,
      winningCandidate: winner,
      description,
      isResolved,
    });
  }

  // 3. Also incorporate any unrecovered syntax error diagnostics (e.g. panic mode discards)
  const coveredLines = new Set(rawIncidents.map((inc) => inc.line));
  for (const diag of diagnostics) {
    if (diag.severity === 'error' && !coveredLines.has(diag.span.line)) {
      rawIncidents.push({
        line: diag.span.line,
        column: diag.span.column,
        candidates: [],
        winningCandidate: null,
        description: diag.message,
        isResolved: false,
      });
      coveredLines.add(diag.span.line);
    }
  }

  // 4. Sort incidents chronologically by line and column
  rawIncidents.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  // 5. Assign 1-based sequential indices and IDs
  return rawIncidents.map((inc, idx) => ({
    id: `incident-${idx + 1}`,
    index: idx + 1,
    line: inc.line,
    column: inc.column,
    description: inc.description,
    candidates: inc.candidates,
    winningCandidate: inc.winningCandidate,
    isResolved: inc.isResolved,
  }));
}
