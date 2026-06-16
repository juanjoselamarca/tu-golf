import { describe, it, expect } from 'vitest';
import { selectFocus } from '../select-focus';
import { spiralRound, NO_TARGET } from './fixtures';

// Ola 1b: el shrinkage ajusta el VALOR REPORTADO de la métrica (no el ranking).
// Sin priors inyectados ⇒ comportamiento idéntico a pre-1b.
describe('selectFocus — shrinkage de la métrica reportada (Ola 1b)', () => {
  const rounds = [spiralRound('r1'), spiralRound('r2'), spiralRound('r3'), spiralRound('r4')];

  it('sin priors: valor reportado idéntico a pre-1b (backward-compatible)', () => {
    const r = selectFocus({ rounds, weights: [], target: NO_TARGET });
    if (r.kind !== 'focus') throw new Error('esperaba focus');
    expect(r.metricKey).toBe('post_bogey_score_avg');
    expect(r.metrica.valor).toBeCloseTo(4.56, 1);
  });

  it('con prior y n bajo: el valor reportado se ajusta hacia el prior', () => {
    const r = selectFocus({
      rounds,
      weights: [],
      target: NO_TARGET,
      priors: { post_bogey_score_avg: { priorMean: 4.0, tau2Between: 0.09, sigma2Within: 0.25 } },
    });
    if (r.kind !== 'focus') throw new Error('esperaba focus');
    // n=4 → λ≈0.59 → posterior≈4.33, entre el prior (4.0) y el jugador (4.56)
    expect(r.metrica.valor).toBeLessThan(4.56);
    expect(r.metrica.valor).toBeGreaterThan(4.0);
  });

  it('prior para otra métrica no afecta a ésta', () => {
    const r = selectFocus({
      rounds,
      weights: [],
      target: NO_TARGET,
      priors: { otra_metrica: { priorMean: 1.0, tau2Between: 0.09, sigma2Within: 0.25 } },
    });
    if (r.kind !== 'focus') throw new Error('esperaba focus');
    expect(r.metrica.valor).toBeCloseTo(4.56, 1);
  });

  it('el ranking (impacto) NO cambia por el shrinkage (sólo confianza × peso)', () => {
    const sin = selectFocus({ rounds, weights: [], target: NO_TARGET });
    const con = selectFocus({
      rounds,
      weights: [],
      target: NO_TARGET,
      priors: { post_bogey_score_avg: { priorMean: 4.0, tau2Between: 0.09, sigma2Within: 0.25 } },
    });
    if (sin.kind !== 'focus' || con.kind !== 'focus') throw new Error('esperaba focus');
    expect(con.impacto).toBe(sin.impacto);
    expect(con.patternId).toBe(sin.patternId);
  });
});
