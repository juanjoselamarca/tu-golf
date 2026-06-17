import { describe, it, expect } from 'vitest';
import {
  summarizeDistribution,
  populationPercentileFromBins,
  getInternalPrior,
  type BenchmarkPoint,
  type DistBin,
} from '../readers';

describe('summarizeDistribution', () => {
  const points: BenchmarkPoint[] = [
    { percentile: 10, value: 3.4 },
    { percentile: 25, value: 3.6 },
    { percentile: 50, value: 3.9 },
    { percentile: 75, value: 4.2 },
    { percentile: 90, value: 4.5 },
  ];

  it('mean = p50', () => {
    expect(summarizeDistribution(points)!.mean).toBe(3.9);
  });

  it('sd estimada del rango p10-p90', () => {
    const sd = summarizeDistribution(points)!.sdTotal;
    expect(sd).toBeCloseTo((4.5 - 3.4) / 2.563, 4);
  });

  it('fallback a IQR si faltan p10/p90', () => {
    const s = summarizeDistribution([
      { percentile: 25, value: 3.6 },
      { percentile: 50, value: 3.9 },
      { percentile: 75, value: 4.2 },
    ]);
    expect(s!.sdTotal).toBeCloseTo((4.2 - 3.6) / 1.349, 4);
  });

  it('null si no hay puntos', () => {
    expect(summarizeDistribution([])).toBeNull();
  });
});

describe('populationPercentileFromBins', () => {
  const bins: DistBin[] = [
    { handicap_bin: '0-4', proportion: 0.10 },
    { handicap_bin: '5-9', proportion: 0.20 },
    { handicap_bin: '10-14', proportion: 0.28 },
    { handicap_bin: '15-19', proportion: 0.24 },
    { handicap_bin: '20-28', proportion: 0.14 },
    { handicap_bin: '29+', proportion: 0.04 },
  ];

  it('índice 9.6 (bin 5-9) → mejor que ~80%', () => {
    // peores: 0.28+0.24+0.14+0.04 = 0.70 + mitad propio 0.10 = 0.80
    expect(populationPercentileFromBins(bins, 9.6)).toBe(80);
  });

  it('scratch (índice 2) está en el top', () => {
    // peores que 0-4: todo menos 0-4 = 0.90 + 0.05 = 0.95
    expect(populationPercentileFromBins(bins, 2)).toBe(95);
  });

  it('null sin bins', () => {
    expect(populationPercentileFromBins([], 10)).toBeNull();
  });
});

describe('getInternalPrior', () => {
  // mock mínimo del query builder de Supabase para score_par3
  function mockClient(rows: { percentile: number; value: number }[]) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    } as any;
  }

  it('par3_avg_vs_par convierte strokes absolutos a vs-par (resta 3) + trae varianzas', async () => {
    const prior = await getInternalPrior(mockClient([
      { percentile: 10, value: 3.4 },
      { percentile: 50, value: 3.9 },
      { percentile: 90, value: 4.5 },
    ]), '10-14', 'par3_avg_vs_par');
    expect(prior).not.toBeNull();
    expect(prior!.priorMean).toBeCloseTo(0.9, 4); // 3.9 - 3
    // tau2Between = sdTotal² ; sdTotal = (4.5-3.4)/2.563
    const sd = (4.5 - 3.4) / 2.563;
    expect(prior!.tau2Between).toBeCloseTo(sd * sd, 4);
    expect(prior!.sigma2Within).toBeCloseTo(0.25, 4); // withinRoundSd 0.5² (preliminar)
  });

  it('metricKey sin mapeo → null', async () => {
    const prior = await getInternalPrior(mockClient([]), '10-14', 'metrica_inexistente');
    expect(prior).toBeNull();
  });
});
