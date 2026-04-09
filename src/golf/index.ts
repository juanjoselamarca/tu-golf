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

// Formats — registry
export { getFormat, FORMATS } from './formats'
export type { GolfFormat } from './formats'

// Formats — Match Play
export { calcularMatchPlay, calcularNassau, calcularDiferenciaHandicap, displayDesdeJugador, colorResultadoHoyo, labelResultadoHoyo, CONCEDE } from './formats'
export type { MatchResult, MatchHoleDetail, MatchPlayConfig, HoleResult, NassauResult } from './formats'

// Formats — Best Ball
export { calcularBestBall, scorePrimarioBestBall, ordenarEquiposBestBall } from './formats'
export type { BestBallTeam, BestBallPlayer, BestBallTeamResult, BestBallHoleDetail } from './formats'

// Formats — Scramble
export { calcularScramble, calcularHandicapScramble, scorePrimarioScramble, ordenarEquiposScramble } from './formats'
export type { ScrambleTeam, ScrambleTeamResult, ScrambleHoleDetail } from './formats'

// Formats — Foursome
export { calcularFoursome, calcularHandicapFoursome, teePlayerEnHoyo, scorePrimarioFoursome, ordenarEquiposFoursome } from './formats'
export type { FoursomeTeam, FoursomeTeamResult, FoursomeHoleDetail } from './formats'

// Stats
export { calcularGWI, probResultadoHoyo, varianzaPorHoyo, sigmaTotal } from './stats/gwi'
export type { JugadorGWIInput, GWIResult, ProbHoyo } from './stats/gwi'
export { calcularGWIMatch } from './stats/gwi-match'
export type { MatchGWIInput, MatchGWIResult } from './stats/gwi-match'
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
export { detectAndSavePatterns } from './coach/detect-and-save-patterns'
export { analyzeRound } from './coach/analysis'
export type { RoundAnalysis } from './coach/analysis'
