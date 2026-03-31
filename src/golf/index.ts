/**
 * src/golf/ — Motor de reglas de golf centralizado.
 *
 * Barrel export para imports limpios:
 *   import { vsPar, calcularGWI, SCORE_STYLES } from '@/golf'
 */

// Core
export * from './core/rules'
export * from './core/scoring'
export * from './core/compare'
export * from './core/colors'
export * from './core/countback'

// Formats
export { getFormat, FORMATS } from './formats'
export type { GolfFormat } from './formats'

// Stats
export { calcularGWI, probResultadoHoyo, varianzaPorHoyo, sigmaTotal } from './stats/gwi'
export type { JugadorGWIInput, GWIResult, ProbHoyo } from './stats/gwi'
export { calcularCPI, nivelCPI, validarRonda } from './stats/cpi'
export type { RondaCPI, ResultadoCPI } from './stats/cpi'
export { calcPersonalStats } from './stats/personal'
export type { PersonalStats } from './stats/personal'

// Courses
export * from './courses/types'
export * from './courses/matching'

// Coach
export { detectPatterns } from './coach/patterns'
export type { GolfPattern, PatternRound } from './coach/patterns'
export { analyzeRound } from './coach/analysis'
export type { RoundAnalysis } from './coach/analysis'
