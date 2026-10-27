#!/usr/bin/env node
// Pega los fotogramas de una toma en un MP4 vertical listo para Instagram.
//
//   node scripts/rrss/montar.mjs <slug>
//
// Respeta la duración medida de cada fotograma (`frames.json`), así que el video
// corre al ritmo real de lo que pasó en pantalla: los tramos quietos son un solo
// archivo sostenido y los de movimiento, la ráfaga tal cual se capturó.
//
// Sale H.264 + yuv420p + faststart y una pista de silencio: es lo que Instagram
// acepta sin recomprimir de más, y un reel sin pista de audio se cuelga en
// algunos reproductores.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { ESCENAS, huellaEscena } from './escenas.mjs'
import { MEDIDA as FORMATO } from './marca.mjs'

const require = createRequire(import.meta.url)

/**
 * El video sale en la medida del formato 9:16 de la guía de marca, no en un
 * 1080x1920 escrito otra vez acá: el reel y la lámina de cierre que se le pega
 * al final tienen que medir lo mismo o ffmpeg reescala uno de los dos.
 */
export const MEDIDA = { ancho: FORMATO.story.ancho, alto: FORMATO.story.alto, fps: 30 }

/**
 * El ffmpeg con el que se arma el video.
 *
 * NO es una dependencia del proyecto a propósito: `ffmpeg-static` baja 80 MB en
 * cada `npm install`, incluido el del build de Vercel, para un script de
 * marketing que corre una vez por semana en esta máquina. Se busca en orden:
 * `FFMPEG_PATH`, el módulo si está instalado, y el `ffmpeg` del PATH.
 */
function binarioFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  try {
    const ruta = require('ffmpeg-static')
    if (ruta) return ruta
  } catch {
    /* no está instalado: queda el PATH */
  }
  const enPath = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  if (enPath.status === 0) return 'ffmpeg'
  throw new Error(
    'no hay ffmpeg. Instalalo para esta corrida con "npm i -D ffmpeg-static --no-save" ' +
      '(no va en package.json: son 80 MB en cada npm install del proyecto) ' +
      'o apunta FFMPEG_PATH a un binario propio.',
  )
}

/** El archivo de concat que ffmpeg lee: un `file` + su `duration` por fotograma. */
export function listaConcat(frames, dirFrames) {
  const lineas = []
  for (const f of frames) {
    const ruta = path.resolve(dirFrames, f.archivo).replace(/\\/g, '/').replace(/'/g, "'\\''")
    lineas.push(`file '${ruta}'`)
    lineas.push(`duration ${(f.ms / 1000).toFixed(3)}`)
  }
  // El demuxer concat ignora la duración del último: hay que repetirlo para que
  // el fotograma final dure lo que dice y el video no corte antes de tiempo.
  if (frames.length) {
    const ultimo = path.resolve(dirFrames, frames.at(-1).archivo).replace(/\\/g, '/').replace(/'/g, "'\\''")
    lineas.push(`file '${ultimo}'`)
  }
  return lineas.join('\n') + '\n'
}

function correr(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0)
    throw new Error(`ffmpeg falló (${r.status}):\n${(r.stderr ?? '').split('\n').slice(-12).join('\n')}`)
  return r
}

/**
 * La lámina de cierre, convertida al mismo códec que los fotogramas.
 *
 * No se puede meter el PNG tal cual en la lista de concat: el demuxer pega
 * streams, y un PNG después de 60 JPEG son dos códecs distintos en la misma
 * entrada. Se reconvierte a JPEG del mismo tamaño y pasa a ser un fotograma
 * más, con su duración, como cualquier otro.
 */
async function fotogramaDeCierre(escena, dirFrames) {
  if (!escena?.cierre) return null
  const { pieza, lamina, ms } = escena.cierre
  const origen = path.join('out', 'rrss', pieza, lamina)
  try {
    await access(origen)
  } catch {
    throw new Error(
      `falta la lámina de cierre ${origen}. Renderizala primero:\n` +
        `   node scripts/rrss/render.mjs scripts/rrss/piezas/${pieza}.json`,
    )
  }
  const archivo = 'zz-cierre.jpg'
  correr(binarioFfmpeg(), [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', origen,
    '-vf', `scale=${MEDIDA.ancho}:${MEDIDA.alto}:flags=lanczos`,
    '-q:v', '2',
    path.join(dirFrames, archivo),
  ])
  return { archivo, ms, nota: 'cierre' }
}

export async function montar(slug) {
  const dirPieza = path.join('out', 'rrss', slug)
  const dirFrames = path.join(dirPieza, 'frames')
  const { frames } = JSON.parse(await readFile(path.join(dirPieza, 'frames.json'), 'utf8'))
  if (!frames?.length) throw new Error(`${slug} no tiene fotogramas: corre capturar.mjs primero`)

  const cierre = await fotogramaDeCierre(ESCENAS[slug], dirFrames)
  if (cierre) frames.push(cierre)

  await mkdir(dirPieza, { recursive: true })
  const lista = path.join(dirPieza, 'concat.txt')
  await writeFile(lista, listaConcat(frames, dirFrames), 'utf8')

  const salida = path.join(dirPieza, `${slug}.mp4`)
  correr(binarioFfmpeg(), [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', lista,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-shortest',
    '-vf', `scale=${MEDIDA.ancho}:${MEDIDA.alto}:flags=lanczos,fps=${MEDIDA.fps},format=yuv420p`,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '19',
    '-profile:v', 'high',
    '-level', '4.0',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    salida,
  ])

  // La sonda es un `ffmpeg -i` sin salida: imprime los metadatos y SIEMPRE
  // termina en error ("At least one output file must be specified"), así que
  // esta no puede pasar por `correr`.
  const sonda = spawnSync(binarioFfmpeg(), ['-hide_banner', '-i', salida], { encoding: 'utf8' })
  const dur = /Duration: (\d+:\d+:\d+\.\d+)/.exec(sonda.stderr ?? '')?.[1] ?? '?'

  // El manifiesto del video, hermano del `publicacion.json` de las láminas: dice
  // de qué versión de la escena salió este MP4. `publicar.mjs` lo exige y
  // recalcula la huella, así que un reel montado antes de corregir la escena no
  // se puede empaquetar.
  const manifiesto = path.join(dirPieza, 'video.json')
  await writeFile(
    manifiesto,
    `${JSON.stringify(
      {
        escena: slug,
        huella_escena: huellaEscena(slug),
        montado: new Date().toISOString(),
        duracion: dur,
        fotogramas: frames.length,
        medida: `${MEDIDA.ancho}x${MEDIDA.alto}@${MEDIDA.fps}`,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  return { salida, duracion: dur, fotogramas: frames.length, manifiesto }
}

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Uso: node scripts/rrss/montar.mjs <slug>')
    process.exit(1)
  }
  const { salida, duracion, fotogramas } = await montar(slug)
  console.log(`✅ ${salida} · ${duracion} · ${fotogramas} fotogramas · ${MEDIDA.ancho}x${MEDIDA.alto}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
