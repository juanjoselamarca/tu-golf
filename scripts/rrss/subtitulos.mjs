// Subtítulos quemados de un reel.
//
// El plan de lanzamiento los pide como regla dura: «Subtítulos siempre, en
// español chileno, sin voseo» (`docs/rrss/plan-lanzamiento.md`, sección 5). Y no
// es una formalidad: los reels del feed arrancan MUDOS, y una pieza que explica
// lo que se ve solo en la lámina de cierre se mira 25 segundos sin saber qué
// está mirando. Las tres piezas del lanzamiento se grabaron sin una sola línea
// en pantalla; esto es lo que faltaba para poder publicarlas.
//
// Cómo se declaran: en la escena, por NOTA de fotograma.
//
//   subtitulos: [
//     { nota: 'plantillas',   texto: 'Eliges el formato.' },
//     { nota: 'escribe-nombre', texto: 'Le pones nombre y fecha.' },
//     { nota: 'cierre',       texto: null },   // la lámina ya trae su titular
//   ]
//
// La nota es el ancla: el guion ya rotula cada fotograma con el momento que
// muestra, así que el subtítulo queda pegado a lo que pasa en pantalla y no a un
// milisegundo que se corre entero si mañana la toma tarda otro poco. Cada línea
// vive desde su nota hasta la siguiente entrada; `texto: null` la apaga.
//
// Viven en la escena —y no en el JSON de la pieza— porque son parte de lo que
// los fotogramas MUESTRAN: así entran a `huellaEscena()` y corregir un subtítulo
// obliga a volver a montar y a volver a revisar, igual que corregir un golpe.
import { ZONA_SEGURA_STORY, COLOR, MEDIDA, URL_FUENTES, escapar, sondaDeFuentes } from './marca.mjs'
import { spawnSync } from 'node:child_process'
import { buscarVoseo } from '../lib/voseo.mjs'

/**
 * Caracteres por segundo que se leen cómodos en un subtítulo. 15 es el piso de
 * la práctica de la industria (Netflix usa 17 para adultos): por debajo de eso
 * la línea se lee entera sin esfuerzo mientras además se mira la pantalla, que
 * es lo que acá importa — el subtítulo no es el contenido, es el apoyo.
 */
export const CPS_LECTURA = 15

/** Ninguna línea baja de esto, por corta que sea: un flash no se lee. */
export const MINIMO_SEGUNDOS = 1.0

/**
 * Tope de caracteres por línea. Dos líneas de ~40 es lo que entra en 1080 px con
 * el cuerpo de la marca sin quedar como un párrafo. Más que eso no es un
 * subtítulo, es un texto, y en un reel no se lee.
 */
export const TOPE_CARACTERES = 80

/**
 * Los tramos de subtítulo de una toma: `{ texto, desde, hasta }` en segundos.
 *
 * Es función pura sobre `frames.json` y la escena, así que el test puede afirmar
 * que cada línea alcanza a leerse SIN montar un video.
 *
 * Lo que revienta acá, por orden de cuánto duele que se cuele:
 *  - una nota que no existe en la toma → la línea no se ve nunca y el reel sale
 *    mudo igual, que es exactamente el error que este archivo viene a cerrar;
 *  - un tramo más corto que lo que su texto tarda en leerse;
 *  - voseo (la regla dura del plan es español de Chile);
 *  - una línea más larga que `TOPE_CARACTERES`.
 */
