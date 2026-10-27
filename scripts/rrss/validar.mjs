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
import { ESCENAS } from './escenas.mjs'
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
  // Una celda que no es texto ni número se imprime "[object Object]" dentro del
  // PNG: el mismo bug que cerró `requisitos`, por otra puerta.
  const iRara = t.filas.findIndex((f) => f.celdas.some((c) => !['string', 'number'].includes(typeof c)))
  if (iRara >= 0) return [`fila ${iRara + 1} de la tabla tiene celdas que no son texto ni número`]
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

  // Una pieza que es el reel de una escena lo declara con `escena`, y de ahí sale
  // el MP4 que se sube (publicar.mjs → videoDePieza). Se verifica acá, con el
  // resto de los controles de marca, porque el empaquetado es el último paso del
  // ciclo: un nombre mal escrito descubierto ahí llega con la tanda ya aprobada y
  // obliga a pedir la aprobación de nuevo.
  if (p.escena !== undefined) {
    const escena = ESCENAS[p.escena]
    if (!escena)
      malo.push(`escena: "${p.escena}" no existe. Hay: ${Object.keys(ESCENAS).join(', ')}`)
    else if (escena.cierre?.pieza && escena.cierre.pieza !== p.slug)
      malo.push(
        `escena: "${p.escena}" cierra con la pieza ${escena.cierre.pieza}, no con esta. ` +
          'Dos piezas no pueden reclamar el mismo video: la que se sube sería la equivocada.',
      )
    if (p.formato !== 'story')
      malo.push(`escena: un reel es 9:16 y esta pieza es "${p.formato}"`)
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
      } else if (!dir.plantillasPorFormato?.[p.formato]) {
        // Mismo criterio que `requisitos`: una dirección que no declara qué
        // tiene resuelto en cada formato no puede pasar en silencio, porque el
        // control de abajo se saltaría entero.
        malo.push(
          `${d}: la dirección "${dir.clave}" no declara qué plantillas tiene ` +
            `resueltas en ${p.formato} (falta exportar plantillasPorFormato)`,
        )
      } else if (!dir.plantillasPorFormato[p.formato].includes(l.plantilla)) {
        malo.push(
          `${d}: la plantilla "${l.plantilla}" no tiene layout en ${p.formato}. ` +
            `En ${p.formato} hay: ${dir.plantillasPorFormato[p.formato].join(', ')}`,
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

    // `detalle` lo renderiza la plantilla con .map (bloomberg.mjs). Endurecer
    // `textoVisible` con Array.isArray sacó el TypeError de ACÁ y lo dejó en el
    // render: un `"detalle": "una línea"` aprobaba con CERO problemas y
    // reventaba a mitad de la tanda, con Chromium ya abierto. De paso su texto
    // se saltaba los controles de emoji, voseo y pie de fuente.
    if (l.detalle !== undefined && !Array.isArray(l.detalle))
      malo.push(`${d}: detalle tiene que ser una lista de líneas`)

    // La portada es un concepto de CARRUSEL: la lámina 1 es el gancho que se
    // lee en un segundo mientras el dedo baja. En 9:16 no hay portada — la
    // lámina ES la pieza, y un cierre lleva el titular y el llamado a la
    // acción juntos.
    const tope = i === 0 && medida?.tienePortada ? TOPE_PALABRAS.portada : TOPE_PALABRAS.lamina
    const n = palabrasTitular(l)
    if (n > tope) malo.push(`${d}: ${n} palabras de titular; el tope es ${tope}`)
    if (n === 0) malo.push(`${d}: no dice nada`)

    // El folio numera una secuencia; en un formato de una lámina no numera nada
    // y queda un "01" suelto arriba a la derecha.
    if (l.folio !== undefined && medida && !medida.folio)
      malo.push(`${d}: folio es concepto de ${Object.keys(MEDIDA).filter((f) => MEDIDA[f].folio).join('/')}, no de ${p.formato}`)

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
    // `Array.isArray` y no `?? []`: `??` solo tapa undefined y null, así que
    // un `"filas": {"1": {…}}` llegaba acá y reventaba con TypeError aunque
    // `problemasDeTabla` ya hubiera anotado el problema — anota, no corta.
    const filas = Array.isArray(l.tabla?.filas) ? l.tabla.filas : []
    const destacadas = filas.filter((f) => f?.destacada).length
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

  // El mismo predicado que `laminas`: con `?? []`, un
  // `"hashtags": "#golf #chile"` pasaba el control de cantidad (contaba 12
  // caracteres como 12 hashtags) y moría en `.some`.
  if (p.hashtags !== undefined && !Array.isArray(p.hashtags))
    malo.push('hashtags: tiene que ser una lista')
  const tags = Array.isArray(p.hashtags) ? p.hashtags : []
  if (tags.length < HASHTAGS.min || tags.length > HASHTAGS.max)
    malo.push(`hashtags: ${tags.length}; van entre ${HASHTAGS.min} y ${HASHTAGS.max}`)
  if (tags.some((t) => !/^#[\p{L}\d]+$/u.test(t))) malo.push('hashtags: alguno no es #unasolapalabra')

  return malo
}
