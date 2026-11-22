// El reel que se entrega tiene que llevar la voz en off que dice su manifiesto.
//
// Incidente del 20 y 21-nov-2026: las piezas 2 («Green isla») y 3 («Dónde se van
// los golpes») se publicaron con música y efectos, pero sin voz. Los dos MP4
// tenían pista de audio y sonaban a -13,8 LUFS: cualquier chequeo de «hay audio»
// o de volumen los daba por buenos. Lo que faltaba era la voz, y eso no lo medía
// nadie. Juanjo lo vio recién publicado.
//
// Cómo se mide la voz sin adivinar: el manifiesto dice qué WAV de voz va en qué
// segundo. Para cada línea se toma ese tramo de la mezcla final y se correlaciona
// con el WAV de la línea. La música no se parece a la voz (correlación ~0), así
// que la correlación sale de la proporción de voz en la mezcla:
//   c = σvoz / sqrt(σvoz² + σfondo²)   →   voz sobre fondo = 20·log10(c / sqrt(1 − c²)) dB
// No depende del volumen general (loudnorm puede subir o bajar todo) y no se
// engaña con un fondo fuerte: si la voz no está, c ≈ 0 aunque el tramo suene.
//
// El desfase se alinea con la línea entera (más muestras, alineación más firme),
// pero el juicio es por tramos de 0,5 s donde el WAV tiene voz: un promedio de la
// línea entera deja pasar un golpe de música que tapa la última palabra.
//
// Uso: node scripts/rrss/voz-en-reel.mjs <manifiesto.voz.json>   (exit 1 si falla)
// Manifiesto: { "reel": "x.mp4", "voz": [{ "archivo": "voz/l1.wav", "inicio_s": 0.15 }, ...] }
// Va al lado del MP4 con el nombre `<reel>.voz.json` (rutaManifiestoVoz) y los WAV en
// la carpeta `voz/` junto a él. No hay excepción para un reel mudo: todo reel lleva voz
// en off (decisión de Juanjo, 22-nov-2026: un reel sin voz se ve hecho por una máquina).
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { binarioFfmpeg } from './montar.mjs'

/** Frecuencia a la que se compara (la voz vive bajo 8 kHz; 16 kHz basta y es liviano). */
export const HZ_MEDICION = 16000

/** La voz tiene que sonar al menos 3 dB sobre la música y los efectos en cada tramo con voz. */
export const VOZ_SOBRE_FONDO_MIN_DB = 3

/** Largo de cada tramo que se juzga. */
export const VENTANA_S = 0.5

/** Un tramo tiene voz si su RMS supera el pico del WAV menos 40 dB (lo demás es silencio o aire). */
export const ACTIVIDAD_DB = -25

/**
 * Tolerancia para un tramo flojo (una sílaba suave, una consonante): pasa la línea si el 90 % de
 * sus tramos con voz llega a +3 dB y ninguno queda bajo 0 dB, es decir, la música nunca la supera.
 */
export const TRAMOS_OK_MIN = 0.9
export const PISO_TRAMO_DB = 0

/** Parte del reel que tiene que estar locutada, contando solo los tramos con voz. */
export const COBERTURA_MIN = 0.4

/**
 * Una línea de locución dura segundos. Un WAV de 20 s o uno que cubre casi todo el reel no es
 * una línea: es la pista de voz entera (o el reel mismo) y con eso la medición se puede engañar.
 */
export const DURACION_LINEA_MAX_S = 20
export const LINEA_MAX_DEL_REEL = 0.8

/** Volumen de entrega para Instagram (EBU R128): integrado -14 ± 1 LUFS, pico real ≤ -1 dBTP. */
export const LOUDNESS = { objetivo: -14, tolerancia: 1, picoMax: -1 }

/** Corrimiento máximo que se busca entre la línea y la mezcla (relleno del AAC, redondeos). */
export const DESFASE_MAX_S = 0.1

/**
 * Cuánto antes del final del video puede terminar el audio (granularidad del AAC y de ebur128).
 * La pieza 3 con voz (v3, 22-nov) salió con el audio cortado a los 31,2 s de un video de 34,2 s.
 */
export const AUDIO_CORTO_MAX_S = 0.3