export function tramosDeSubtitulos(frames, guion) {
  if (!guion?.length) throw new Error('la escena no declara subtítulos')

  // Cuándo aparece cada nota por primera vez, y cuánto dura la toma.
  const primeraVez = new Map()
  let t = 0
  for (const f of frames) {
    if (!primeraVez.has(f.nota)) primeraVez.set(f.nota, t)
    t += f.ms
  }
  const total = t / 1000

  const faltan = guion.filter((e) => !primeraVez.has(e.nota)).map((e) => e.nota)
  if (faltan.length)
    throw new Error(
      `la escena ancla subtítulos en notas que la toma no tiene: ${faltan.join(', ')}. ` +
        `Hay: ${[...primeraVez.keys()].join(', ')}`,
    )

  const marcas = guion
    .map((e) => ({ ...e, desde: primeraVez.get(e.nota) / 1000 }))
    .sort((a, b) => a.desde - b.desde)

  const tramos = []
  for (const [i, m] of marcas.entries()) {
    const hasta = marcas[i + 1]?.desde ?? total
    if (m.texto === null || m.texto === undefined) continue
    const texto = String(m.texto).trim()
    if (!texto) throw new Error(`el subtítulo de "${m.nota}" está vacío (usa null para apagarlo)`)
    if (texto.length > TOPE_CARACTERES)
      throw new Error(
        `el subtítulo de "${m.nota}" tiene ${texto.length} caracteres y el tope es ` +
          `${TOPE_CARACTERES}: "${texto}"`,
      )
    const voseo = buscarVoseo(texto)
    if (voseo.length)
      throw new Error(
        `el subtítulo de "${m.nota}" tiene voseo (${voseo.join(', ')}); el copy va en ` +
          `español de Chile: "${texto}"`,
      )
    const dura = hasta - m.desde
    const necesita = Math.max(MINIMO_SEGUNDOS, texto.length / CPS_LECTURA)
    if (dura + 1e-9 < necesita)
      throw new Error(
        `el subtítulo de "${m.nota}" dura ${dura.toFixed(2)} s y necesita ${necesita.toFixed(2)} s ` +
          `para leerse (${texto.length} caracteres a ${CPS_LECTURA}/s): "${texto}". ` +
          'Acorta la línea o ánclala en una nota anterior.',
      )
    tramos.push({ texto, nota: m.nota, desde: Number(m.desde.toFixed(3)), hasta: Number(hasta.toFixed(3)) })
  }
  if (!tramos.length) throw new Error('la escena declara subtítulos pero ninguno se muestra')
  return tramos
}

/**
 * El grosor de la regla dorada que corona la banda, en píxeles.
 *
 * Vive con nombre porque no es solo decoración: es parte de la firma que
 * `exigirSubtitulosEnPantalla()` compara contra el video ya montado.
 */
export const GROSOR_REGLA_PX = 4

/**
 * El HTML de una lámina de subtítulo: el lienzo entero, transparente, con la
 * banda abajo.
 *
 * Se dibuja del tamaño del reel completo para que el overlay de ffmpeg vaya en
 * 0:0 y la posición viva en UN solo lugar (este CSS), no repartida entre el CSS
 * y una cuenta de coordenadas en el filtro.
 *
 * La banda se apoya en el borde de arriba de la franja que la interfaz de
 * Instagram tapa (`ZONA_SEGURA_STORY.abajoPx`), con aire: un subtítulo debajo
 * del caption no existe.
 *
 * Va de borde a borde y OPACA. Las dos cosas se decidieron mirando la pieza 1
 * montada: una caja flotante con 10 % de transparencia dejaba leer el nombre y
 * el score que había debajo, y un texto fantasma cruzando el subtítulo no se
 * lee como una decisión de diseño, se lee como un error de render. De borde a
 * borde además es el gesto de la marca —la lámina de cierre abre con una regla
 * de ancho completo— y es lo que hace que se lea como un rótulo de transmisión
 * y no como un sticker pegado encima. El texto conserva el margen del 7 %.
 */
