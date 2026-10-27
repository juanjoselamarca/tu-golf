// Marca de Golfers+ en Instagram, en código. Fuente de verdad en prosa:
// docs/rrss/guia-de-marca.md. Si cambia la guía, cambia acá y en ningún otro lado.

export const COLOR = {
  navy: '#070D18',
  panel: '#0E1C2F',
  negro: '#05090F',
  negroTerminal: '#04070C',
  gold: '#C4992A',
  bone: '#F3F1EA',
  mist: '#8A97A8',
  rojo: '#E0645A',
  linea: '#22324A',
  lineaTenue: '#1B2638',
}

/** Medidas y zonas seguras de cada formato (guía, sección 5). */
export const MEDIDA = {
  carrusel: { ancho: 1080, alto: 1350, margenPx: 96, minLaminas: 5, maxLaminas: 8 },
  story: { ancho: 1080, alto: 1920, margenPx: 96, minLaminas: 1, maxLaminas: 3 },
}

/**
 * Zona que la interfaz de Instagram tapa en un story (guía, sección 5). Todavía
 * no la lee nadie porque no hay layout 9:16; queda acá como la medida a respetar
 * cuando lo haya, y `FORMATOS_LISTOS` impide publicar antes de eso.
 */
export const ZONA_SEGURA_STORY = { arribaPx: 250, abajoPx: 340 }

/**
 * Formatos con layout de verdad. `story` está medido pero ninguna dirección
 * tiene reglas 9:16: la pieza saldría con todo apretado arriba y media lámina
 * vacía. Se rechaza en la validación en vez de dejar un camino que parece
 * aceptado y no lo está.
 */
export const FORMATOS_LISTOS = ['carrusel']

/** La medida de una pieza. Este predicado estaba repetido en cuatro lugares. */
export function medidaDe(pieza) {
  const m = MEDIDA[pieza?.formato]
  if (!m)
    throw new Error(
      `Formato desconocido: "${pieza?.formato}". Hay: ${Object.keys(MEDIDA).join(', ')}`,
    )
  return m
}

/** Tope de palabras visibles (guía, sección 3: "corto y con punch"). */
export const TOPE_PALABRAS = { portada: 7, lamina: 20 }

/** Lo que Instagram muestra del caption antes del "... más". */
export const TOPE_GANCHO_CAPTION = 125

export const HASHTAGS = { min: 3, max: 5 }

/** Llamados a la acción por público (guía, sección 6). */
export const CTA = {
  golfista: 'Anota tu próxima ronda en Golfers+. Link en la bio.',
  organizador: 'Organiza tu torneo con Golfers+. Escríbenos.',
}

/** Todas las familias del sistema. Cada dirección declara las suyas; el render
 *  falla si una no cargó de verdad (un fallback a Arial arruinaría la marca). */
export const FAMILIAS_GOOGLE = [
  'Anton',
  'Barlow:wght@500;600',
  'Barlow+Condensed:ital,wght@0,600;0,800;1,800',
  'Crimson+Pro:ital,wght@0,400;1,400',
  'DM+Sans:wght@500;700',
  'IBM+Plex+Mono:wght@400;600',
  'Inter+Tight:wght@500;700;800',
  'Montserrat:wght@500;600;700',
  'Oswald:wght@400;500;600',
  'Roboto:wght@400;500',
  'Source+Serif+4:opsz,wght@8..60,400',
  'Spectral:ital,wght@1,300',
]

/**
 * Las familias con los pesos que de verdad le pedimos a Google, parseados del
 * spec: 'Barlow+Condensed:ital,wght@0,600;0,800;1,800' → pesos [600, 800].
 * El render los necesita para distinguir un peso cargado de uno SINTETIZADO:
 * si solo se compara la familia, un faux-bold pasa como si fuera la marca.
 */
export function familiasConPesos() {
  return FAMILIAS_GOOGLE.map((spec) => {
    const [nombre, ejes] = spec.split(':')
    const familia = nombre.replace(/\+/g, ' ')
    if (!ejes) return { familia, pesos: [400] }
    const [nombresEje, valores] = ejes.split('@')
    const i = nombresEje.split(',').indexOf('wght')
    if (i < 0) return { familia, pesos: [400] }
    const pesos = [...new Set(valores.split(';').map((t) => Number(t.split(',')[i])))]
    return { familia, pesos: pesos.filter(Number.isFinite).sort((a, b) => a - b) }
  })
}

export const URL_FUENTES =
  `https://fonts.googleapis.com/css2?${FAMILIAS_GOOGLE.map((f) => `family=${f}`).join('&')}&display=swap`

/** CSS que comparten todas las direcciones (guía, 4.1). */
export const CSS_BASE = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${COLOR.negro}}
.fr{position:relative;overflow:hidden;container-type:inline-size;background:${COLOR.navy};color:${COLOR.bone};-webkit-font-smoothing:antialiased}
.abs{position:absolute}
.wm{font-family:"DM Sans",sans-serif;font-weight:700;letter-spacing:-.02em;color:${COLOR.bone}}
.wm b{color:${COLOR.gold};font-weight:700}
`

export function escapar(texto) {
  // String(undefined) devuelve "undefined" y eso se IMPRIME dentro del PNG. Si
  // una plantilla pide un campo que la pieza no trae, tiene que doler acá.
  if (texto === undefined || texto === null)
    throw new Error(
      'escapar() recibió ' +
        String(texto) +
        ': una plantilla está pidiendo un campo que la pieza no trae.',
    )
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** El logo, siempre igual: "Golfers" hueso + "+" dorado. */
export const LOGO = '<span class="wm">Golfers<b>+</b></span>'
