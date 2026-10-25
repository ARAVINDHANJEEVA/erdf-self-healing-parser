import { describe, it, expect, beforeEach } from 'vitest';
import { parseWithBaselineRecovery } from '../../src/parser/recoveringParser';
import { tokenize } from '../../src/language/lexer';
import { parseClean } from '../../src/parser/parser';
import { groupCandidatesByIncident } from '../../src/ui/utils/incidentGrouping';
import { applyMultipleCandidatesToSource } from '../../src/ui/utils/sourcePatcher';
import { useReplayStore } from '../../src/state/replayStore';

describe('Multi-Error Self-Healing Recovery & Codebase Application', () => {
  beforeEach(() => {
    // Reset store before each test
    useReplayStore.getState().loadDemo('unclosed-parenthesis');
  });

  it('recovers 2 concurrent syntax errors in C program', () => {
    const source = `#include <stdio.h>

int main() {
  int total = (10 + 20;
  int tax = 5;
  int final_sum = total + tax;
  return final_sum
}`;

    const { tokens } = tokenize(source);
    const result = parseWithBaselineRecovery(tokens);

    // Both errors should be recovered
    expect(result.committedRepairs).toHaveLength(2);

    // Repair 1: inserts missing ')'
    expect(result.committedRepairs[0].edits.some((e) => e.token?.kind === 'RPAREN')).toBe(true);

    // Repair 2: inserts missing ';'
    expect(result.committedRepairs[1].edits.some((e) => e.token?.kind === 'SEMICOLON')).toBe(true);

    // All errors receive scored candidates
    expect(result.candidates.length).toBeGreaterThanOrEqual(4);

    // Grouping by incident
    const incidents = groupCandidatesByIncident(
      result.candidates,
      result.committedRepairs,
      result.diagnostics
    );

    expect(incidents).toHaveLength(2);
    expect(incidents[0].line).toBe(4);
    expect(incidents[0].winningCandidate).toBeDefined();
    expect(incidents[0].isResolved).toBe(true);

    expect(incidents[1].line).toBeGreaterThanOrEqual(7);
    expect(incidents[1].winningCandidate).toBeDefined();
    expect(incidents[1].isResolved).toBe(true);

    // Batch apply winning repairs
    const patched = applyMultipleCandidatesToSource(source, result.committedRepairs, tokens);
    expect(patched).toContain('int total = (10 + 20);');
    expect(patched).toContain('return final_sum;');

    // Verify patched code parses with 0 errors
    const reTokens = tokenize(patched).tokens;
    const cleanResult = parseClean(reTokens);
    expect(cleanResult.diagnostics).toHaveLength(0);
    expect(cleanResult.ast.body.length).toBeGreaterThanOrEqual(2);
  });

  it('recovers 3 concurrent syntax errors across multiple lines', () => {
    const source = `int compute() {
  int a = (10 + 20;
  int b = 50
  return a + b
}`;

    const { tokens } = tokenize(source);
    const result = parseWithBaselineRecovery(tokens);

    // Exactly 3 committed repairs: RPAREN, SEMICOLON, SEMICOLON
    expect(result.committedRepairs).toHaveLength(3);

    const incidents = groupCandidatesByIncident(
      result.candidates,
      result.committedRepairs,
      result.diagnostics
    );
    expect(incidents).toHaveLength(3);

    const patched = applyMultipleCandidatesToSource(source, result.committedRepairs, tokens);
    expect(patched).toContain('int a = (10 + 20);');
    expect(patched).toContain('int b = 50;');
    expect(patched).toContain('return a + b;');

    const reTokens = tokenize(patched).tokens;
    const cleanResult = parseClean(reTokens);
    expect(cleanResult.diagnostics).toHaveLength(0);
  });

  it('recovers 4 concurrent syntax errors across multiple statements', () => {
    const source = `int run() {
  int a = (10 + 20;
  int b = 50
  int c = 100
  return a + b + c
}`;

    const { tokens } = tokenize(source);
    const result = parseWithBaselineRecovery(tokens);

    expect(result.committedRepairs).toHaveLength(4);

    const incidents = groupCandidatesByIncident(
      result.candidates,
      result.committedRepairs,
      result.diagnostics
    );
    expect(incidents).toHaveLength(4);

    const patched = applyMultipleCandidatesToSource(source, result.committedRepairs, tokens);
    expect(patched).toContain('int a = (10 + 20);');
    expect(patched).toContain('int b = 50;');
    expect(patched).toContain('int c = 100;');
    expect(patched).toContain('return a + b + c;');

    const reTokens = tokenize(patched).tokens;
    const cleanResult = parseClean(reTokens);
    expect(cleanResult.diagnostics).toHaveLength(0);
  });

  it('applies individual candidate solution via replayStore action', () => {
    const source = `#include <stdio.h>\n\nint main() {\n  int total = (10 + 20;\n  return total;\n}`;
    const store = useReplayStore.getState();

    store.setSourceCode(source);
    expect(useReplayStore.getState().currentState.committedRepairs).toHaveLength(1);

    const candidateToApply = useReplayStore.getState().currentState.committedRepairs[0];
    expect(candidateToApply).toBeDefined();

    // Select for counterfactual preview first
    store.selectCounterfactual(candidateToApply.id);
    expect(useReplayStore.getState().selectedCandidateId).toBe(candidateToApply.id);

    // Apply the candidate solution
    store.applyCandidateSolution(candidateToApply);

    // Preview mode must be cleared
    expect(useReplayStore.getState().selectedCandidateId).toBeNull();

    // Source code must be patched and re-parsed cleanly
    const updatedSource = useReplayStore.getState().sourceCode;
    expect(updatedSource).toContain('int total = (10 + 20);');

    const activeDiags = useReplayStore.getState().parseResult?.diagnostics || [];
    expect(activeDiags).toHaveLength(0);
  });

  it('applies all winning repairs via applyAllWinningRepairs store action', () => {
    const source = `#include <stdio.h>\n\nint main() {\n  int total = (10 + 20;\n  return total\n}`;
    const store = useReplayStore.getState();

    store.setSourceCode(source);
    expect(useReplayStore.getState().currentState.committedRepairs.length).toBeGreaterThanOrEqual(2);

    store.applyAllWinningRepairs();

    const updatedSource = useReplayStore.getState().sourceCode;
    expect(updatedSource).toContain('int total = (10 + 20);');
    expect(updatedSource).toContain('return total;');

    // All errors fixed: diagnostics should be 0
    const activeDiags = useReplayStore.getState().parseResult?.diagnostics || [];
    expect(activeDiags).toHaveLength(0);
  });
});
