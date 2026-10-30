// Marca de Golfers+ en Instagram, en código. Fuente de verdad en prosa:
// docs/rrss/guia-de-marca.md. Si cambia la guía, cambia acá y en ningún otro lado.
import { createHash } from 'node:crypto'

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

/**
 * Forma del slug de una pieza. No es cosmética: el slug entra en una ruta de
 * disco y `render.mjs` borra esa carpeta antes de escribir. Sin barras, sin
 * puntos y sin "..", el borrado no puede salirse de `out/rrss/`. Vive acá y no
 * en el validador para que el `rm` pueda afirmarlo con el MISMO patrón que lo
 * aprobó, en vez de confiar en que alguien validó antes.
 */
export const SLUG_PIEZA = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/

/**
 * Medidas y zonas seguras de cada formato (guía, sección 5).
 *
 * Lo propio de cada formato va DECLARADO acá, no en condicionales sueltos
 * repartidos por el validador, el render y las plantillas: así un formato nuevo
 * no se cuela en silencio con el comportamiento del carrusel.
 *  - `tienePortada`: la lámina 1 es un gancho con tope de palabras propio. Es
 *    concepto de carrusel: en 9:16 la lámina ES la pieza.
 *  - `folio`: el "N.º 03" de la cabecera. Numera una secuencia; una sola lámina
 *    no es una secuencia.
 *  - `clase`: la clase CSS del formato que el marco agrega para que la dirección
 *    cuelgue de ella su layout vertical.
 */
export const MEDIDA = {
  carrusel: {
    ancho: 1080, alto: 1350, margenPx: 96, minLaminas: 5, maxLaminas: 8,
    tienePortada: true, folio: true, clase: null,
  },
  story: {
    ancho: 1080, alto: 1920, margenPx: 96, minLaminas: 1, maxLaminas: 3,
    tienePortada: false, folio: false, clase: 's9',
  },
}

/** Zona que la interfaz de Instagram tapa en un story o un reel (guía, sección 5). */
export const ZONA_SEGURA_STORY = { arribaPx: 250, abajoPx: 340 }

/**
 * La zona segura en % del alto, que es como la escribe el CSS. Derivarla acá y
 * no copiar los porcentajes en cada dirección es lo que hace que mover la
 * medida de arriba mueva de verdad el layout.
 */
export function zonaSeguraStoryPct() {
  const { alto } = MEDIDA.story
  return {
    arriba: Number(((ZONA_SEGURA_STORY.arribaPx / alto) * 100).toFixed(2)),
    abajo: Number(((ZONA_SEGURA_STORY.abajoPx / alto) * 100).toFixed(2)),
  }
}

/**
 * Formatos con layout de verdad. En 9:16 no todas las plantillas sirven: cada
 * dirección declara cuáles tiene resueltas en `plantillasPorFormato`, y la
 * validación rechaza el resto en vez de dejar un camino que parece aceptado y
 * sale con todo apretado arriba y media lámina vacía.
 */
export const FORMATOS_LISTOS = ['carrusel', 'story']

/**
 * Dónde se sube cada formato en Instagram.
 *
 * El `formato` de una pieza es la MEDIDA del lienzo, no el destino, y los dos
 * se llaman parecido. Un `story` con escena es un REEL: va al feed y queda.
 * Un `story` sin escena es una HISTORIA: desaparece en 24 h. El SUBIR.md
 * decía "story" para los dos, y subir el reel del lanzamiento como historia
 * lo borra al día siguiente —sin error, sin aviso y sin forma de recuperar
 * las vistas—.
 */
const DESTINO_INSTAGRAM = { carrusel: 'carrusel del feed', story: 'historia' }

/** El destino de UNA pieza: manda la escena (un MP4 es un reel), después el formato. */
export function destinoInstagram(pieza) {
  if (pieza?.escena != null) return 'reel'
  const destino = DESTINO_INSTAGRAM[pieza?.formato]
  // Un formato nuevo sin destino no puede caer en el default de otro: el
  // operador leería "historia" y subiría un carrusel como historia.
  if (!destino)
    throw new Error(
      `Formato sin destino en Instagram: "${pieza?.formato}". Hay: ${Object.keys(DESTINO_INSTAGRAM).join(', ')}`,
    )
  return destino
}

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

/**
 * El tope duro del caption completo: Instagram no acepta más y corta al pegar.
 * `TOPE_GANCHO_CAPTION` es el otro extremo: lo que se lee sin desplegar.
 */
export const TOPE_CAPTION = 2200

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
 * Las caras que de verdad le pedimos a Google, parseadas del spec:
 * 'Barlow+Condensed:ital,wght@0,600;0,800;1,800' → 600 normal, 800 normal y
 * 800 itálica. El render las necesita para distinguir una cara cargada de una
 * SINTETIZADA: si solo se compara la familia, un faux-bold pasa como si fuera
 * la marca.
 *
 * El eje `ital` se parsea aunque parezca detalle: 'Spectral:ital,wght@1,300'
 * existe SOLO en itálica. Pidiéndola en normal, la cara nunca queda `loaded` y
 * el control fallaba en falso contra una fuente perfectamente cargada.
 */
