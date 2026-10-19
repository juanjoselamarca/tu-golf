/**
 * src/golf/ronda-libre/etiqueta-modalidad.ts
 *
 * FUENTE ÚNICA de la etiqueta de modalidad que muestran los scorers en el
 * header ("Stroke Play", "Stroke Play Neto", "Stableford", "Match Play
 * Neto", "Match Play"). Estaba calculada dos veces (scorer individual y de grupo).
 * Match play en bruto (vista sin sesión de un match neto, #511) dice "Match Play".
 */

export function etiquetaDeModalidad(
  modoJuego: string | null | undefined,
  formatoJuego: string | null | undefined,
): string {
  const modo = modoJuego ?? 'gross'
  const formato = formatoJuego ?? 'stroke_play'
  return formato === 'match_play' ? (modo === 'neto' ? 'Match Play Neto' : 'Match Play')
    : formato === 'stableford' ? 'Stableford'
    : modo === 'neto' ? 'Stroke Play Neto'
    : 'Stroke Play'
}
