import { formatLabel, modoDeJuego } from '@/golf/core/rules'
/**
 * src/golf/ronda-libre/etiqueta-modalidad.ts
 *
 * FUENTE ÚNICA de la etiqueta de modalidad que muestran los scorers en el
 * header ("Stroke Play", "Stroke Play Neto", "Stableford", "Match Play
 * Neto", "Match Play"). Estaba calculada dos veces (scorer individual y de grupo).
 * Match play en bruto (vista sin sesión de un match neto, #511) dice "Match Play".
 * Los formatos por equipo dicen su nombre ("Scramble Neto", "Foursome", "Best Ball
 * Neto"): antes caían en "Stroke Play" (#602). Stableford se juega siempre neto.
 */

export function etiquetaDeModalidad(
  modoJuego: string | null | undefined,
  formatoJuego: string | null | undefined,
): string {
  const modo = modoDeJuego(modoJuego)
  const formato = formatoJuego ?? 'stroke_play'
  const base = formatLabel(formato)
  return formato !== 'stableford' && modo === 'neto' ? `${base} Neto` : base
}