export function familiasConPesos() {
  return FAMILIAS_GOOGLE.map(carasDeSpec)
}

/**
 * Las caras que un spec de Google pide, parseando el eje `ital`.
 *
 * Está exportada para poder probar el camino de error: la lista de arriba es una
 * constante, así que sin esto el `throw` no se podía ejercitar desde un test y
 * quedaba como código que nadie verifica.
 */
export function carasDeSpec(spec) {
  const [nombre, ejes] = spec.split(':')
  const familia = nombre.replace(/\+/g, ' ')
  // Una familia pedida sin eje de peso la sirve Google en 400: no es un
  // supuesto nuestro, es lo que llega.
  const normal = (peso) => ({ familia, caras: [{ peso, italica: false }] })
  if (!ejes) return normal(400)

  const [nombresEje, valores] = ejes.split('@')
  const columnas = nombresEje.split(',')
  const iPeso = columnas.indexOf('wght')
  if (iPeso < 0) return normal(400)
  const iItal = columnas.indexOf('ital')

  const vistas = new Map()
  for (const tupla of String(valores ?? '').split(';')) {
    const campos = tupla.split(',')
    const peso = Number(campos[iPeso])
    // El rango tiene que ir: `Number('')` es 0 y `isFinite(0)` es true, así que
    // un spec truncado ('Figtree:wght@') producía una cara de peso 0 —
    // inexistente en CSS— y el control la daba por verificada.
    if (!Number.isFinite(peso) || peso < 1 || peso > 1000) continue
    const italica = iItal >= 0 && campos[iItal] === '1'
    vistas.set(`${peso}|${italica}`, { peso, italica })
  }
  const caras = [...vistas.values()].sort((a, b) => a.peso - b.peso || a.italica - b.italica)
  // Un spec CON eje wght del que no sale ningún peso legible es un error de
  // configuración, y caer al 400 lo tapaba: el control de fuentes "verificaba"
  // un peso que nadie pidió y dejaba de mirar los reales. Pasa con la forma
  // estándar de Google para variables ('Figtree:wght@300..800' → NaN), que es
  // justo la que alguien va a copiar y pegar del sitio.
  if (!caras.length)
    throw new Error(
      `FAMILIAS_GOOGLE: de "${spec}" no sale ningún peso legible. Si es una fuente ` +
        'variable, enumera los pesos discretos que usa el CSS (wght@400;700): el ' +
        'control de fuentes verifica cara por cara y no puede probar un rango.',
    )
  return { familia, caras }
}

export const URL_FUENTES =
  `https://fonts.googleapis.com/css2?${FAMILIAS_GOOGLE.map((f) => `family=${f}`).join('&')}&display=swap`

/**
 * Texto invisible fuera del marco: obliga al navegador a bajar cada familia en
 * cada peso que declaramos, incluso los que una lámina usa poco. Se piden los
 * pesos REALES del spec: pedir un 400 que no existe hace que el navegador
 * sintetice una cara y ensucia la medición de `exigirFuentes()`.
 *
 * Vive con las fuentes y no dentro del render porque la necesita cualquiera que
 * dibuje con la tipografía de la marca: las láminas y también las bandas de
 * subtítulo de un reel.
 */
export function sondaDeFuentes(familias) {
  const spans = familiasConPesos()
    .filter((f) => familias.includes(f.familia))
    .flatMap(({ familia, caras }) =>
      caras.map(
        ({ peso, italica }) =>
          `<span style="font-family:'${familia}';font-weight:${peso};` +
          `font-style:${italica ? 'italic' : 'normal'}">0</span>`,
      ),
    )
    .join('')
  return `<div style="position:fixed;top:0;left:0;opacity:0;pointer-events:none">${spans}</div>`
}

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

