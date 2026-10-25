import { Edit, RepairCandidate } from '../../language/types';

/**
 * Formats a single repair edit (insert, delete, substitute) with clear descriptions
 * of what token is being inserted, deleted, or substituted.
 */
export function formatEdit(edit: Edit): string {
  if (edit.action === 'delete') {
    const tok = edit.deletedToken || edit.token;
    const desc = tok?.lexeme ? `"${tok.lexeme}"` : tok?.kind || 'token';
    return `DELETE ${desc}`;
  }

  if (edit.action === 'substitute') {
    const fromTok = edit.deletedToken;
    const toTok = edit.token;
    const fromDesc = fromTok?.lexeme ? `"${fromTok.lexeme}"` : fromTok?.kind || 'token';
    const toDesc = toTok?.lexeme ? `"${toTok.lexeme}"` : toTok?.kind || 'token';
    if (fromDesc && toDesc) {
      return `SUBSTITUTE ${fromDesc} → ${toDesc}`;
    }
    return `SUBSTITUTE ${toDesc || fromDesc}`;
  }

  // insert
  const tok = edit.token;
  const desc = tok?.lexeme ? `"${tok.lexeme}"` : tok?.kind || 'token';
  return `INSERT ${desc}`;
}

/**
 * Formats a complete repair candidate into a human-readable title.
 * Clearly specifies what token is being deleted, inserted, or substituted.
 */
export function formatCandidateAction(cand: RepairCandidate): string {
  if (cand.edits && cand.edits.length > 0) {
    return cand.edits.map(formatEdit).join(' + ');
  }

  if (cand.reasons && cand.reasons.length > 0) {
    return cand.reasons[0];
  }

  return cand.strategy || 'Repair';
}
