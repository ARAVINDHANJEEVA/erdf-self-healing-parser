import { ErdfEvent } from '../../erdf/schema';
import { formatEdit } from './candidateFormatter';

/**
 * Converts raw ERDF event telemetry payloads into clear, human-readable summaries
 * suitable for educational timeline inspection.
 */
export function formatTraceSummary(ev: ErdfEvent): string {
  if (!ev) return '';

  const payload: any = ev.payload || {};

  switch (ev.type) {
    case 'TokenConsumed': {
      const tok = payload.token;
      if (!tok) return 'Consumed token';
      const loc = tok.span ? `[L${tok.span.line}:${tok.span.column}]` : '';
      return `Consumed "${tok.lexeme}" (${tok.kind}) ${loc}`.trim();
    }

    case 'SyntaxErrorDetected': {
      const actual = payload.actualToken;
      const actStr = actual?.lexeme ? `"${actual.lexeme}"` : actual?.kind || 'token';
      const expected = payload.expectedKinds?.length
        ? payload.expectedKinds.join(', ')
        : 'valid syntax';
      return `Syntax Error: Unexpected ${actStr} • Expected: ${expected}`;
    }

    case 'CandidateGenerated': {
      const editsStr = payload.edits?.map(formatEdit).join(' + ');
      return `Evaluated Candidate: ${editsStr || payload.reason || payload.strategy || 'repair'}`;
    }

    case 'CandidatePruned': {
      return `Pruned Candidate (${payload.candidateId}): ${
        payload.pruneReason || 'exceeded cost budget'
      }`;
    }

    case 'CandidateValidated': {
      const outcome = payload.validation?.outcome?.toUpperCase() || 'PASS';
      const tokCount = payload.validation?.sourceTokensProgressed ?? 0;
      const cost =
        payload.cost?.total !== undefined ? payload.cost.total.toFixed(2) : '0';
      return `Lookahead ${outcome}: progressed ${tokCount} tok (Cost: ${cost})`;
    }

    case 'CandidateRejected': {
      return `Rejected Candidate (${payload.candidateId}): ${
        payload.rejectReason || 'lookahead failed'
      }`;
    }

    case 'RepairSelected': {
      const strat = payload.strategy || 'heuristic';
      const conf = payload.confidence?.confidence || 'high';
      return `Selected Winning Repair (${strat}) • Confidence: ${conf}`;
    }

    case 'RepairCommitted': {
      const editsStr = payload.editsApplied?.map(formatEdit).join(' + ');
      return `Committed Self-Healing Fix: ${editsStr || payload.candidateId}`;
    }

    case 'PanicDiscard': {
      const discarded =
        payload.discardedTokens?.map((t: any) => t.lexeme).join(' ') || 'tokens';
      const resync = payload.resyncToken?.lexeme
        ? `"${payload.resyncToken.lexeme}"`
        : 'statement boundary';
      return `Panic Discard: Skipped "${discarded}" → Resynced at ${resync}`;
    }

    case 'NodeCreated': {
      const kind = payload.kind || payload.node?.kind || 'Node';
      const prov = payload.provenance || 'source';
      return `Created AST Node: ${kind} (${prov})`;
    }

    case 'AstPatched': {
      return `Patched AST: ${payload.message || 'nodes reconstructed'}`;
    }

    case 'RunCompleted': {
      return `Completed Parse Trace • Diagnostics: ${payload.diagnosticCount ?? 0}`;
    }

    default: {
      const anyEv = ev as any;
      if (typeof payload === 'object' && payload !== null) {
        if (payload.message) return payload.message;
        if (payload.token?.lexeme) return `Token: "${payload.token.lexeme}"`;
      }
      return anyEv?.type || 'Event';
    }
  }
}
