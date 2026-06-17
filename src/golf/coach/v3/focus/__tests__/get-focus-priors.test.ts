import { describe, it, expect } from 'vitest';
import { getFocus, type GetFocusDeps } from '../get-focus';
import { spiralRound } from './fixtures';
import { FOCUS_CATALOG } from '../catalog';

// Ola 1b: getFocus carga los priors del bucket del jugador y se los pasa a
// selectFocus → el valor reportado se ajusta (prueba de consumo en runtime,
// anti-decoración).
function baseDeps(over: Partial<GetFocusDeps> = {}): GetFocusDeps {
  return {
    loadRounds: async () => [spiralRound('r1'), spiralRound('r2'), spiralRound('r3'), spiralRound('r4')],
    loadTarget: async () => ({ currentHandicap: 20, targetHandicap: 14, targetDeadline: null }),
    loadWeights: async () => [],
    loadCatalog: async () => FOCUS_CATALOG,
    loadValidation: async () => ({}),
    ...over,
  };
}

describe('getFocus — wiring de priors (Ola 1b)', () => {
  it('sin loadPriors: el motor opera sin shrinkage (valor crudo)', async () => {
    const r = await getFocus('u1', baseDeps());
    if (r.kind !== 'focus') throw new Error('esperaba focus');
    expect(r.metrica.valor).toBeCloseTo(4.56, 1);
  });

  it('con loadPriors: pasa el índice del jugador y ajusta el valor reportado', async () => {
    let receivedIndex: number | null = -999;
    const r = await getFocus('u1', baseDeps({
      loadPriors: async (handicapIndex) => {
        receivedIndex = handicapIndex;
        return { post_bogey_score_avg: { priorMean: 4.0, tau2Between: 0.09, sigma2Within: 0.25 } };
      },
    }));
    if (r.kind !== 'focus') throw new Error('esperaba focus');
    expect(receivedIndex).toBe(20); // currentHandicap del target
    expect(r.metrica.valor).toBeLessThan(4.56);
    expect(r.metrica.valor).toBeGreaterThan(4.0);
  });

  it('cold-start: sin currentHandicap usa la meta de onboarding como índice', async () => {
    let receivedIndex: number | null = -999;
    await getFocus('u1', baseDeps({
      loadTarget: async () => ({ currentHandicap: null, targetHandicap: 14, targetDeadline: null }),
      loadPriors: async (handicapIndex) => {
        receivedIndex = handicapIndex;
        return {};
      },
    }));
    expect(receivedIndex).toBe(14); // cae a targetHandicap
  });
});
