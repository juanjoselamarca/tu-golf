// src/golf/coach/v3/priors/shrinkage.ts
// Shrinkage bayesiano empírico (Ola 1b, spec §5.1). Función PURA, testeable
// sin DB. "Que decida el dato": el peso del jugador crece con n / precisión,
// sin corte fijo de N.
//
// CLAVE (corrección del review): las varianzas son POBLACIONALES, no del
// jugador. Con n=2 la varianza propia es ruido y rompería la fórmula justo
// en el cold-start que queremos resolver.
//   - sigma2Within: varianza ronda-a-ronda típica del bucket (poblacional).
//   - tau2Between:  varianza entre-jugadores del bucket (= sdTotal² del prior,
//                   que es una distribución entre-jugadores).
// Solo media del jugador (playerMean) y conteo (n) salen del jugador.

const EPS = 1e-6;

export interface ShrinkInput {
  /** media observada del jugador (escala interna del catálogo) */
  playerMean: number;
  /** nº de observaciones del jugador (muestra del baseline) */
  n: number;
  /** media del prior (poblacional, misma escala que playerMean) */
  priorMean: number;
  /** varianza ronda-a-ronda poblacional del bucket */
  sigma2Within: number;
  /** varianza entre-jugadores poblacional del bucket */
  tau2Between: number;
}

/**
 * Posterior empirical-Bayes de la media del jugador.
 * λ = (n/σ²_within) / (n/σ²_within + 1/τ²_between); posterior = λ·player + (1−λ)·prior.
 * n→∞ ⇒ λ→1 (manda el jugador). n pequeño ⇒ el prior pesa. Estable desde n=1.
 */
export function shrink({ playerMean, n, priorMean, sigma2Within, tau2Between }: ShrinkInput): number {
  if (!Number.isFinite(playerMean) || n <= 0) return priorMean;
  const within = Math.max(sigma2Within, EPS);
  const tau = Math.max(tau2Between, EPS); // clamp ≥ ε (nunca negativa/cero)
  const playerPrecision = n / within;
  const priorPrecision = 1 / tau;
  const lambda = playerPrecision / (playerPrecision + priorPrecision);
  return lambda * playerMean + (1 - lambda) * priorMean;
}

/** λ expuesto para diagnóstico/tests (peso del jugador, 0..1). */
export function shrinkLambda(n: number, sigma2Within: number, tau2Between: number): number {
  if (n <= 0) return 0;
  const within = Math.max(sigma2Within, EPS);
  const tau = Math.max(tau2Between, EPS);
  const playerPrecision = n / within;
  return playerPrecision / (playerPrecision + 1 / tau);
}
