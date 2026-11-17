/**
 * Markdown → una línea de texto plano, cortada en palabra.
 *
 * Para mostrar en la UI textos que escribió un LLM (p. ej. el `next_focus` de una
 * sesión del coach) sin que se vean `**`, `#`, viñetas ni tablas. No toca `_`
 * dentro de una palabra: los nombres de drills (`reset_4_pasos`) quedan intactos.
 */

const ELIPSIS = '…'

function quitarMarkdown(md: string): string {
  return md
    // Imágenes y links: ![t](u) / [t](u) → t
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Backticks (inline y fences)
    .replace(/`+/g, '')
    // Filas separadoras de tablas: |---|:---:|
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, '')
    // Encabezados, citas y viñetas al inicio de línea
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*(>\s*)+/gm, '')
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '')
    // Pipes de tablas
    .replace(/\s*\|\s*/g, ' ')
    // Negrita/cursiva/tachado con * o ~ (también huérfanos)
    .replace(/\*+/g, '')
    .replace(/~~/g, '')
    // _énfasis_ solo en borde de palabra: reset_4_pasos no se toca
    .replace(/(^|[^\p{L}\p{N}])_+(?=\S)/gu, '$1')
    .replace(/(\S)_+(?=$|[^\p{L}\p{N}_])/gu, '$1')
}

/** Corta en el último espacio antes de `max` (con la elipsis incluida en `max`). */
function cortarEnPalabra(texto: string, max: number): string {
  if (texto.length <= max) return texto
  let corte = texto.slice(0, Math.max(0, max - ELIPSIS.length))
  const espacio = corte.lastIndexOf(' ')
  if (espacio > 0) corte = corte.slice(0, espacio)
  return corte.replace(/[\s,;:.·–—-]+$/u, '') + ELIPSIS
}

export function textoPlano(md: string | null | undefined, max: number): string {
  if (!md) return ''
  const plano = quitarMarkdown(md).replace(/\s+/g, ' ').trim()
  return cortarEnPalabra(plano, max)
}
