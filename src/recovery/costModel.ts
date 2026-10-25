/**
 * Multi-factor cost model for syntax error repair candidates.
 * Calculates lexical, structural, semantic-risk proxy, and diagnostic penalty costs.
 */

import { CostBreakdown, Edit, TokenKind } from '../language/types';
import { isKeyword } from '../language/tokenKinds';
import { RecoveryConfig, DEFAULT_CONFIG } from '../config/defaultConfig';
import { SpeculativeResult } from '../parser/speculativeRunner';

export function calculateCandidateCost(
  edits: readonly Edit[],
  validation: SpeculativeResult,
  config: RecoveryConfig = DEFAULT_CONFIG
): CostBreakdown {
  let lexical = 0;
  let structural = 0;
  let semanticRisk = 0;
  let diagnostic = 0;

  for (const edit of edits) {
    const kind: TokenKind =
      edit.token?.kind || edit.deletedToken?.kind || 'SEMICOLON';
    const baseCost =
      config.baseLexicalCosts[kind] ?? config.defaultLexicalCost;

    // 1. Lexical cost
    if (edit.action === 'insert') {
      lexical += baseCost;
    } else if (edit.action === 'delete') {
      lexical += baseCost * 1.2; // Deletions of source input are penalized more than delimiter insertions
    } else if (edit.action === 'substitute') {
      lexical += baseCost + 0.5;
    }

    const isDeletingOrReplacingKeyword =
      ((edit.action === 'delete' || edit.action === 'substitute') &&
        Boolean(edit.deletedToken && isKeyword(edit.deletedToken.kind))) ||
      (edit.action === 'delete' && isKeyword(kind));

    // 2. Structural penalty
    if (kind === 'LBRACE' || kind === 'RBRACE') {
      structural += 1.5 * config.weights.structural;
    } else if (kind === 'SEMICOLON') {
      structural += 1.0 * config.weights.structural;
    }
    if (isDeletingOrReplacingKeyword) {
      // Deleting or substituting keywords (like ELSE, IF, RETURN, WHILE, FOR) severely damages control structure
      structural += 2.0 * config.weights.structural;
    }

    // 3. Semantic risk proxy (altering names and data is riskier than punctuation)
    if (kind === 'IDENT') {
      semanticRisk += 2.0 * config.weights.semanticRisk;
    } else if (kind === 'NUMBER' || kind === 'STRING') {
      semanticRisk += 1.5 * config.weights.semanticRisk;
    }
    if (isDeletingOrReplacingKeyword) {
      // Deleting or substituting control flow keywords drastically changes program semantics
      semanticRisk += 2.0 * config.weights.semanticRisk;
    }
  }

  // 4. Diagnostic penalty (penalizing candidates that cause secondary parse failures)
  if (validation.failures > 0) {
    diagnostic += validation.failures * 3.0 * config.weights.diagnostic;
  }
  if (validation.outcome === 'fail') {
    diagnostic += 5.0 * config.weights.diagnostic;
  }

  // Round to 2 decimal places to ensure deterministic comparisons without floating-point jitter
  lexical = Math.round(lexical * 100) / 100;
  structural = Math.round(structural * 100) / 100;
  semanticRisk = Math.round(semanticRisk * 100) / 100;
  diagnostic = Math.round(diagnostic * 100) / 100;

  const total =
    Math.round((lexical + structural + semanticRisk + diagnostic) * 100) / 100;

  return {
    lexical,
    structural,
    semanticRisk,
    diagnostic,
    total,
  };
}
