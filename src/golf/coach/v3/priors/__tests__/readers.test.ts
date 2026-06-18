import { describe, it, expect } from 'vitest';
import {
  summarizeDistribution,
  populationPercentileFromBins,
  getInternalPrior,
  interpolateMeanAtIndex,
  type BenchmarkPoint,
  type DistBin,
  type MeanPoint,
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

describe('interpolateMeanAtIndex', () => {
  // Medias par-3 verificadas (Shot Scope) por punto de hándicap.
  const par3: MeanPoint[] = [
    { handicap: 0, mean: 3.2 },
    { handicap: 5, mean: 3.42 },
    { handicap: 10, mean: 3.6 },
    { handicap: 15, mean: 3.83 },
    { handicap: 20, mean: 4.0 },
    { handicap: 25, mean: 4.19 },
  ];

  it('sin puntos → null', () => {
    expect(interpolateMeanAtIndex([], 12)).toBeNull();
  });

  it('un solo punto → esa media para cualquier índice', () => {
    expect(interpolateMeanAtIndex([{ handicap: 10, mean: 3.6 }], 2)).toBe(3.6);
    expect(interpolateMeanAtIndex([{ handicap: 10, mean: 3.6 }], 40)).toBe(3.6);
  });

  it('en un punto exacto → su media exacta', () => {
    expect(interpolateMeanAtIndex(par3, 10)).toBeCloseTo(3.6, 6);
    expect(interpolateMeanAtIndex(par3, 15)).toBeCloseTo(3.83, 6);
  });

  it('interpola linealmente entre dos puntos (índice 12)', () => {
    // 3.6 + (3.83 - 3.6) * (12 - 10) / 5 = 3.692
    expect(interpolateMeanAtIndex(par3, 12)).toBeCloseTo(3.692, 6);
  });

  it('interpola al índice real de Juanjo (9.6)', () => {
    // 3.42 + (3.6 - 3.42) * (9.6 - 5) / 5 = 3.5856
    expect(interpolateMeanAtIndex(par3, 9.6)).toBeCloseTo(3.5856, 6);
  });

  it('satura en los extremos sin extrapolar (CERO FALLOS)', () => {
    expect(interpolateMeanAtIndex(par3, -3)).toBe(3.2); // por debajo del mínimo → mínimo
    expect(interpolateMeanAtIndex(par3, 0)).toBe(3.2);
    expect(interpolateMeanAtIndex(par3, 30)).toBe(4.19); // por encima del máximo → máximo
    expect(interpolateMeanAtIndex(par3, 25)).toBe(4.19);
  });

  it('no depende del orden de entrada', () => {
    const shuffled: MeanPoint[] = [par3[3], par3[0], par3[5], par3[1], par3[4], par3[2]];
    expect(interpolateMeanAtIndex(shuffled, 12)).toBeCloseTo(3.692, 6);
  });
});
