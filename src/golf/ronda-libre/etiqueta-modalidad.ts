import { formatLabel, modoDeJuego } from '@/golf/core/rules'
import { HCP_PCT_DEFAULT, hcpPctEfectivo } from '@/golf/core/playing-handicap'
/**
 * src/golf/ronda-libre/etiqueta-modalidad.ts
 *
 * FUENTE ÚNICA de la etiqueta de modalidad que muestran los scorers en el
 * header ("Stroke Play", "Stroke Play Neto", "Stableford", "Match Play
 * Neto", "Match Play"). Estaba calculada dos veces (scorer individual y de grupo).
 * Match play en bruto (vista sin sesión de un match neto, #511) dice "Match Play".
 * Los formatos por equipo dicen su nombre ("Scramble Neto", "Foursome", "Best Ball
 * Neto"): antes caían en "Stroke Play" (#602). Stableford se juega siempre neto.
 * Si la tarjeta heredó un handicap de juego del torneo (`ronda.hcp_pct`), se avisa
 * el % ("Stroke Play Neto · 85 %"): el jugador que cuenta sus golpes en el hoyo
 * tiene que saber que no juega con su handicap de cancha completo.
 */

export function etiquetaDeModalidad(
  modoJuego: string | null | undefined,
  formatoJuego: string | null | undefined,
  hcpPct?: number | null,
): string {
  const modo = modoDeJuego(modoJuego)
  const formato = formatoJuego ?? 'stroke_play'
  const base = formatLabel(formato)
  const etiqueta = formato !== 'stableford' && modo === 'neto' ? `${base} Neto` : base
  const pct = hcpPctEfectivo({ formato, modo, hcpPct })
  return pct === HCP_PCT_DEFAULT ? etiqueta : `${etiqueta} · ${pct} %`
}
