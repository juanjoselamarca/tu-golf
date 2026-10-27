// Controles fijos, sin IA, que toda pieza pasa ANTES de que alguien la mire.
// Son los de la guía de marca; si uno falla, la pieza no se renderiza.
import { MEDIDA, TOPE_PALABRAS, TOPE_GANCHO_CAPTION, HASHTAGS, CTA } from './marca.mjs'
import { buscarVoseo } from '../lib/voseo.mjs'

// Emojis y pictogramas: prohibidos en las láminas, uno como máximo en el caption.
const EMOJI = /\p{Extended_Pictographic}/gu

/** Texto visible de una lámina (lo que el ojo lee), sin rótulos ni pie. */
function textoVisible(l) {
  const partes = [l.titular, l.pregunta, l.cuerpo, l.cta, l.numero, l.unidad]
  if (l.tabla) partes.push(l.tabla.columnas.join(' '), ...l.tabla.filas.map((f) => f.celdas.join(' ')))
  if (l.detalle) partes.push(l.detalle.join(' '))
  return partes.filter(Boolean).join(' ')
}

/** Palabras del titular/gancho de una lámina (la tabla y el pie no cuentan). */
function palabrasTitular(l) {
  const t = [l.titular, l.pregunta, l.cuerpo, l.cta].filter(Boolean).join(' ')
  return t.replace(/\*/g, '').split(/\s+/).filter(Boolean).length
}

function tieneNumero(l) {
  return /\d/.test(textoVisible(l))
}

/**
 * Revisa una pieza completa. Devuelve la lista de problemas: vacía = aprueba.
 * Nunca lanza: el que llama decide si corta.
 */
export function validarPieza(p) {
  const malo = []
  const medida = MEDIDA[p.formato === 'story' ? 'story' : 'carrusel']

  if (!p.slug || !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(p.slug))
    malo.push('slug: falta o no tiene la forma AAAA-MM-DD-nombre-en-minúsculas')
  if (!['carrusel', 'story'].includes(p.formato)) malo.push(`formato: "${p.formato}" no es carrusel ni story`)
  if (!p.direccion) malo.push('dirección visual: falta')
  if (!['golfistas', 'organizadores'].includes(p.publico))
    malo.push(`público: "${p.publico}" no es golfistas ni organizadores`)

  const laminas = p.laminas ?? []
  if (p.formato === 'carrusel' && (laminas.length < medida.minLaminas || laminas.length > medida.maxLaminas))
    malo.push(`láminas: ${laminas.length}; el carrusel va entre ${medida.minLaminas} y ${medida.maxLaminas}`)

  laminas.forEach((l, i) => {
    const d = `lámina ${i + 1}`
    const tope = i === 0 ? TOPE_PALABRAS.portada : TOPE_PALABRAS.lamina
    const n = palabrasTitular(l)
    if (n > tope) malo.push(`${d}: ${n} palabras de titular; el tope es ${tope}`)
    if (n === 0) malo.push(`${d}: no dice nada`)

    const visible = textoVisible(l)
    const emojis = visible.match(EMOJI)
    if (emojis) malo.push(`${d}: lleva emoji (${emojis.join(' ')}); en las láminas no van`)

    const voseo = buscarVoseo(visible)
    if (voseo.length) malo.push(`${d}: voseo (${voseo.join(', ')}); el copy va en español de Chile`)

    if (tieneNumero(l) && !l.fuente) malo.push(`${d}: muestra un número y no lleva pie de fuente`)

    // Un solo protagonista en dorado por lámina (guía 4.1). Cuentan las palabras
    // marcadas con *asteriscos*, la fila destacada de la tabla y el número gigante
    // de la plantilla "numero", que siempre va dorado.
    const marcadas = ['titular', 'cuerpo', 'cta', 'pregunta'].reduce(
      (n, k) => n + (String(l[k] ?? '').match(/\*[^*]+\*/g) ?? []).length,
      0,
    )
    const destacadas = (l.tabla?.filas ?? []).filter((f) => f.destacada).length
    const protagonistas = marcadas + destacadas + (l.plantilla === 'numero' ? 1 : 0)
    if (protagonistas > 1)
      malo.push(`${d}: ${protagonistas} elementos en dorado (palabras, fila destacada o número); va uno solo`)

    // Nombres o canchas inventados tienen que decirlo en la lámina (guía 4.1).
    if (l.ejemplo && !/ejemplo/i.test(visible + ' ' + String(l.marcaEjemplo ?? '')))
      malo.push(`${d}: usa datos de ejemplo y no lo dice`)
  })

  // Caption: el gancho es lo único que Instagram muestra antes del "... más".
  const caption = String(p.caption ?? '')
  if (!caption.trim()) malo.push('caption: falta')
  const gancho = caption.split('\n')[0]
  if (gancho.length > TOPE_GANCHO_CAPTION)
    malo.push(`caption: el gancho tiene ${gancho.length} caracteres; Instagram corta en ${TOPE_GANCHO_CAPTION}`)
  const emojiCaption = caption.match(EMOJI) ?? []
  if (emojiCaption.length > 1) malo.push(`caption: ${emojiCaption.length} emojis; va uno como máximo`)
  const voseoCaption = buscarVoseo(caption)
  if (voseoCaption.length) malo.push(`caption: voseo (${voseoCaption.join(', ')})`)

  const esperado = CTA[p.publico === 'organizadores' ? 'organizador' : 'golfista']
  if (!caption.includes(esperado)) malo.push(`caption: falta el llamado a la acción "${esperado}"`)

  const tags = p.hashtags ?? []
  if (tags.length < HASHTAGS.min || tags.length > HASHTAGS.max)
    malo.push(`hashtags: ${tags.length}; van entre ${HASHTAGS.min} y ${HASHTAGS.max}`)
  if (tags.some((t) => !/^#[\p{L}\d]+$/u.test(t))) malo.push('hashtags: alguno no es #unasolapalabra')

  return malo
}
