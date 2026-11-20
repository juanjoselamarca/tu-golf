// Bandeja de referencias: Juanjo manda un link que le parece benchmark y acá
// queda una ficha de qué hace bien y cómo se adapta a Golfers+.
//
// Se replican como IDEA, nunca como copia (decisión del 26-oct): la ficha dice
// qué estructura usar, no qué plano imitar, y por eso incluye "qué NO copiar".
//
// El link NO se puede analizar desde la URL: Instagram está gateado y lo que
// devuelve un fetch es basura o el contenido equivocado. Se baja el video y se
// analiza el video. Esto ya se intentó por el camino corto y salió mal: de nueve
// links que parecían de golf, siete eran de otra cosa.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')
export const DIR_REFERENCIAS = path.join(AQUI, 'referencias')

/**
 * Dónde está yt-dlp. No se descarga solo a propósito: bajar y ejecutar un binario
 * sin que nadie lo pida es exactamente la clase de cosa que no debe pasar en
 * silencio. Si falta, el script dice el comando exacto y se corta.
 *
 * Mismo criterio que `binarioFfmpeg()` en montar.mjs.
 */
export function binarioYtDlp(env = process.env) {
  const candidatos = [
    env.RRSS_YTDLP_PATH,
    path.join(RAIZ, 'out', 'rrss', 'bin', 'yt-dlp.exe'),
    path.join(RAIZ, 'out', 'rrss', 'bin', 'yt-dlp'),
  ].filter(Boolean)
  for (const c of candidatos) if (existsSync(c)) return c
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['yt-dlp'], { stdio: 'pipe' })
    return 'yt-dlp'
  } catch {}
  throw new Error(
    'Falta yt-dlp y sin él no se puede analizar un reel (Instagram no se deja leer por URL).\n' +
      '   Bájalo una vez:\n' +
      '     mkdir -p out/rrss/bin && curl -L -o out/rrss/bin/yt-dlp.exe \\\n' +
      '       https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
  )
}

