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
      '   Bajalo una vez:\n' +
      '     mkdir -p out/rrss/bin && curl -L -o out/rrss/bin/yt-dlp.exe \\\n' +
      '       https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
  )
}

/** Un id estable para la referencia, sacado del link. Dos envíos del mismo link dan la misma ficha. */
export function idDeLink(url) {
  const m = String(url).match(/\/(reel|p|tv|shorts|watch)\/([A-Za-z0-9_-]+)/)
  if (m) return `${m[1]}-${m[2]}`
  const limpio = String(url)
    .replace(/^https?:\/\//, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  if (!limpio) throw new Error(`No puedo sacar un id de "${url}".`)
  return limpio.slice(0, 60)
}

export function rutaFicha(id) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error(`Id de referencia inseguro: "${id}".`)
  return path.join(DIR_REFERENCIAS, `${id}.json`)
}

/** Baja el video y su caption a una carpeta temporal. Devuelve las rutas. */
export function bajar(url, { env = process.env } = {}) {
  const bin = binarioYtDlp(env)
  const dir = mkdtempSync(path.join(tmpdir(), 'rrss-ref-'))
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
    { stdio: 'pipe', encoding: 'utf8' },
  )
  const archivos = readdirSync(dir)
  const video = archivos.find((f) => f.endsWith('.mp4'))
  const info = archivos.find((f) => f.endsWith('.info.json'))
  return {
    dir,
    video: video ? path.join(dir, video) : null,
    caption: info ? (JSON.parse(readFileSync(path.join(dir, info), 'utf8')).description ?? '') : '',
  }
}

const PROMPT = `Analizá este video como director creativo de una marca de golf premium (Golfers+, app
chilena de torneos en vivo: anotar, leaderboard, neto con hándicap). Es una referencia que nos
mandaron, NO contenido nuestro.

Devolvé SOLO un JSON con estas claves:
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

Reglas: si el video no es de golf, decilo en es_de_golf y adaptá igual (la estructura puede servir).
No inventes nada que no esté en el video. Español de Chile, sin voseo.`

function sinClave(texto, clave) {
  return clave ? String(texto ?? '').replaceAll(clave, '<GEMINI_API_KEY>') : String(texto ?? '')
}

/** Analiza el video con Gemini. Entiende audio e imagen, que es justo lo que hay que juzgar acá. */
export async function analizar({ video, caption }, { env = process.env } = {}) {
  const clave = env.GEMINI_API_KEY?.trim()
  if (!clave) throw new Error('Falta GEMINI_API_KEY (está en .env.local; corré con node --env-file=.env.local).')
  const partes = []
  if (video) partes.push({ inlineData: { mimeType: 'video/mp4', data: readFileSync(video).toString('base64') } })
  if (!partes.length && !caption?.trim())
    throw new Error('La referencia no tiene ni video ni caption: no hay nada que analizar.')
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
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) },
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
      return JSON.parse(texto.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, ''))
    } catch (e) {
      fallos.push(`${modelo}: ${sinClave(e.message, clave)}`)
    }
  }
  throw new Error(`Gemini no pudo analizar la referencia:\n   · ${fallos.join('\n   · ')}`)
}

/** Baja, analiza y deja la ficha. Si la ficha ya existe no se vuelve a gastar en Gemini. */
export async function ingerir(url, { env = process.env, cuando = new Date(), rehacer = false } = {}) {
  const id = idDeLink(url)
  const ruta = rutaFicha(id)
  if (existsSync(ruta) && !rehacer) return { id, ruta, ficha: JSON.parse(readFileSync(ruta, 'utf8')), reusada: true }
  const descarga = bajar(url, { env })
  const analisis = await analizar(descarga, { env })
  const ficha = {
    id,
    url,
    recibida: cuando.toISOString(),
    caption: descarga.caption,
    ...analisis,
    usada_en: [], // tandas que se inspiraron en esta referencia
  }
  mkdirSync(DIR_REFERENCIAS, { recursive: true })
  writeFileSync(ruta, `${JSON.stringify(ficha, null, 2)}\n`)
  return { id, ruta, ficha, reusada: false }
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
    pendientes.forEach((r) => console.log(`   ${r.id} · ${r.formato} · ${r.gancho}`))
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
