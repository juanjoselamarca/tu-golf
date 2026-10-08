import type { RondaLibre } from '@/types/ronda'

/**
 * La ronda tal como la ve quien NO puede ver el neto (decisión de Juanjo,
 * 08-oct-2026: un espectador sin sesión de una ronda neto ve SÓLO golpes gross
 * y vs par gross). Se muestra como stroke play gross: los puntos stableford y el
 * resultado de un match se juegan con handicap, así que su versión bruta sería
 * otro juego. Los equipos siguen siendo equipos, en gross.
 */
export function vistaBruta(ronda: RondaLibre): RondaLibre {
  const formato = ronda.formato_juego === 'stableford' || ronda.formato_juego === 'match_play'
    ? 'stroke_play'
    : ronda.formato_juego
  return { ...ronda, modo_juego: 'gross', formato_juego: formato }
}
