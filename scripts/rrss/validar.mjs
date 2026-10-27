// Controles fijos, sin IA, que toda pieza pasa ANTES de que alguien la mire.
// Son los de la guía de marca; si uno falla, la pieza no se renderiza.
import {
  MEDIDA,
  FORMATOS_LISTOS,
  SLUG_PIEZA,
  TOPE_PALABRAS,
  TOPE_GANCHO_CAPTION,
  HASHTAGS,
  CTA,
} from './marca.mjs'
import { CLAVES, direccion } from './plantillas/index.mjs'
import { buscarVoseo } from '../lib/voseo.mjs'

// Emojis y pictogramas: prohibidos en las láminas, uno como máximo en el caption.
const EMOJI = /\p{Extended_Pictographic}/gu

const esLista = (v) => Array.isArray(v) && v.length > 0

/**
 * Problemas de FORMA de una tabla. Van aparte y se revisan ANTES de leerla:
 * `validarPieza` promete no lanzar, y una tabla a medio escribir
 * (`{"columnas":["HCP"]}`, sin `filas`) hacía reventar `textoVisible` con un
 * TypeError. El operador veía un stack trace en vez de "falta filas".
 */
function problemasDeTabla(t) {
  if (!t || typeof t !== 'object') return ['la tabla no es un objeto']
  if (!esLista(t.columnas)) return ['la tabla no tiene columnas']
  if (!esLista(t.filas)) return ['la tabla no tiene filas']
  const malas = t.filas.filter((f) => !esLista(f?.celdas))
  if (malas.length) return [`${malas.length} fila(s) de la tabla no tienen celdas`]
  // Una fila corrida no revienta nada: sale impresa torcida, que es peor.
  const descuadre = t.filas.findIndex((f) => f.celdas.length !== t.columnas.length)
  if (descuadre >= 0)
    return [
      `fila ${descuadre + 1} de la tabla: ${t.filas[descuadre].celdas.length} celdas ` +
        `para ${t.columnas.length} columnas`,
    ]
  return []
}

/** Texto visible de una lámina (lo que el ojo lee), sin rótulos ni pie. */
function textoVisible(l) {
  const partes = [l.titular, l.pregunta, l.cuerpo, l.cta, l.numero, l.unidad]
  if (l.tabla && !problemasDeTabla(l.tabla).length)
    partes.push(l.tabla.columnas.join(' '), ...l.tabla.filas.map((f) => f.celdas.join(' ')))
  if (Array.isArray(l.detalle)) partes.push(l.detalle.join(' '))
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

  // El patrón vive en marca.mjs porque el `rm` de render.mjs lo afirma con el
  // mismo objeto: si acá hubiera una copia, relajar una no relajaría la otra.
  if (!p.slug || !SLUG_PIEZA.test(p.slug))
    malo.push('slug: falta o no tiene la forma AAAA-MM-DD-nombre-en-minúsculas')
  if (!FORMATOS_LISTOS.includes(p.formato))
    malo.push(
      `formato: "${p.formato}" no está listo. Hay layout para: ${FORMATOS_LISTOS.join(', ')}`,
    )
  if (!['golfistas', 'organizadores'].includes(p.publico))
    malo.push(`público: "${p.publico}" no es golfistas ni organizadores`)

  // La dirección tiene que existir de verdad: si no, el error salía recién a
  // mitad del render, con el navegador ya abierto.
  let dir = null
  if (!p.direccion) malo.push('dirección visual: falta')
  else {
    try {
      dir = direccion(p.direccion)
    } catch {
      malo.push(`dirección visual: "${p.direccion}" no existe. Hay: ${CLAVES.join(', ')}`)
    }
  }

  const laminas = Array.isArray(p.laminas) ? p.laminas : []
  const medida = MEDIDA[p.formato]
  // Un formato aceptado pero sin medida no puede pasar callado: el control de
  // cantidad de láminas se saltaría entero. Solo se exige para los formatos
  // listos; los demás ya fallaron arriba con su propio mensaje.
  if (!medida && FORMATOS_LISTOS.includes(p.formato))
    malo.push(`formato: "${p.formato}" no tiene medidas en MEDIDA`)
  if (medida && (laminas.length < medida.minLaminas || laminas.length > medida.maxLaminas))
    malo.push(
      `láminas: ${laminas.length}; el ${p.formato} va entre ${medida.minLaminas} y ${medida.maxLaminas}`,
    )

  laminas.forEach((l, i) => {
    const d = `lámina ${i + 1}`

    // La plantilla tiene que existir en la dirección y traer TODOS los campos que
    // lee. `escapar()` ahora lanza con undefined, así que esto es lo que convierte
    // un reventón a mitad de la tanda en un mensaje antes de abrir el navegador.
    if (dir) {
      if (!dir.laminas[l.plantilla]) {
        malo.push(
          `${d}: la dirección "${dir.clave}" no tiene la plantilla "${l.plantilla}". ` +
            `Hay: ${Object.keys(dir.laminas).join(', ')}`,
        )
      } else if (!dir.requisitos?.[l.plantilla]) {
        // Sin esto el control pasaba en vacío: la próxima dirección que alguien
        // agregue sin exportar `requisitos` perdía la verificación completa y
        // volvía a imprimir "undefined" dentro del PNG, que es justo el bug que
        // `requisitos` vino a cerrar.
        malo.push(
          `${d}: la dirección "${dir.clave}" no declara qué campos necesita la ` +
            `plantilla "${l.plantilla}" (falta exportar requisitos)`,
        )
      } else {
        const faltan = dir.requisitos[l.plantilla].filter((campo) => {
          const v = l[campo]
          return v === undefined || v === null || (typeof v === 'string' && !v.trim())
        })
        if (faltan.length)
          malo.push(`${d}: la plantilla "${l.plantilla}" necesita ${faltan.join(', ')}`)
      }
    }

    // La forma de la tabla, antes de leerla.
    if (l.tabla) for (const p of problemasDeTabla(l.tabla)) malo.push(`${d}: ${p}`)

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

    // Nombres o canchas inventados tienen que decirlo donde el ojo lo lee: en el
    // texto visible o en el pie de fuente. Antes se aceptaba un campo
    // `marcaEjemplo` que NINGUNA plantilla renderiza, así que la pieza pasaba el
    // control sin que el aviso llegara nunca a la imagen.
    if (l.ejemplo && !/ejemplo/i.test(`${visible} ${l.fuente ?? ''}`))
      malo.push(`${d}: usa datos de ejemplo y no lo dice en la lámina ni en el pie`)
  })

  // Caption: Instagram corta a ~125 caracteres del caption COMPLETO, no de la
  // primera línea. Lo que se exige es que la primera línea entre entera en ese
  // corte, porque es la que tiene que funcionar sola: si se pasa, el gancho
  // aparece mutilado con un "... más" en la mitad de la frase.
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
