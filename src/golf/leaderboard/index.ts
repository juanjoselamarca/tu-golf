// src/golf/leaderboard/index.ts
//
// Barrel del módulo de leaderboard de torneos. Toda la lógica de scoring
// agregado vive acá; las queries Supabase viven en src/lib/data/tournaments/.

export * from './types'
export { computeStats } from './compute-stats'
export { buildLeaderboardFromRondaLibre } from './build-from-ronda-libre'
export type { RondaLibreLeaderboardOutput } from './build-from-ronda-libre'
export { buildLeaderboardFromLegacy } from './build-from-legacy'
export type { LegacyLeaderboardOutput } from './build-from-legacy'
export { computeTournamentResults } from './compute-tournament-results'
export { rankEntries } from './rank-entries'
export type { RankingMode, RankEntriesOptions } from './rank-entries'
