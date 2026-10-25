import { describe, it, expect } from 'vitest';
import { generateBenchmarkCorpus } from '../../src/corpus/mutator';
import { evaluateCorpus } from '../../src/corpus/evaluator';

describe('Benchmark Corpus & Evaluation Harness (Stage 10)', () => {
  it('generates a diverse mutation corpus with oracle labels', () => {
    const cases = generateBenchmarkCorpus();

    expect(cases.length).toBeGreaterThanOrEqual(15);

    // Verify all cases have valid metadata
    for (const c of cases) {
      expect(c.id).toBeDefined();
      expect(c.malformedSource).not.toBe(c.cleanSource);
      expect(c.oracleAction).toBeDefined();
      expect(c.oracleExpectedKind).toBeDefined();
      expect(c.errorOffset).toBeGreaterThanOrEqual(0);
    }
  });

  it('runs corpus evaluation and achieves expected recovery and oracle match rates', () => {
    const cases = generateBenchmarkCorpus();
    const summary = evaluateCorpus(cases);

    expect(summary.corpusSize).toBe(cases.length);
    expect(summary.strategies).toHaveLength(2);

    const erdf = summary.strategies[0];
    expect(erdf.strategyName).toContain('ERDF');

    // High recovery rate (> 90%)
    expect(erdf.recoveryRate).toBeGreaterThanOrEqual(90);

    // Exact oracle repair match rate (> 60%)
    expect(erdf.exactMatchRate).toBeGreaterThanOrEqual(60);

    // Sub-millisecond to low millisecond latency (< 15ms per case)
    expect(erdf.meanLatencyMs).toBeLessThan(15);

    // Baseline comparison: ERDF outperforms panic mode in oracle match
    const panic = summary.strategies[1];
    expect(erdf.exactMatchRate).toBeGreaterThan(panic.exactMatchRate);
  });
});
