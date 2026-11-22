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
// Uso: node scripts/rrss/voz-en-reel.mjs <manifiesto.json>   (exit 1 si falla)
// Manifiesto: { "reel": "x.mp4", "voz": [{ "archivo": "l1.wav", "inicio_s": 0.15 }, ...] }
// Rutas relativas al manifiesto. Un reel sin voz solo pasa con
// "sinVoz": { "aprobadoPor": "Juanjo", "fecha": "AAAA-MM-DD", "cita": "<lo que dijo, literal>" }.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { binarioFfmpeg } from './montar.mjs'

/** Frecuencia a la que se compara (la voz vive bajo 8 kHz; 16 kHz basta y es liviano). */
export const HZ_MEDICION = 16000

/** La voz tiene que sonar al menos 3 dB sobre la música y los efectos en cada línea. */
export const VOZ_SOBRE_FONDO_MIN_DB = 3

/** Parte del reel que tiene que estar locutada. Una sola línea suelta no es «el reel tiene voz». */
export const COBERTURA_MIN = 0.4

/** Volumen de entrega para Instagram (EBU R128): integrado -14 ± 1 LUFS, pico real ≤ -1 dBTP. */
export const LOUDNESS = { objetivo: -14, tolerancia: 1, picoMax: -1 }

/** Corrimiento máximo que se busca entre la línea y la mezcla (relleno del AAC, redondeos). */
export const DESFASE_MAX_S = 0.1

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

/**
 * La mejor correlación de la línea contra la mezcla buscando el desfase en ±DESFASE_MAX_S.
 * Paso grueso de 2 ms y afinado de a una muestra alrededor del mejor.
 */
export function medirLinea(mezcla, voz, inicioS, { hz = HZ_MEDICION, desfaseMaxS = DESFASE_MAX_S } = {}) {
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
  return { correlacion: mejor.c, desfaseS: mejor.d / hz, vozSobreFondoDb: vozSobreFondoDb(mejor.c) }
}

/**
 * Juzga las medidas. Puro: recibe lo medido y devuelve las fallas en castellano.
 * @param {{ audio: { hayPista: boolean, duracionS: number, integradoLufs: number, picoDbtp: number },
 *   lineas: { archivo: string, inicioS: number, duracionS: number, medida: { correlacion: number, desfaseS: number, vozSobreFondoDb: number } }[],
 *   sinVoz?: { aprobadoPor?: string, fecha?: string, cita?: string } }} medido
 * @returns {string[]}
 */
export function juzgar({ audio, lineas, sinVoz }) {
  const fallas = []
  if (!audio.hayPista) {
    fallas.push('el MP4 no tiene pista de audio')
    return fallas
  }
  const { objetivo, tolerancia, picoMax } = LOUDNESS
  if (!(Math.abs(audio.integradoLufs - objetivo) <= tolerancia))
    fallas.push(`volumen integrado ${audio.integradoLufs} LUFS (tiene que ser ${objetivo} ± ${tolerancia})`)
  if (!(audio.picoDbtp <= picoMax)) fallas.push(`pico real ${audio.picoDbtp} dBTP (máximo ${picoMax})`)

  if (sinVoz) {
    const { aprobadoPor, fecha, cita } = sinVoz
    if (aprobadoPor !== 'Juanjo' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '') || !(cita ?? '').trim())
      fallas.push('reel sin voz sin la aprobación explícita de Juanjo (sinVoz necesita aprobadoPor "Juanjo", fecha y cita literal)')
    if (lineas.length) fallas.push('el manifiesto dice sinVoz y a la vez trae líneas de voz')
    return fallas
  }
  if (!lineas.length) {
    fallas.push('el manifiesto no trae ninguna línea de voz: un reel no se entrega mudo')
    return fallas
  }
  let locutado = 0
  for (const l of lineas) {
    locutado += l.duracionS
    if (l.inicioS + l.duracionS > audio.duracionS + 0.05)
      fallas.push(`${l.archivo}: termina en ${(l.inicioS + l.duracionS).toFixed(2)} s y el reel dura ${audio.duracionS.toFixed(2)} s (se corta)`)
    else if (!(l.medida.vozSobreFondoDb >= VOZ_SOBRE_FONDO_MIN_DB))
      fallas.push(
        `${l.archivo} (${l.inicioS.toFixed(2)} s): la voz queda a ${l.medida.vozSobreFondoDb.toFixed(1)} dB del fondo ` +
          `(correlación ${l.medida.correlacion.toFixed(2)}; mínimo +${VOZ_SOBRE_FONDO_MIN_DB} dB). ` +
          (l.medida.correlacion < 0.3 ? 'La voz NO está en la mezcla.' : 'La música la tapa.'),
      )
  }
  const ordenadas = [...lineas].sort((a, b) => a.inicioS - b.inicioS)
  for (let i = 1; i < ordenadas.length; i++) {
    const prev = ordenadas[i - 1]
    if (prev.inicioS + prev.duracionS > ordenadas[i].inicioS + 0.02)
      fallas.push(`${prev.archivo} se pisa con ${ordenadas[i].archivo}`)
  }
  const cobertura = locutado / audio.duracionS
  if (cobertura < COBERTURA_MIN)
    fallas.push(`solo ${(cobertura * 100).toFixed(0)} % del reel tiene voz (mínimo ${COBERTURA_MIN * 100} %)`)
  return fallas
}

