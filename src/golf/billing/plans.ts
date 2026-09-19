// Fuente de verdad del catálogo de planes.
// Mapea cada feature gateable al tier mínimo que la desbloquea.
// Mover un feature entre tiers = cambiar una línea acá.

export const TIERS = ['free', 'pro', 'pro_plus'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  pro: 1,
  pro_plus: 2,
}

export type Feature =
  // Formatos de juego gateados (quality gate: modos neto dependen de stroke index)
  | 'match-play-neto'
  | 'best-ball-neto'
  | 'stableford-neto'
  // Coach tAIger+
  | 'coach-plan'
  | 'coach-tracking'
  | 'coach-v3'
  | 'pattern-detection'
  | 'mental-index'
  | 'post-round-insights'
  // Stats avanzadas
  | 'gwi'
  | 'history-full'
  | 'countback'
  // Display premium
  | 'leaderboard-live'
  | 'share-cards-premium'
  // Organizador premium
  | 'tournament-tv'
  | 'tournament-ai-assistant'
  | 'tournament-collab'
  | 'guest-tournament'
  | 'tournament-quota'
  // Pro+ (no construido todavía)
  | 'season-projection'
  | 'season-goal'
  | 'comparisons'
  | 'export-rounds'
  | 'handicap-trend'

export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  // Pro tier
  'match-play-neto': 'pro',
  'best-ball-neto': 'pro',
  'stableford-neto': 'pro',
  'coach-plan': 'pro',
  'coach-tracking': 'pro',
  'coach-v3': 'pro',
  'pattern-detection': 'pro',
  'mental-index': 'pro',
  'post-round-insights': 'pro',
  'gwi': 'pro',
  'history-full': 'pro',
  'countback': 'pro',
  'leaderboard-live': 'pro',
  'share-cards-premium': 'pro',
  'tournament-tv': 'pro',
  'tournament-ai-assistant': 'pro',
  'tournament-collab': 'pro',
  'guest-tournament': 'pro',
  'tournament-quota': 'pro',
  // Pro+ tier
  'season-projection': 'pro_plus',
  'season-goal': 'pro_plus',
  'comparisons': 'pro_plus',
  'export-rounds': 'pro_plus',
  'handicap-trend': 'pro_plus',
}