/** Un id estable para la referencia, sacado del link. Dos envíos del mismo link dan la misma ficha. */
export function idDeLink(url) {
  // youtube.com/watch?v=ID: el id del video va en el query, que abajo se descarta.
  // Sin este caso, todos los videos de YouTube compartían una sola ficha.
  try {
    const u = new URL(String(url))
    const v = u.searchParams.get('v')
    if (/(^|\.)youtube\.com$/i.test(u.hostname) && /^[A-Za-z0-9_-]+$/.test(v ?? '')) return `watch-${v}`
  } catch {}
  const m = String(url).match(/\/(reels?|p|tv|shorts|video)\/([A-Za-z0-9_-]+)/)
  if (m) return `${m[1] === 'reels' ? 'reel' : m[1]}-${m[2]}`
  // El query string de un link compartido es un token de rastreo distinto en cada
  // envío: si entra al id, el mismo reel mandado dos veces da dos fichas. Sin
  // minúsculas: los códigos de youtu.be y vt.tiktok.com distinguen mayúsculas.
  const limpio = String(url)
    .replace(/[?#].*$/, '')
    .replace(/^https?:\/\//, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!limpio) throw new Error(`No puedo sacar un id de "${url}".`)
  return limpio.slice(0, 60)
}

/**
 * Links a UNA pieza (reel, post, short, video), por host. Un perfil, una story o
 * la home no son referencias: si vienen en un mensaje, es otra cosa (p. ej. un
 * bug del botón compartir) y va al triage.
 */
const PIEZAS_REFERENCIA = [
  { host: /^(?:www\.|m\.)?instagram\.com$/i, ruta: /^\/(?:[^/]+\/)?(?:reels?|p|tv)\/[A-Za-z0-9_-]+/ },
  { host: /^(?:www\.|m\.)?tiktok\.com$/i, ruta: /^\/@[^/]+\/video\/\d+/ },
  { host: /^(?:vt|vm)\.tiktok\.com$/i, ruta: /^\/[A-Za-z0-9]+\/?$/ },
  { host: /^(?:www\.|m\.)?youtube\.com$/i, ruta: /^\/(?:shorts\/[A-Za-z0-9_-]+|watch$)/ },
  { host: /^youtu\.be$/i, ruta: /^\/[A-Za-z0-9_-]+\/?$/ },
]

/**
 * El link de referencia que trae un mensaje, o null. Juanjo manda las referencias
 * al bot del inbox (el bot RRSS aparte del diseño nunca se usó), así que el
 * inbox llega mezclado: bugs, fotos y links. Esto decide cuáles son links a una
 * pieza de redes, que es lo único que esta bandeja sabe bajar y analizar.
 */
export function linkDeReferencia(texto) {
  for (const candidato of String(texto ?? '').match(/https?:\/\/\S+/g) ?? []) {
    try {
      const u = new URL(candidato)
      const pieza = PIEZAS_REFERENCIA.some((p) => p.host.test(u.hostname) && p.ruta.test(u.pathname))
      const conVideo = !/^\/watch$/.test(u.pathname) || u.searchParams.get('v')
      if (pieza && conVideo) return candidato
    } catch {}
  }
  return null
}

export function rutaFicha(id) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error(`Id de referencia inseguro: "${id}".`)
  return path.join(DIR_REFERENCIAS, `${id}.json`)
}

/**
 * Por qué no se pudo bajar, en algo que se pueda decidir. El caso conocido: un post
 * de foto o carrusel (/p/). yt-dlp no entrega sus imágenes, solo el caption, y
 * analizar el caption solo haría que Gemini inventara el gancho. Se revisa a mano.
 */
export function motivoDeFalloDescarga(salida) {
  if (/No video formats found/i.test(salida))
    return 'Es un post de imagen, no un video: yt-dlp no baja sus fotos. Revísalo a mano (Chrome) y ciérralo en el inbox con lo que sea.'
  const linea = String(salida).split('\n').find((l) => /ERROR/.test(l))
  return `yt-dlp no pudo bajarlo: ${(linea ?? String(salida).trim().split('\n')[0] ?? '').slice(0, 300)}`
}

/** Baja el video y su caption a una carpeta temporal. Devuelve las rutas. */
export function bajar(url, { env = process.env } = {}) {
  const bin = binarioYtDlp(env)
  const dir = mkdtempSync(path.join(tmpdir(), 'rrss-ref-'))
  try {
    execFileSync(
      bin,
      [
        '-f',
        'mp4/best[ext=mp4]/best',
        '-o',
        path.join(dir, 'media.%(ext)s'),
        '--write-info-json',
        '--no-playlist',
        '--no-warnings',
        '--socket-timeout',
        '30',
        url,
      ],
      // Sin tope, un yt-dlp colgado bloquea la corrida entera de /inbox (y los fixes reales).
      { stdio: 'pipe', encoding: 'utf8', timeout: 180_000 },
    )
  } catch (e) {
    throw new Error(motivoDeFalloDescarga(`${e.stderr ?? ''}\n${e.message ?? ''}`))
  }
  const archivos = readdirSync(dir)
  const video = archivos.find((f) => f.endsWith('.mp4'))
  const info = archivos.find((f) => f.endsWith('.info.json'))
  return {
    dir,
    video: video ? path.join(dir, video) : null,
    caption: info ? (JSON.parse(readFileSync(path.join(dir, info), 'utf8')).description ?? '') : '',
  }
}

const PROMPT = `Analiza este video como director creativo de una marca de golf premium (Golfers+, app
chilena de torneos en vivo: anotar, leaderboard, neto con hándicap). Es una referencia que nos
mandaron, NO contenido nuestro.

Devuelve SOLO un JSON con estas claves:
{
  "formato": "qué tipo de pieza es, en 3-6 palabras",
  "gancho": "qué pasa exactamente en los primeros 3 segundos",
  "por_que_funciona": "el mecanismo, no el elogio: qué hace que alguien no haga scroll",
  "ritmo": "cuántos cortes, duración aproximada de cada plano, si hay voz o es muda",
  "estructura": ["paso 1 de la narrativa", "paso 2", "..."],
  "adaptacion_golfers": "cómo se usa esta ESTRUCTURA con lo que Golfers+ tiene (pantalla real de la app, torneos reales, datos propios). Concreto y producible sin salir a filmar si se puede.",
  "no_copiar": "qué de esta pieza NO se debe replicar (porque es del autor, porque exige medios que no tenemos, o porque no calza con la marca)",
  "es_de_golf": true o false,
  "resumen": "una frase"
}

Reglas: si el video no es de golf, dilo en es_de_golf y adapta igual (la estructura puede servir).
No inventes nada que no esté en el video. Español de Chile, sin voseo.`

function sinClave(texto, clave) {
  return clave ? String(texto ?? '').replaceAll(clave, '<GEMINI_API_KEY>') : String(texto ?? '')
}

export function mimeDeImagen(ruta) {
  const ext = path.extname(ruta).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  throw new Error(`Formato de imagen no soportado: ${ext || '(sin extensión)'}`)
}

/** Tope de cada llamada de red a Gemini: una llamada colgada no puede bloquear /inbox. */
const TOPE_RED_MS = 120_000

/**
 * Gemini acepta el video inline solo si la petición entera pesa menos de 20 MB, y
 * el base64 infla un tercio: un reel de 15 MB ya no entra. Sobre este umbral se
 * sube por la Files API, que es el camino documentado para archivos grandes.
 */
export const MAX_VIDEO_INLINE_BYTES = 12 * 1024 * 1024

async function parteDeVideo(video, clave) {
  const bytes = readFileSync(video)
  if (bytes.length <= MAX_VIDEO_INLINE_BYTES)
    return { inlineData: { mimeType: 'video/mp4', data: bytes.toString('base64') } }
  const base = 'https://generativelanguage.googleapis.com'
  const inicio = await fetch(`${base}/upload/v1beta/files?key=${clave}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': 'video/mp4',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: path.basename(video) } }),
    signal: AbortSignal.timeout(TOPE_RED_MS),
  })
  const destino = inicio.headers.get('x-goog-upload-url')
  if (!inicio.ok || !destino) throw new Error(`Files API no abrió la subida: HTTP ${inicio.status}`)
  const subida = await fetch(destino, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: bytes,
    signal: AbortSignal.timeout(TOPE_RED_MS),
  })
  if (!subida.ok) throw new Error(`Files API rechazó el video: HTTP ${subida.status}`)
  let archivo = (await subida.json()).file
  // El video queda PROCESSING unos segundos; analizarlo antes devuelve 400.
  for (let i = 0; i < 60 && archivo?.state === 'PROCESSING'; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    archivo = await (
      await fetch(`${base}/v1beta/${archivo.name}?key=${clave}`, { signal: AbortSignal.timeout(TOPE_RED_MS) })
    ).json()
  }
  if (archivo?.state !== 'ACTIVE')
    throw new Error(`Files API dejó el video en estado ${archivo?.state ?? 'desconocido'}`)
  return { fileData: { mimeType: 'video/mp4', fileUri: archivo.uri } }
}

/** Analiza el video con Gemini. Entiende audio e imagen, que es justo lo que hay que juzgar acá. */
export async function analizar({ video, imagen, caption }, { env = process.env } = {}) {
  const clave = env.GEMINI_API_KEY?.trim()
  if (!clave) throw new Error('Falta GEMINI_API_KEY (está en .env.local; corre con node --env-file=.env.local).')
  const partes = []
  if (video) partes.push(await parteDeVideo(video, clave))
  if (imagen)
    partes.push({ inlineData: { mimeType: mimeDeImagen(imagen), data: readFileSync(imagen).toString('base64') } })
  if (!partes.length && !caption?.trim())
    throw new Error('La referencia no tiene ni video, ni imagen, ni caption: no hay nada que analizar.')
  partes.push({ text: caption?.trim() ? `${PROMPT}\n\nCaption del post:\n"${caption}"` : PROMPT })

  const cuerpo = {
    contents: [{ parts: partes }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  }
  const fallos = []
  for (const modelo of ['gemini-3.6-flash', 'gemini-2.5-flash']) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${clave}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(TOPE_RED_MS),
        },
      )
      if (!res.ok) {
        fallos.push(`${modelo}: HTTP ${res.status} ${sinClave((await res.text()).slice(0, 200), clave)}`)
        continue
      }
      const datos = await res.json()
      const texto = datos?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!texto) {
        fallos.push(`${modelo}: respuesta vacía`)
        continue
      }
      // Los modelos chicos envuelven el JSON en un bloque de código aunque se les
      // pida responseMimeType JSON.
      return validarAnalisis(JSON.parse(texto.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')))
    } catch (e) {
      fallos.push(`${modelo}: ${sinClave(e.message, clave)}`)
    }
  }
  throw new Error(`Gemini no pudo analizar la referencia:\n   · ${fallos.join('\n   · ')}`)
}

/** Baja, analiza y deja la ficha. Si la ficha ya existe no se vuelve a gastar en Gemini. */
export async function ingerir(
  url,
  { env = process.env, cuando = new Date(), rehacer = false, nota = '', origen = null } = {},
) {
  const id = idDeLink(url)
  const ruta = rutaFicha(id)
  if (existsSync(ruta) && !rehacer) return { id, ruta, ficha: JSON.parse(readFileSync(ruta, 'utf8')), reusada: true }
  const descarga = bajar(url, { env })
  const analisis = await analizar(descarga, { env })
  const ficha = guardarFicha({ id, url, cuando, caption: descarga.caption, analisis, nota, origen })
  return { id, ruta, ficha, reusada: false }
}

/**
 * Una referencia que llegó como foto (un pantallazo de la competencia, un post
 * que Juanjo fotografió). No hay link que bajar: se analiza la imagen tal cual.
 */
export async function ingerirImagen(
  imagen,
  { id, env = process.env, cuando = new Date(), rehacer = false, nota = '', origen = null } = {},
) {
  if (!id) throw new Error('Una referencia de imagen necesita un id explícito (no hay link del que sacarlo).')
  const ruta = rutaFicha(id)
  if (existsSync(ruta) && !rehacer) return { id, ruta, ficha: JSON.parse(readFileSync(ruta, 'utf8')), reusada: true }
  const analisis = await analizar({ imagen, caption: nota }, { env })
  const ficha = guardarFicha({ id, url: null, cuando, caption: '', analisis, nota, origen })
  return { id, ruta, ficha, reusada: false }
}

/**
 * Lo mínimo que /rrss necesita de una ficha. Si Gemini devuelve otra cosa, se
 * corta acá y el reporte queda pendiente, en vez de cerrarse con una ficha vacía.
 */
export function validarAnalisis(analisis) {
  const faltan = ['formato', 'gancho', 'adaptacion_golfers', 'no_copiar'].filter(
    (k) => typeof analisis?.[k] !== 'string' || !analisis[k].trim(),
  )
  if (faltan.length) throw new Error(`El análisis de Gemini vino sin: ${faltan.join(', ')}`)
  return analisis
}

function guardarFicha({ id, url, cuando, caption, analisis, nota, origen }) {
  const ficha = {
    // El análisis va primero: si Gemini devolviera un id o una url, no pisa los nuestros.
    ...analisis,
    id,
    url,
    recibida: cuando.toISOString(),
    caption,
    // Lo que Juanjo escribió junto al link: suele ser el porqué de la referencia
    // ("esto pero más pro y menos IA"), y es lo primero que tiene que leer /rrss.
    nota_juanjo: String(nota ?? '').trim(),
    origen, // p. ej. "inbox:<uuid>": de dónde llegó
    usada_en: [], // tandas que se inspiraron en esta referencia
  }
  mkdirSync(DIR_REFERENCIAS, { recursive: true })
  writeFileSync(rutaFicha(id), `${JSON.stringify(ficha, null, 2)}\n`)
  return ficha
}

export function listarReferencias() {
  if (!existsSync(DIR_REFERENCIAS)) return []
  return readdirSync(DIR_REFERENCIAS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(DIR_REFERENCIAS, f), 'utf8')))
    .sort((a, b) => (a.recibida < b.recibida ? 1 : -1))
}

/**
 * Lo único que `/rrss` lee de la bandeja: las referencias que todavía no se
 * usaron, en una línea cada una.
 *
 * Es compacto a propósito. El costo del sistema no está en la cantidad de piezas
 * sino en "ponerse al día": si `/rrss` leyera las fichas completas, una semana con
 * diez referencias se come el contexto antes de escribir la primera idea.
 */
export function sinUsar() {
  return listarReferencias()
    .filter((r) => !r.usada_en?.length)
    .map((r) => ({
      id: r.id,
      nota_juanjo: r.nota_juanjo || undefined,
      es_de_golf: r.es_de_golf,
      formato: r.formato,
      gancho: r.gancho,
      adaptacion: r.adaptacion_golfers,
      no_copiar: r.no_copiar,
    }))
}

/** Marca una referencia como usada por una tanda, para que no vuelva a proponerse. */
export function marcarUsada(id, slugTanda) {
  const ruta = rutaFicha(id)
  if (!existsSync(ruta)) throw new Error(`No existe la referencia ${id}.`)
  const ficha = JSON.parse(readFileSync(ruta, 'utf8'))
  if (!ficha.usada_en.includes(slugTanda)) ficha.usada_en.push(slugTanda)
  writeFileSync(ruta, `${JSON.stringify(ficha, null, 2)}\n`)
  return ficha
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--listar') {
    const pendientes = sinUsar()
    console.log(`${listarReferencias().length} referencias · ${pendientes.length} sin usar`)
    pendientes.forEach((r) => {
      console.log(`   ${r.id}${r.es_de_golf === false ? ' [NO es de golf]' : ''} · ${r.formato} · ${r.gancho}`)
      if (r.nota_juanjo) console.log(`      Juanjo: "${r.nota_juanjo}"`)
    })
    return
  }
  const url = args.find((a) => a.startsWith('http'))
  if (!url) {
    console.error('Uso: node --env-file=.env.local scripts/rrss/referencias.mjs <url> [--rehacer]')
    console.error('     node scripts/rrss/referencias.mjs --listar')
    process.exit(1)
  }
  const { id, ficha, reusada } = await ingerir(url, { rehacer: args.includes('--rehacer') })
  console.log(`${reusada ? '↩︎ ya estaba' : '✅ ficha nueva'}: ${id}`)
  console.log(`   formato: ${ficha.formato}`)
  console.log(`   gancho: ${ficha.gancho}`)
  console.log(`   de golf: ${ficha.es_de_golf ? 'sí' : 'NO — verificar antes de usarla'}`)
  console.log(`   adaptación: ${ficha.adaptacion_golfers}`)
  console.log(`   no copiar: ${ficha.no_copiar}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