/** Dónde va el manifiesto de voz de un MP4: al lado, `<nombre>.voz.json`. */
export function rutaManifiestoVoz(mp4) {
  return mp4.replace(/\.mp4$/i, '') + '.voz.json'
}

/** sha256 del archivo, para atar lo medido a los bytes que se entregan. */
export function huellaArchivo(ruta) {
  return createHash('sha256').update(readFileSync(ruta)).digest('hex')
}

/** Correlación de Pearson de dos tramos del mismo largo. 0 si alguno es plano. */
export function correlacion(a, b) {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= n
  mb /= n
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    sab += x * y
    saa += x * x
    sbb += y * y
  }
  if (saa === 0 || sbb === 0) return 0
  return sab / Math.sqrt(saa * sbb)
}

/** Correlación → dB de voz sobre el resto de la mezcla (ver cabecera). */
export function vozSobreFondoDb(c) {
  if (c <= 0) return -Infinity
  if (c >= 1) return Infinity
  return 20 * Math.log10(c / Math.sqrt(1 - c * c))
}

function rmsDe(a) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * a[i]
  return a.length ? Math.sqrt(s / a.length) : 0
}

/**
 * Mide una línea contra la mezcla.
 * 1. Busca el desfase en ±DESFASE_MAX_S con la línea entera (paso de 2 ms y afinado por muestra).
 * 2. Parte el WAV en tramos de ~VENTANA_S y, en los que tienen voz, mide la voz sobre el fondo.
 */
export function medirLinea(
  mezcla,
  voz,
  inicioS,
  { hz = HZ_MEDICION, desfaseMaxS = DESFASE_MAX_S, ventanaS = VENTANA_S } = {},
) {
  const base = Math.round(inicioS * hz)
  const max = Math.round(desfaseMaxS * hz)
  const tramo = (d) => {
    const desde = base + d
    if (desde < 0 || desde + voz.length > mezcla.length) return -1
    return correlacion(mezcla.subarray(desde, desde + voz.length), voz)
  }
  const paso = Math.max(1, Math.round(hz * 0.002))
  let mejor = { d: 0, c: -1 }
  for (let d = -max; d <= max; d += paso) {
    const c = tramo(d)
    if (c > mejor.c) mejor = { d, c }
  }
  for (let d = mejor.d - paso; d <= mejor.d + paso; d++) {
    const c = tramo(d)
    if (c > mejor.c) mejor = { d, c }
  }

  let pico = 0
  for (let i = 0; i < voz.length; i++) pico = Math.max(pico, Math.abs(voz[i]))
  const umbral = pico * 10 ** (ACTIVIDAD_DB / 20)
  const n = Math.max(1, Math.round(voz.length / (ventanaS * hz)))
  const desde0 = base + mejor.d
  const cabe = mejor.c > -1
  const ventanas = []
  for (let k = 0; k < n; k++) {
    const a = Math.floor((k * voz.length) / n)
    const b = Math.floor(((k + 1) * voz.length) / n)
    const v = voz.subarray(a, b)
    if (!(pico > 0 && rmsDe(v) > umbral)) continue
    const c = cabe ? correlacion(mezcla.subarray(desde0 + a, desde0 + b), v) : 0
    ventanas.push({ desdeS: a / hz, duracionS: (b - a) / hz, correlacion: c, vozSobreFondoDb: vozSobreFondoDb(c) })
  }
  return { correlacion: mejor.c, desfaseS: mejor.d / hz, vozSobreFondoDb: vozSobreFondoDb(mejor.c), ventanas }
}

const dB = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x))

/**
 * Juzga las medidas. Puro: recibe lo medido y devuelve las fallas en castellano.
 * @param {{ audio: { hayPista: boolean, duracionS: number, duracionAudioS: number, integradoLufs: number, picoDbtp: number },
 *   lineas: { archivo: string, inicioS: number, duracionS: number, medida: { correlacion: number, desfaseS: number, vozSobreFondoDb: number,
 *     ventanas: { desdeS: number, duracionS: number, correlacion: number, vozSobreFondoDb: number }[] } }[],
 * }} medido
 * @returns {string[]}
 */
