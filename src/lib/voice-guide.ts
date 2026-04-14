/**
 * Golfers+ Voice Guide — "Confianza tranquila"
 *
 * 3 modos de voz:
 * - Caddie: scoring, en vivo, datos en cancha — invisible, preciso
 * - Clubhouse: dashboard, stats, coach, social — calido, personalizado
 * - Pro Shop: settings, errores, admin, onboarding — claro, directo
 *
 * Cada texto en la app debe pasar por esta referencia.
 * Guardrails: cero emojis, cero "!", cero "ups/oops", cero diminutivos.
 */

export const EMPTY_STATES = {
  noRounds: 'Tu historial empieza con la primera ronda',
  noStats: 'Con 3 rondas, aqui veras tu evolucion',
  noTournaments: 'Organiza tu primera competencia',
  noCoach: 'tAIger+ necesita conocer tu juego. Juega 3 rondas',
  noLeaderboard: 'Cuando haya jugadores en cancha, aqui los veras',
  noConnection: 'Sin conexion. Tus datos se guardaran cuando vuelvas',
  noImports: 'Conecta tu Garmin o sube una foto para traer tu historial',
} as const

export const ERROR_MESSAGES = {
  saveFailed: 'Error guardando. Reintentar',
  roundFinalized: 'Ronda finalizada',
  tournamentInactive: 'Torneo inactivo',
  noPermission: 'Sin permisos',
  sessionExpired: 'Sesion expirada. Inicia sesion',
  notFound: 'No encontrado',
  generic: 'Algo salio mal. Intenta de nuevo',
} as const

export const LABELS = {
  createRound: 'Crear ronda',
  createTournament: 'Crear competencia',
  import: 'Importar',
  viewAll: 'Ver todo',
  retry: 'Reintentar',
  confirm: 'Confirmar',
  cancel: 'Cancelar',
  save: 'Guardar',
  close: 'Cerrar',
  back: 'Volver',
} as const
