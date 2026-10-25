import { describe, it, expect } from 'vitest';
import { groupCandidatesByIncident } from '../../src/ui/utils/incidentGrouping';
import { Diagnostic, RepairCandidate } from '../../src/language/types';

describe('Error Incident Grouping (incidentGrouping)', () => {
  it('groups flat candidates into structured error incidents by checkpoint position', () => {
    // Candidates for Error 1 (at line 4, col 23)
    const cand1: RepairCandidate = {
      id: 'cand-1',
      strategy: 'minimum-cost',
      edits: [
        {
          action: 'insert',
          position: 9,
          token: {
            id: 'tok-rparen',
            kind: 'RPAREN',
            lexeme: ')',
            span: { start: 40, end: 41, line: 4, column: 23 },
            origin: 'synthetic',
          },
        },
      ],
      expected: ['RPAREN'],
      cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1 },
      validation: { window: 4, sourceTokensProgressed: 3, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ["Insert ')' before ';'"],
    };

    const cand2: RepairCandidate = {
      id: 'cand-2',
      strategy: 'minimum-cost',
      edits: [
        {
          action: 'delete',
          position: 9,
          deletedToken: {
            id: 'tok-semi',
            kind: 'SEMICOLON',
            lexeme: ';',
            span: { start: 40, end: 41, line: 4, column: 23 },
            origin: 'source',
          },
        },
      ],
      expected: ['RPAREN'],
      cost: { lexical: 3, structural: 1, semanticRisk: 2, diagnostic: 0, total: 6 },
      validation: { window: 4, sourceTokensProgressed: 0, outcome: 'fail', failures: 1 },
      status: 'rejected',
      reasons: ["Delete ';'"],
    };

    // Candidates for Error 2 (at line 7, col 19)
    const cand3: RepairCandidate = {
      id: 'cand-3',
      strategy: 'minimum-cost',
      edits: [
        {
          action: 'insert',
          position: 18,
          token: {
            id: 'tok-semi-2',
            kind: 'SEMICOLON',
            lexeme: ';',
            span: { start: 95, end: 96, line: 7, column: 19 },
            origin: 'synthetic',
          },
        },
      ],
      expected: ['SEMICOLON'],
      cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1 },
      validation: { window: 4, sourceTokensProgressed: 2, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ["Insert ';' before '}'"],
    };

    const diagnostics: Diagnostic[] = [
      {
        id: 'diag-1',
        severity: 'error',
        message: "Expected ')' in expression, found ';'",
        span: { start: 40, end: 41, line: 4, column: 23 },
        code: 'PARSE_EXPECTED_RPAREN',
      },
      {
        id: 'diag-2',
        severity: 'error',
        message: "Expected ';' in return statement, found '}'",
        span: { start: 95, end: 96, line: 7, column: 19 },
        code: 'PARSE_EXPECTED_SEMICOLON',
      },
    ];

    const incidents = groupCandidatesByIncident(
      [cand1, cand2, cand3],
      [cand1, cand3],
      diagnostics
    );

    expect(incidents).toHaveLength(2);

    // Incident 1
    const inc1 = incidents[0];
    expect(inc1.id).toBe('incident-1');
    expect(inc1.index).toBe(1);
    expect(inc1.line).toBe(4);
    expect(inc1.column).toBe(23);
    expect(inc1.candidates).toHaveLength(2);
    expect(inc1.winningCandidate?.id).toBe('cand-1');
    expect(inc1.isResolved).toBe(true);
    expect(inc1.description).toContain("Expected ')'");

    // Incident 2
    const inc2 = incidents[1];
    expect(inc2.id).toBe('incident-2');
    expect(inc2.index).toBe(2);
    expect(inc2.line).toBe(7);
    expect(inc2.column).toBe(19);
    expect(inc2.candidates).toHaveLength(1);
    expect(inc2.winningCandidate?.id).toBe('cand-3');
    expect(inc2.isResolved).toBe(true);
    expect(inc2.description).toContain("Expected ';'");
  });

  it('incorporates unrecovered panic mode error diagnostics into incidents', () => {
    const diagnostics: Diagnostic[] = [
      {
        id: 'diag-panic',
        severity: 'error',
        message: 'Panic discard: unexpected token cluster',
        span: { start: 10, end: 20, line: 2, column: 5 },
        code: 'RECOVERY_PANIC_DISCARD',
      },
    ];

    const incidents = groupCandidatesByIncident([], [], diagnostics);

    expect(incidents).toHaveLength(1);
    expect(incidents[0].line).toBe(2);
    expect(incidents[0].candidates).toHaveLength(0);
    expect(incidents[0].winningCandidate).toBeNull();
    expect(incidents[0].isResolved).toBe(false);
    expect(incidents[0].description).toBe('Panic discard: unexpected token cluster');
  });

  it('handles empty candidates and diagnostics without errors', () => {
    const incidents = groupCandidatesByIncident([], [], []);
    expect(incidents).toEqual([]);
  });

  it('groups committed repairs even if candidates array is empty', () => {
    const rep: RepairCandidate = {
      id: 'rep-1',
      strategy: 'minimum-cost',
      edits: [
        {
          action: 'insert',
          position: 5,
          token: {
            id: 'tok-semi',
            kind: 'SEMICOLON',
            lexeme: ';',
            span: { start: 25, end: 26, line: 2, column: 15 },
            origin: 'synthetic',
          },
        },
      ],
      expected: ['SEMICOLON'],
      cost: { lexical: 1, structural: 0, semanticRisk: 0, diagnostic: 0, total: 1 },
      validation: { window: 4, sourceTokensProgressed: 2, outcome: 'pass', failures: 0 },
      status: 'selected',
      reasons: ["Insert missing ';'"],
    };

    const incidents = groupCandidatesByIncident([], [rep], []);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].winningCandidate?.id).toBe('rep-1');
    expect(incidents[0].isResolved).toBe(true);
    expect(incidents[0].line).toBe(2);
  });
});
