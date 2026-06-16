import { describe, it, expect } from 'vitest';
import { shrink, shrinkLambda } from '../shrinkage';

describe('shrink (empirical-Bayes)', () => {
  const base = { priorMean: 0.9, sigma2Within: 0.25, tau2Between: 0.09 };

  it('n=1: el prior domina (posterior cerca del prior)', () => {
    const p = shrink({ ...base, playerMean: 2.0, n: 1 });
    expect(Math.abs(p - base.priorMean)).toBeLessThan(Math.abs(p - 2.0));
  });

  it('n grande: el jugador domina (posterior ≈ playerMean)', () => {
    const p = shrink({ ...base, playerMean: 2.0, n: 60 });
    expect(p).toBeCloseTo(2.0, 1);
  });

  it('monotonía: más n ⇒ más cerca del jugador', () => {
    const near = shrink({ ...base, playerMean: 2.0, n: 30 });
    const far = shrink({ ...base, playerMean: 2.0, n: 3 });
    expect(Math.abs(near - 2.0)).toBeLessThan(Math.abs(far - 2.0));
  });

  it('n inválido o sin observaciones ⇒ prior', () => {
    expect(shrink({ ...base, playerMean: 2.0, n: 0 })).toBe(base.priorMean);
  });

  it('playerMean no finito ⇒ prior (sin NaN)', () => {
    expect(shrink({ ...base, playerMean: NaN, n: 10 })).toBe(base.priorMean);
    expect(Number.isNaN(shrink({ ...base, playerMean: NaN, n: 10 }))).toBe(false);
  });

  it('tau2Between=0 (clamp) no produce NaN ni divide por cero', () => {
    const p = shrink({ playerMean: 2.0, n: 5, priorMean: 0.9, sigma2Within: 0.25, tau2Between: 0 });
    expect(Number.isFinite(p)).toBe(true);
  });

  it('REGRESIÓN high-N: jugador con n≥20 y baja varianza ⇒ posterior ≈ playerMean (foco no cambia)', () => {
    const p = shrink({ playerMean: 1.4, n: 25, priorMean: 0.9, sigma2Within: 0.2, tau2Between: 0.09 });
    expect(Math.abs(p - 1.4)).toBeLessThan(0.05);
  });
});

describe('shrinkLambda', () => {
  it('crece monótono con n', () => {
    const l3 = shrinkLambda(3, 0.25, 0.09);
    const l30 = shrinkLambda(30, 0.25, 0.09);
    expect(l30).toBeGreaterThan(l3);
    expect(l30).toBeLessThanOrEqual(1);
    expect(l3).toBeGreaterThanOrEqual(0);
  });
});