/** Decodifica cualquier audio a mono float32 a HZ_MEDICION. */
export function decodificar(archivo, bin = binarioFfmpeg()) {
  const r = spawnSync(bin, ['-v', 'error', '-i', archivo, '-vn', '-ac', '1', '-ar', String(HZ_MEDICION), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  })
  if (r.status !== 0) throw new Error(`ffmpeg no pudo leer ${archivo}: ${String(r.stderr).slice(0, 300)}`)
  const b = r.stdout
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4))
}

/** ¿Tiene pista de audio? Duración, LUFS integrado y pico real, con ebur128. */
export function medirAudio(mp4, bin = binarioFfmpeg()) {
  const r = spawnSync(bin, ['-hide_banner', '-nostats', '-i', mp4, '-map', '0:a:0?', '-af', 'ebur128=peak=true', '-f', 'null', '-'], {
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
  return {
    hayPista,
    duracionS,
    integradoLufs: i ? Number(i[1]) : NaN,
    picoDbtp: p ? (p[1] === '-inf' ? -Infinity : Number(p[1])) : NaN,
  }
}

/** Mide el reel del manifiesto y lo juzga. Devuelve { fallas, audio, lineas }. */
export function verificarVozEnReel(rutaManifiesto) {
  const dir = path.dirname(path.resolve(rutaManifiesto))
  const m = JSON.parse(readFileSync(rutaManifiesto, 'utf8'))
  const reel = path.resolve(dir, m.reel)
  const audio = medirAudio(reel)
  const lineas = []
  if (audio.hayPista && Array.isArray(m.voz) && m.voz.length) {
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
  return { fallas: juzgar({ audio, lineas, sinVoz: m.sinVoz }), audio, lineas }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const ruta = process.argv[2]
  if (!ruta) {
    console.error('uso: node scripts/rrss/voz-en-reel.mjs <manifiesto.json>')
    process.exit(2)
  }
  const { fallas, audio, lineas } = verificarVozEnReel(ruta)
  console.log(
    `audio: ${audio.hayPista ? 'sí' : 'NO'} · ${audio.duracionS.toFixed(2)} s · ${audio.integradoLufs} LUFS · pico ${audio.picoDbtp} dBTP`,
  )
  for (const l of lineas)
    console.log(
      `  ${l.archivo} @${l.inicioS.toFixed(2)} s (${l.duracionS.toFixed(2)} s): voz ${l.medida.vozSobreFondoDb.toFixed(1)} dB sobre el fondo, correlación ${l.medida.correlacion.toFixed(3)}`,
    )
  if (fallas.length) {
    console.error(`\nNO SE ENTREGA (${fallas.length}):\n- ${fallas.join('\n- ')}`)
    process.exit(1)
  }
  console.log('\nOK: el reel lleva su voz.')
}
