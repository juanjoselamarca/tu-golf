/**
 * Motor de foco del cerebro v3 (Ola 2 "el coach te conoce").
 *
 * Selecciona EL foco de mayor impacto hacia la meta del jugador a partir de su
 * historial real, conectando por primera vez al runtime del coach:
 *  - los 9 patrones de patterns.ts (gate anti-fantasía con umbrales validados),
 *  - las métricas de golf/coach/metrics (huérfanas de Ola 0 → baseline PLAN_METRIC),
 *  - cerebro_weights (paramétrico vivo → rankeo ponderado).
 *
 * Interfaz estable `getFocus(userId)` para que Ola 3 cambie la fuente de patrones
 * (hardcoded → catálogo en DB) sin tocar consumidores.
 */
export { getFocus, defaultFocusDeps, type GetFocusDeps } from './get-focus'
export { selectFocus, deltaVsTarget, patternWeight, MIN_ROUNDS_FOR_FOCUS, DEFAULT_PATTERN_WEIGHT } from './select-focus'
export { FOCUS_CATALOG } from './catalog'
export type { FocusCandidate, Baseline, DetectInfo, MeasureCtx } from './catalog'
export type { Focus, FocusFallback, FocusResult, FocusTarget, SelectFocusInput } from './types'