export function juzgar({ audio, lineas }) {
  const fallas = []
  if (!audio.hayPista) {
    fallas.push('el MP4 no tiene pista de audio')
    return fallas
  }
  const { objetivo, tolerancia, picoMax } = LOUDNESS
  if (!(Math.abs(audio.integradoLufs - objetivo) <= tolerancia))
    fallas.push(`volumen integrado ${audio.integradoLufs} LUFS (tiene que ser ${objetivo} ± ${tolerancia})`)
  if (!(audio.picoDbtp <= picoMax)) fallas.push(`pico real ${audio.picoDbtp} dBTP (máximo ${picoMax})`)
  if (!(audio.duracionS - audio.duracionAudioS <= AUDIO_CORTO_MAX_S))
    fallas.push(
      `el audio termina a los ${audio.duracionAudioS.toFixed(1)} s y el video dura ${audio.duracionS.toFixed(1)} s (el final queda mudo)`,
    )
  const finS = Math.min(audio.duracionS, audio.duracionAudioS)

  if (!lineas.length) {
    fallas.push('el manifiesto no trae ninguna línea de voz: un reel no se entrega mudo')
    return fallas
  }
  let locutadoS = 0
  for (const l of lineas) {
    const ventanas = l.medida.ventanas ?? []
    if (l.duracionS > DURACION_LINEA_MAX_S) {
      fallas.push(`${l.archivo}: dura ${l.duracionS.toFixed(1)} s (una línea dura como máximo ${DURACION_LINEA_MAX_S} s)`)
      continue
    }
    if (l.duracionS > LINEA_MAX_DEL_REEL * audio.duracionS) {
      fallas.push(
        `${l.archivo}: cubre ${((l.duracionS / audio.duracionS) * 100).toFixed(0)} % del reel ` +
          `(máximo ${LINEA_MAX_DEL_REEL * 100} %): eso no es una línea de voz`,
      )
      continue
    }
    if (l.inicioS + l.duracionS > finS + 0.05) {
      fallas.push(`${l.archivo}: termina en ${(l.inicioS + l.duracionS).toFixed(2)} s y el audio del reel dura ${finS.toFixed(2)} s (se corta)`)
      continue
    }
    if (!ventanas.length) {
      fallas.push(`${l.archivo}: el WAV no tiene voz (ningún tramo sobre ${ACTIVIDAD_DB} dB de su pico)`)
      continue
    }
    for (const v of ventanas) locutadoS += v.duracionS
    const bajos = ventanas.filter((v) => !(v.vozSobreFondoDb >= VOZ_SOBRE_FONDO_MIN_DB))
    const peor = ventanas.reduce((a, v) => (v.vozSobreFondoDb < a.vozSobreFondoDb ? v : a))
    const tolerado = bajos.length / ventanas.length <= 1 - TRAMOS_OK_MIN && peor.vozSobreFondoDb >= PISO_TRAMO_DB
    if (bajos.length && !tolerado)
      fallas.push(
        `${l.archivo} (${l.inicioS.toFixed(2)} s): la voz queda bajo +${VOZ_SOBRE_FONDO_MIN_DB} dB del fondo en ` +
          `${bajos.length} de ${ventanas.length} tramos de ${VENTANA_S} s (peor: ${dB(peor.vozSobreFondoDb)} dB a los ` +
          `${(l.inicioS + peor.desdeS).toFixed(1)} s del reel; línea entera ${dB(l.medida.vozSobreFondoDb)} dB, ` +
          `correlación ${l.medida.correlacion.toFixed(2)}). ` +
          (l.medida.correlacion < 0.3 ? 'La voz NO está en la mezcla.' : 'La música la tapa.'),
      )
  }
  const ordenadas = [...lineas].sort((a, b) => a.inicioS - b.inicioS)
  for (let i = 1; i < ordenadas.length; i++) {
    const prev = ordenadas[i - 1]
    if (prev.inicioS + prev.duracionS > ordenadas[i].inicioS + 0.02)
      fallas.push(`${prev.archivo} se pisa con ${ordenadas[i].archivo}`)
  }
  const cobertura = locutadoS / audio.duracionS
  if (cobertura < COBERTURA_MIN)
    fallas.push(`solo ${(cobertura * 100).toFixed(0)} % del reel tiene voz (mínimo ${COBERTURA_MIN * 100} %, contando tramos con voz)`)
  return fallas
}