/**
 * Huella de lo que de una pieza termina en los píxeles.
 *
 * `render.mjs` la escribe junto a los PNG y `publicar.mjs` la recalcula antes de
 * empaquetar: si no coinciden, la pieza se editó después de renderizarse y lo que
 * hay en disco es la versión vieja. Pasa en el ciclo normal —se corrige una cifra
 * de una tabla en la revisión y nadie se acuerda de volver a renderizar— y sin
 * este control se publica la lámina anterior sin un solo aviso.
 *
 * Los campos son exactamente los que lee el render: `laminas` (el contenido),
 * `rotulo` (va impreso en cada lámina), `direccion` (la dirección visual) y
 * `formato` (decide el tamaño del lienzo). `caption`, `hashtags` y `proposito` NO
 * entran a propósito: no se dibujan, y meterlos obligaría a volver a renderizar
 * seis láminas por arreglar una coma del texto de Instagram.
 *
 * Vive acá, en la marca, porque la pregunta que contesta —qué de una pieza es
 * visual— es de la marca, y porque publicar.mjs necesita calcularla sin arrastrar
 * Playwright, que es lo que importar render.mjs significaría.
 *
 * Lo que NO cubre, y conviene saberlo antes de confiar de más en ella: sella los
 * CAMPOS de la pieza, no los píxeles. Si entre la aprobación y el empaquetado
 * cambia una plantilla o el CSS y alguien vuelve a renderizar, los PNG en disco
 * son otros y esta huella no se mueve. Cerrarlo pide sellar los bytes de los
 * archivos que se le mostraron —el paso siguiente de este portón—; mientras no
 * exista, el ciclo normal (renderizar, mandar a aprobar, empaquetar) sí queda
 * cubierto, porque ahí lo único que cambia es la pieza.
 */
export function huellaVisual(pieza) {
  const visual = {
    formato: pieza.formato ?? null,
    direccion: pieza.direccion ?? null,
    rotulo: pieza.rotulo ?? null,
    laminas: pieza.laminas ?? [],
  }
  return createHash('sha256').update(JSON.stringify(visual)).digest('hex').slice(0, 16)
}

/**
 * La huella del TEXTO de una pieza: el caption y los hashtags, que es lo que se
 * pega en Instagram.
 *
 * Es la hermana de `huellaVisual` y existe por el mismo motivo, pero del otro
 * lado de la línea. La aprobación le muestra a Juanjo el caption completo y los
 * hashtags; el empaquetador vuelve a leer el JSON de la pieza desde disco. Entre
 * las dos cosas pueden pasar días. Sin sellar el texto aprobado, se corrige "una
 * coma" el miércoles y el paquete sale con el caption nuevo bajo un `SUBIR.md`
 * que dice "Aprobada por Juanjo": nadie miente y nadie se entera.
 *
 * Esto NO obliga a renderizar de nuevo —el texto no se dibuja—, solo a pedir la
 * aprobación otra vez, que es exactamente lo que corresponde cuando cambia lo
 * que se va a publicar.
 */
export function huellaTexto(pieza) {
  const texto = {
    caption: pieza.caption ?? null,
    hashtags: pieza.hashtags ?? [],
  }
  return createHash('sha256').update(JSON.stringify(texto)).digest('hex').slice(0, 16)
}

/**
 * La huella de lo que el revisor tuvo delante: el texto y la parte visual de cada
 * pieza de la tanda, en su orden, más los fotogramas del reel si lo hay.
 *
 * El veredicto de un revisor es un archivo de texto, y un archivo de texto no sabe
 * de qué pieza habla. Sin esta huella el camino que se cuela no necesita mala fe:
 * Juanjo pide un cambio, se corrige el caption, y el mismo archivo del PUBLICAR de
 * ayer alcanza para mandar la tanda de hoy. Nadie mintió y nadie revisó lo que salió.
 *
 * Incluye los fotogramas y la huella de la escena porque es ahí donde un reel cambia
 * sin que cambie el JSON de la pieza: tocar la escena —un golpe, el gesto, los tiempos—
 * mueve la huella y obliga a revisar de nuevo.
 *
 * Lo que NO sella son los píxeles: ni los de las láminas (igual que `huellaVisual`) ni
 * los de los jpg de la toma. Volver a capturar la MISMA escena reproduce `frames.json`
 * idéntico —los `ms` y las notas salen del guion y los archivos se nombran por orden—,
 * así que la huella no se mueve, y es correcto: es la misma toma otra vez. Lo que puede
 * cambiar sin que la huella lo note es lo que se ve dentro de un cuadro por una razón
 * ajena a la escena (la app cambió de aspecto). Eso lo caza el revisor mirando los jpg,
 * que por eso van listados en el expediente.
 */
export function huellaDeLoRevisado(items) {
  const sello = items.map((it) => ({
    rol: it.rol ?? null,
    slug: it.pieza?.slug ?? null,
    texto: huellaTexto(it.pieza ?? {}),
    visual: huellaVisual(it.pieza ?? {}),
    frames: (it.frames ?? []).map((f) => [f.archivo, f.ms, f.nota ?? ''].join(':')),
    // El guion de la toma, no sus cuadros: los `ms` y las notas de `frames` salen de
    // acá, así que una escena corregida y no recapturada deja `frames` igual. Sin este
    // campo, cambiar el gesto de la escena no movía la huella y el PUBLICAR de la toma
    // anterior seguía valiendo.
    escena: it.escena ?? null,
  }))
  return createHash('sha256').update(JSON.stringify(sello)).digest('hex').slice(0, 12)
}
