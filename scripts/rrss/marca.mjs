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
  story: { ancho: 1080, alto: 1920, seguraArribaPx: 250, seguraAbajoPx: 340 },
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

export function utm(pieza) {
  return `utm_source=instagram&utm_medium=social&utm_campaign=${pieza}`
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
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** El logo, siempre igual: "Golfers" hueso + "+" dorado. */
export const LOGO = '<span class="wm">Golfers<b>+</b></span>'