/**
 * Lo que el manifiesto tiene que cumplir antes de medir nada. No hay campo que exima a un reel de
 * la voz: un «sinVoz» (la excepción que existió hasta el 22-nov-2026) se rechaza con nombre. Los WAV
 * van en `voz/` al lado del manifiesto: así no se puede apuntar a la pista de música ni al reel mismo
 * desde otra carpeta.
 * @param {any} m
 * @returns {string[]}
 */
export function revisarManifiesto(m) {
  const fallas = []
  if (!m || typeof m !== 'object') return ['el manifiesto no es un objeto JSON']
  if (typeof m.reel !== 'string' || !m.reel) fallas.push('el manifiesto no dice qué MP4 se mide («reel»)')
  if ('sinVoz' in m) fallas.push('el manifiesto pide «sinVoz»: esa excepción no existe, todo reel lleva voz en off')
  if (!Array.isArray(m.voz) || !m.voz.length) fallas.push('el manifiesto no trae líneas de voz («voz»)')
  else
    m.voz.forEach((v, i) => {
      if (typeof v?.archivo !== 'string' || !v.archivo) fallas.push(`línea ${i + 1}: falta «archivo»`)
      else if (!/^voz\/[^/]+\.wav$/i.test(v.archivo.replace(/\\/g, '/')) || v.archivo.includes('..'))
        fallas.push(`línea ${i + 1}: «${v.archivo}» tiene que ser un WAV en la carpeta voz/ junto al manifiesto`)
      if (!(Number.isFinite(v?.inicio_s) && v.inicio_s >= 0)) fallas.push(`línea ${i + 1}: «inicio_s» tiene que ser un número >= 0`)
    })
  return fallas
}

/** Corre ffmpeg y revienta si no se pudo ejecutar (binario ausente, sin permisos): eso no es «sin audio». */
function ffmpeg(bin, args, opciones) {
  const r = spawnSync(bin, args, opciones)
  if (r.error) throw new Error(`ffmpeg no se pudo ejecutar (${bin}): ${r.error.message}`)
  return r
}

/** Decodifica cualquier audio a mono float32 a HZ_MEDICION. */
export function decodificar(archivo, bin = binarioFfmpeg()) {
  const r = ffmpeg(bin, ['-v', 'error', '-i', archivo, '-vn', '-ac', '1', '-ar', String(HZ_MEDICION), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  })
  if (r.status !== 0) throw new Error(`ffmpeg no pudo leer ${archivo}: ${String(r.stderr).slice(0, 300)}`)
  const b = r.stdout
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4))
}

/** ¿Tiene pista de audio? Duración, LUFS integrado y pico real, con ebur128. */
export function medirAudio(mp4, bin = binarioFfmpeg()) {
  const r = ffmpeg(bin, ['-hide_banner', '-nostats', '-i', mp4, '-map', '0:a:0?', '-af', 'ebur128=peak=true', '-f', 'null', '-'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
  const err = r.stderr ?? ''
  const hayPista = /Stream #\d+:\d+[^\n]*: Audio:/.test(err)
  const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err)
  const duracionS = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0
  const resumen = err.slice(err.lastIndexOf('Summary:'))
  const i = /I:\s+(-?\d+(?:\.\d+)?) LUFS/.exec(resumen)
  const p = /Peak:\s+(-?\d+(?:\.\d+)?|-inf) dBFS/.exec(resumen)
  // ebur128 escribe una línea cada 100 ms de audio («t: 30.9 …»): la última dice hasta dónde llega.
  const tiempos = [...err.matchAll(/\bt:\s*(\d+(?:\.\d+)?)/g)]
  const duracionAudioS = tiempos.length ? Number(tiempos[tiempos.length - 1][1]) : 0
  return {
    hayPista,
    duracionS,
    duracionAudioS,
    integradoLufs: i ? Number(i[1]) : NaN,
    picoDbtp: p ? (p[1] === '-inf' ? -Infinity : Number(p[1])) : NaN,
  }
}

/** Mide el reel del manifiesto y lo juzga. Devuelve { fallas, audio, lineas, reel, sha256 }. */
export function verificarVozEnReel(rutaManifiesto) {
  const dir = path.dirname(path.resolve(rutaManifiesto))
  const m = JSON.parse(readFileSync(rutaManifiesto, 'utf8'))
  const previas = revisarManifiesto(m)
  const reel = typeof m?.reel === 'string' && m.reel ? path.resolve(dir, m.reel) : null
  if (!reel || !existsSync(reel))
    return { fallas: [...previas, ...(reel ? [`el MP4 del manifiesto no existe: ${reel}`] : [])], audio: null, lineas: [], reel, sha256: null }
  const audio = medirAudio(reel)
  const lineas = []
  if (audio.hayPista && !previas.length) {
    const mezcla = decodificar(reel)
    for (const v of m.voz) {
      const voz = decodificar(path.resolve(dir, v.archivo))
      lineas.push({
        archivo: v.archivo,
        inicioS: v.inicio_s,
        duracionS: voz.length / HZ_MEDICION,
        medida: medirLinea(mezcla, voz, v.inicio_s),
      })
    }
  }
  const fallas = [...previas, ...(previas.length ? [] : juzgar({ audio, lineas }))]
  return { fallas, audio, lineas, reel, sha256: huellaArchivo(reel) }
}

const mismaRuta = (a, b) =>
  process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b)

