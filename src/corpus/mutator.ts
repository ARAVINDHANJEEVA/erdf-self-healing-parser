/**
 * Programmatic mutation engine generating benchmark corpus cases with oracle ground truths.
 */

import { SEED_PROGRAMS } from './seeds';

export type MutationType = 'delete' | 'insert' | 'substitute';

export interface CorpusCase {
  readonly id: string;
  readonly seedId: string;
  readonly mutationType: MutationType;
  readonly description: string;
  readonly cleanSource: string;
  readonly malformedSource: string;
  readonly errorOffset: number;
  readonly oracleAction: 'insert' | 'delete' | 'substitute';
  readonly oracleExpectedKind: string;
}

export function generateBenchmarkCorpus(): CorpusCase[] {
  const cases: CorpusCase[] = [];

  for (const seed of SEED_PROGRAMS) {
    // 1. Delete Semicolon
    const semiIndex = seed.source.indexOf(';');
    if (semiIndex !== -1) {
      const malformed =
        seed.source.slice(0, semiIndex) + seed.source.slice(semiIndex + 1);
      cases.push({
        id: `${seed.id}-del-semi`,
        seedId: seed.id,
        mutationType: 'delete',
        description: `Omit statement terminating ';' in ${seed.name}`,
        cleanSource: seed.source,
        malformedSource: malformed,
        errorOffset: semiIndex,
        oracleAction: 'insert',
        oracleExpectedKind: 'SEMICOLON',
      });
    }

    // 2. Delete Closing Parenthesis
    const rparenIndex = seed.source.indexOf(')');
    if (rparenIndex !== -1) {
      const malformed =
        seed.source.slice(0, rparenIndex) + seed.source.slice(rparenIndex + 1);
      cases.push({
        id: `${seed.id}-del-rparen`,
        seedId: seed.id,
        mutationType: 'delete',
        description: `Omit closing parenthesis ')' in ${seed.name}`,
        cleanSource: seed.source,
        malformedSource: malformed,
        errorOffset: rparenIndex,
        oracleAction: 'insert',
        oracleExpectedKind: 'RPAREN',
      });
    }

    // 3. Delete Closing Block Brace
    const rbraceIndex = seed.source.lastIndexOf('}');
    if (rbraceIndex !== -1) {
      const malformed =
        seed.source.slice(0, rbraceIndex) + seed.source.slice(rbraceIndex + 1);
      cases.push({
        id: `${seed.id}-del-rbrace`,
        seedId: seed.id,
        mutationType: 'delete',
        description: `Omit closing block brace '}' in ${seed.name}`,
        cleanSource: seed.source,
        malformedSource: malformed,
        errorOffset: rbraceIndex,
        oracleAction: 'insert',
        oracleExpectedKind: 'RBRACE',
      });
    }

    // 4. Stray Invalid Operator Insertion
    const assignIndex = seed.source.indexOf('=');
    if (assignIndex !== -1) {
      const malformed =
        seed.source.slice(0, assignIndex + 1) +
        ' +' +
        seed.source.slice(assignIndex + 1);
      cases.push({
        id: `${seed.id}-stray-op`,
        seedId: seed.id,
        mutationType: 'insert',
        description: `Inject stray operator '+' after '=' in ${seed.name}`,
        cleanSource: seed.source,
        malformedSource: malformed,
        errorOffset: assignIndex + 1,
        oracleAction: 'delete',
        oracleExpectedKind: 'PLUS',
      });
    }
  }

  return cases;
}