export function documentoDeBanda(texto, { ancho = MEDIDA.story.ancho, alto = MEDIDA.story.alto } = {}) {
  const margen = Math.round(ancho * 0.07) // el mismo 7 % que el resto de la marca
  const abajo = ZONA_SEGURA_STORY.abajoPx + Math.round(alto * 0.015)
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${URL_FUENTES}">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
body{width:${ancho}px;height:${alto}px;position:relative}
.sub{position:absolute;left:0;right:0;bottom:${abajo}px;
  background:${COLOR.navy};border-top:${GROSOR_REGLA_PX}px solid ${COLOR.gold};
  padding:26px ${margen}px 30px;
  font:700 50px/1.22 "Inter Tight",sans-serif;letter-spacing:-.02em;color:${COLOR.bone};
  text-wrap:balance}
</style></head><body>${sondaDeFuentes(FAMILIAS_BANDA)}<div class="sub">${escapar(texto)}</div></body></html>`
}

/**
 * La familia que usa la banda: Inter Tight, la misma de la dirección
 * Businessweek con la que se renderizan las láminas de cierre. El subtítulo y el
 * remate del reel tienen que ser la misma voz.
 *
 * La hoja de estilos es `URL_FUENTES` entera y la sonda la de la marca a
 * propósito: `exigirFuentes()` verifica TODAS las caras que el catálogo declara
 * de la familia (Inter Tight 500, 700 y 800), no solo la que usa este CSS.
 * Pedirle a Google únicamente el 700 hacía fallar el control, y con razón: así
 * es como se cuela un faux-bold.
 */
const FAMILIAS_BANDA = ['Inter Tight']

/**
 * Dibuja una lámina PNG transparente por tramo y devuelve sus rutas, en el
 * mismo orden que los tramos.
 *
 * Playwright y no `sharp`: `sharp` no es dependencia del proyecto, y el texto
 * tiene que salir en la tipografía de la marca. Un SVG renderizado por una
 * librería de imágenes depende de las fuentes instaladas en la máquina y cae a
 * Arial sin avisar; acá se exige la cara cargada con el MISMO control que usa
 * `render.mjs` para las láminas.
 */
export async function laminasDeSubtitulos(tramos, dir, medida = MEDIDA.story) {
  const { chromium } = await import('playwright')
  const { exigirFuentes } = await import('./render.mjs')
  const { mkdir } = await import('node:fs/promises')
  const path = (await import('node:path')).default

  await mkdir(dir, { recursive: true })
  const navegador = await chromium.launch()
  try {
    const page = await navegador.newPage({
      viewport: { width: medida.ancho, height: medida.alto },
      deviceScaleFactor: 1,
    })
    const rutas = []
    for (const [i, tramo] of tramos.entries()) {
      await page.setContent(documentoDeBanda(tramo.texto, medida), { waitUntil: 'networkidle' })
      await exigirFuentes(page, FAMILIAS_BANDA)
      const archivo = path.join(dir, `sub-${String(i + 1).padStart(2, '0')}.png`)
      await page.screenshot({ path: archivo, omitBackground: true })
      rutas.push(archivo)
    }
    return rutas
  } finally {
    await navegador.close()
  }
}

/**
 * La cadena de `-filter_complex` que quema los tramos sobre el video.
 *
 * Cada banda entra como un input más (el 0 es la lista de fotogramas y el 1 el
 * silencio), y se superpone con `enable='between(t,desde,hasta)'`. Un PNG es un
 * fotograma único y el `eof_action` por defecto de `overlay` es `repeat`, así
 * que la banda se sostiene todo su tramo sin necesidad de `-loop`.
 *
 * El `format=yuv420p` queda al FINAL: hacerlo antes del overlay le saca el canal
 * alfa a la base y la banda se pega con los bordes duros.
 */
export function filtroDeSubtitulos(tramos, { ancho, alto, fps }, primerInput = 2) {
  const pasos = [`[0:v]scale=${ancho}:${alto}:flags=lanczos,fps=${fps}[b0]`]
  tramos.forEach((t, i) => {
    const entra = `[b${i}][${primerInput + i}:v]`
    const entre = `between(t,${t.desde.toFixed(3)},${t.hasta.toFixed(3)})`
    pasos.push(`${entra}overlay=0:0:enable='${entre}'[b${i + 1}]`)
  })
  pasos.push(`[b${tramos.length}]format=yuv420p[v]`)
  return pasos.join(';')
}

/**
 * Lo que mide `exigirSubtitulosEnPantalla()`: la banda, reducida a una miniatura
 * de 32x8 en RGB.
 *
 * Reducirla es lo que hace comparable un PNG contra un fotograma que pasó por
 * JPEG y por H.264: el ruido de compresión se promedia y lo que queda es la
 * silueta —el bloque navy, la regla dorada arriba y la mancha del texto—. Una
 * banda que no se dibujó, que se dibujó en otra parte o que es la de OTRO tramo
 * no sobrevive esta comparación; un reencode sí.
 */
export const MUESTRA_BANDA = { ancho: 32, alto: 8 }

/**
 * Cuánto puede diferir esa miniatura, en promedio por canal (0-255), antes de
 * ser un error. 18 deja pasar el reencode con holgura y no deja pasar un tramo
 * cambiado: dos subtítulos distintos difieren en decenas.
 */
export const DIFERENCIA_MAXIMA = 18

function crudo(bin, args) {
  const r = spawnSync(bin, args, { maxBuffer: 256 * 1024 * 1024 })
  if (r.status !== 0)
    throw new Error(`ffmpeg falló (${r.status}):\n${String(r.stderr ?? '').split('\n').slice(-8).join('\n')}`)
  return r.stdout
}

/**
 * La caja que ocupa la banda dentro del lienzo, leída del PNG y no calculada
 * otra vez: es el CSS el que decide dónde queda y cuánto mide (una línea o dos),
 * así que preguntárselo al píxel es la única manera de que el control siga
 * valiendo cuando alguien cambie el cuerpo o el padding.
 */
export function cajaDeLaBanda(rutaBanda, bin, medida = MEDIDA.story) {
  // Una columna del borde izquierdo: la banda va a sangre, así que ahí no hay
  // texto y el alfa dice exactamente dónde empieza y dónde termina.
  const columna = crudo(bin, [
    '-v', 'error', '-i', rutaBanda,
    '-vf', `crop=1:${medida.alto}:4:0`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
  ])
  let arriba = -1
  let abajo = -1
  for (let y = 0; y < medida.alto; y++) {
    if (columna[y * 4 + 3] >= 250) {
      if (arriba < 0) arriba = y
      abajo = y
    }
  }
  if (arriba < 0) throw new Error(`la banda ${rutaBanda} salió transparente entera: no hay nada que quemar`)
  return { y: arriba, alto: abajo - arriba + 1 }
}

function miniatura(bin, entrada, caja, medida, filtroPrevio = '') {
  const { ancho: w, alto: h } = MUESTRA_BANDA
  const vf =
    `${filtroPrevio}crop=${medida.ancho}:${caja.alto}:0:${caja.y},scale=${w}:${h}:flags=area,format=rgb24`
  return crudo(bin, [
    '-v', 'error', '-i', entrada,
    '-vf', vf,
    '-frames:v', '1',
    '-fps_mode', 'passthrough',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ])
}

/** Diferencia media por canal entre dos miniaturas del mismo tamaño. */
export function diferenciaMedia(a, b) {
  if (a.length !== b.length || !a.length)
    throw new Error(`miniaturas de distinto tamaño: ${a.length} vs ${b.length}`)
  let suma = 0
  for (let i = 0; i < a.length; i++) suma += Math.abs(a[i] - b[i])
  return suma / a.length
}

/**
 * Abre el video YA MONTADO y exige que cada subtítulo esté de verdad en la
 * imagen, en el momento que declara.
 *
 * Por qué existe: el 29-oct la pieza 1 salió con el último subtítulo —«Y pasas
 * a liderar.»— sin dibujar, y todo lo demás decía que estaba bien. El filtro
 * era correcto, `video.json` listaba los cinco tramos, la duración calzaba al
 * centésimo y el MP4 se reproducía. Lo que fallaba era el MONTAJE: ffmpeg
 * rearmaba el filtergraph a mitad del video y los fotogramas de ese tramo no
 * llegaban a existir (ver `exigirUnSoloPixFmt` en montar.mjs). Ningún control
 * que mire el plan en vez de la imagen puede cazar eso. Este mira la imagen.
 */
export function exigirSubtitulosEnPantalla(video, tramos, bandas, bin, medida = MEDIDA.story) {
  const malos = []
  for (const [i, tramo] of tramos.entries()) {
    const caja = cajaDeLaBanda(bandas[i], bin, medida)
    const esperada = miniatura(bin, bandas[i], caja, medida)
    // El medio del tramo: los bordes caen justo donde el fotograma cambia y un
    // medio fotograma de desfase no es un error que haya que reportar.
    const momento = (tramo.desde + tramo.hasta) / 2
    const vista = miniatura(bin, video, caja, medida, `select='gte(t\,${momento.toFixed(3)})',`)
    const dif = diferenciaMedia(esperada, vista)
    if (dif > DIFERENCIA_MAXIMA)
      malos.push(
        `· "${tramo.texto}" (${tramo.desde.toFixed(2)}–${tramo.hasta.toFixed(2)} s, nota "${tramo.nota}"): ` +
          `a los ${momento.toFixed(2)} s la banda difiere en ${dif.toFixed(1)} (tope ${DIFERENCIA_MAXIMA})`,
      )
  }
  if (malos.length)
    throw new Error(
      `${video} no muestra los subtítulos que declara:\n${malos.join('\n')}\n` +
        'El video se montó igual pero NO se puede publicar: en el feed los reels se miran sin sonido.',
    )
}