/**
 * Lo que se imprime de una verificación: sha256 del MP4, medida por línea y el veredicto.
 * Es lo que copian el expediente del revisor, el empaquetador y la entrega.
 */
export function informeVozEnReel(mp4) {
  const manifiesto = rutaManifiestoVoz(mp4)
  if (!existsSync(manifiesto))
    return { ok: false, lineas: [`NO SE ENTREGA: el MP4 no trae manifiesto de voz (falta ${manifiesto}). Un reel no sale mudo.`] }
  const r = verificarVozEnReel(manifiesto)
  const fallas = [...r.fallas]
  if (r.reel && !mismaRuta(r.reel, mp4))
    fallas.unshift(`el manifiesto mide otro archivo (${r.reel}), no el que se entrega (${mp4})`)
  const out = [`MP4: ${mp4}`, `sha256: ${r.sha256 ?? '(no existe)'}`]
  if (r.audio)
    out.push(
      `audio: ${r.audio.hayPista ? 'sí' : 'NO'} · video ${r.audio.duracionS.toFixed(2)} s, audio hasta ${r.audio.duracionAudioS.toFixed(1)} s · ${r.audio.integradoLufs} LUFS · pico ${r.audio.picoDbtp} dBTP`,
    )
  for (const l of r.lineas) {
    const peor = l.medida.ventanas.length ? Math.min(...l.medida.ventanas.map((v) => v.vozSobreFondoDb)) : NaN
    out.push(
      `  ${l.archivo} @${l.inicioS.toFixed(2)} s (${l.duracionS.toFixed(2)} s): línea ${dB(l.medida.vozSobreFondoDb)} dB · ` +
        `peor tramo ${dB(peor)} dB · ${l.medida.ventanas.length} tramos con voz · correlación ${l.medida.correlacion.toFixed(3)}`,
    )
  }
  if (fallas.length) out.push(`NO SE ENTREGA (${fallas.length}):`, ...fallas.map((f) => `- ${f}`))
  else out.push('OK: el reel lleva su voz.')
  return { ok: !fallas.length, lineas: out, sha256: r.sha256 }
}

/** Para los pasos que entregan: revienta si el MP4 no pasa. Devuelve el informe si pasa. */
export function exigirVozEnReel(mp4) {
  const inf = informeVozEnReel(mp4)
  if (!inf.ok) throw new Error(`El reel no lleva su voz en off:\n${inf.lineas.join('\n')}`)
  return inf
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const ruta = process.argv[2]
  if (!ruta) {
    console.error('uso: node scripts/rrss/voz-en-reel.mjs <manifiesto.voz.json>')
    process.exit(2)
  }
  const m = JSON.parse(readFileSync(ruta, 'utf8'))
  const mp4 = path.resolve(path.dirname(path.resolve(ruta)), String(m.reel ?? ''))
  if (!mismaRuta(rutaManifiestoVoz(mp4), ruta)) {
    console.error(`NO SE ENTREGA: el manifiesto de ${mp4} tiene que llamarse ${rutaManifiestoVoz(mp4)}`)
    process.exit(1)
  }
  const inf = informeVozEnReel(mp4)
  for (const l of inf.lineas) (inf.ok ? console.log : console.error)(l)
  process.exit(inf.ok ? 0 : 1)
}
