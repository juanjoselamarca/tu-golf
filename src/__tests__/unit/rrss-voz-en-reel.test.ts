// Un reel no se entrega sin la voz que dice su manifiesto.
//
// Incidente 20/21-nov-2026: las piezas 2 y 3 se publicaron con música y sin voz.
// Tenían pista de audio y -13,8 LUFS, así que un chequeo de «hay audio» o de
// volumen las habría aprobado. Estos tests fijan que el juicio mira la VOZ:
// correlación de cada línea contra la mezcla, que no depende del volumen general,
// juzgada por tramos de 0,5 s para que un golpe de música no se esconda en el promedio.
import { describe, expect, it } from 'vitest'
import {
  AUDIO_CORTO_MAX_S,
  COBERTURA_MIN,
  DURACION_LINEA_MAX_S,
  HZ_MEDICION,
  VOZ_SOBRE_FONDO_MIN_DB,
  correlacion,
  juzgar,
  medirLinea,
  revisarManifiesto,
  rutaManifiestoVoz,
  vozSobreFondoDb,
} from '../../../scripts/rrss/voz-en-reel.mjs'

/** Ruido determinista (LCG) para que el test no dependa del azar. */
function ruido(n: number, semilla: number) {
  const out = new Float32Array(n)
  let x = semilla >>> 0
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    out[i] = x / 2 ** 32 - 0.5
  }
  return out
}

function rms(a: Float32Array) {
  let s = 0
  for (const v of a) s += v * v
  return Math.sqrt(s / a.length)
}

/** Mezcla: fondo de `totalS` segundos + la voz en `inicioS`, con la voz `db` dB sobre el fondo. */
function mezclar(fondo: Float32Array, voz: Float32Array, inicioS: number, db: number) {
  const out = Float32Array.from(fondo)
  const g = (rms(fondo) / rms(voz)) * 10 ** (db / 20)
  const desde = Math.round(inicioS * HZ_MEDICION)
  for (let i = 0; i < voz.length; i++) out[desde + i] += g * voz[i]
  return out
}

const AUDIO_OK = { hayPista: true, duracionS: 30, duracionAudioS: 30, integradoLufs: -14, picoDbtp: -1.5 }

/** Una medida con `n` tramos de 0,5 s; `dbs` fija los dB de cada tramo (el resto, `db`). */
const medidaCon = (db: number, n = 6, dbs: Record<number, number> = {}) => ({
  correlacion: 0.9,
  desfaseS: 0,
  vozSobreFondoDb: db,
  ventanas: Array.from({ length: n }, (_, k) => {
    const d = dbs[k] ?? db
    return { desdeS: k * 0.5, duracionS: 0.5, correlacion: d > 0 ? 0.9 : 0.02, vozSobreFondoDb: d }
  }),
})

describe('correlación de la voz contra la mezcla', () => {
  const fondo = ruido(HZ_MEDICION * 6, 7)
  const voz = ruido(HZ_MEDICION * 2, 99)

  it('mide cuántos dB va la voz sobre el fondo, con ±1 dB', () => {
    for (const db of [-6, 0, 3, 10]) {
      const m = medirLinea(mezclar(fondo, voz, 2, db), voz, 2)
      expect(Math.abs(m.vozSobreFondoDb - db)).toBeLessThan(1)
      for (const v of m.ventanas) expect(Math.abs(v.vozSobreFondoDb - db)).toBeLessThan(1.5)
    }
  })

  it('no depende del volumen general: loudnorm puede subir o bajar todo', () => {
    const mezcla = mezclar(fondo, voz, 2, 8)
    const bajada = mezcla.map((v) => v * 0.05)
    expect(medirLinea(bajada, voz, 2).vozSobreFondoDb).toBeCloseTo(medirLinea(mezcla, voz, 2).vozSobreFondoDb, 3)
  })

  it('sin la voz en la mezcla la correlación es ~0 aunque el tramo suene fuerte', () => {
    const m = medirLinea(fondo.map((v) => v * 4), voz, 2)
    expect(m.correlacion).toBeLessThan(0.1)
    expect(m.vozSobreFondoDb).toBeLessThan(VOZ_SOBRE_FONDO_MIN_DB)
  })

  it('encuentra la voz corrida unos milisegundos (relleno del AAC)', () => {
    const m = medirLinea(mezclar(fondo, voz, 2.03, 10), voz, 2)
    expect(m.desfaseS).toBeCloseTo(0.03, 3)
    expect(m.vozSobreFondoDb).toBeGreaterThan(9)
  })

  it('parte la línea en tramos de 0,5 s y solo cuenta los que tienen voz (el silencio no es voz)', () => {
    const conPausa = Float32Array.from(voz)
    conPausa.fill(0, HZ_MEDICION) // segundo 1 a 2: silencio
    const m = medirLinea(mezclar(fondo, conPausa, 2, 10), conPausa, 2)
    expect(m.ventanas).toHaveLength(2)
    expect(m.ventanas.every((v) => v.desdeS < 1)).toBe(true)
  })

  it('casos límite: tramos planos o vacíos no dan voz', () => {
    expect(correlacion(new Float32Array(10), ruido(10, 1))).toBe(0)
    expect(correlacion(new Float32Array(0), new Float32Array(0))).toBe(0)
    expect(vozSobreFondoDb(0)).toBe(-Infinity)
    expect(vozSobreFondoDb(Math.SQRT1_2)).toBeCloseTo(0, 6)
    expect(medirLinea(fondo, new Float32Array(HZ_MEDICION), 2).ventanas).toEqual([])
  })
})

describe('swell de música en el último segundo', () => {
  // La línea entera da +3,8 dB (pasaba con el juicio de la v1, que promediaba la línea), pero
  // en su último medio segundo la música sube y queda 3 dB SOBRE la voz: la última palabra no
  // se entiende. El juicio por tramos tiene que cazarlo.
  const voz = ruido(HZ_MEDICION * 3, 99)
  const total = HZ_MEDICION * 6
  const fondo = ruido(total, 7)
  const inicio = 2
  const rv = rms(voz)
  const rf = rms(fondo)
  const mezcla = new Float32Array(total)
  const desdeSwell = (inicio + 2.5) * HZ_MEDICION
  for (let i = 0; i < total; i++) {
    const db = i >= desdeSwell && i < (inicio + 3) * HZ_MEDICION ? 3 : -10
    mezcla[i] = fondo[i] * (rv / rf) * 10 ** (db / 20)
  }
  for (let i = 0; i < voz.length; i++) mezcla[inicio * HZ_MEDICION + i] += voz[i]
  const medida = medirLinea(mezcla, voz, inicio)
  const audio = { ...AUDIO_OK, duracionS: 6, duracionAudioS: 6 }

  it('el promedio de la línea no lo ve', () => {
    expect(medida.vozSobreFondoDb).toBeGreaterThan(VOZ_SOBRE_FONDO_MIN_DB)
  })

  it('el tramo final sí: la voz queda bajo la música y el reel no se entrega', () => {
    const ultimo = medida.ventanas[medida.ventanas.length - 1]
    expect(ultimo.vozSobreFondoDb).toBeLessThan(0)
    const fallas = juzgar({ audio, lineas: [{ archivo: 'voz/l.wav', inicioS: inicio, duracionS: 3, medida }] })
    expect(fallas).toHaveLength(1)
    expect(fallas[0]).toMatch(/1 de 6 tramos[\s\S]*La música la tapa/)
  })
})

describe('juzgar: qué reel se entrega', () => {
  const lineas = [0, 5, 10, 15, 20, 25].map((t, i) => ({
    archivo: `voz/l${i}.wav`,
    inicioS: t,
    duracionS: 3,
    medida: medidaCon(10),
  }))

  it('reel con voz en todas sus líneas, volumen de entrega y cobertura: pasa', () => {
    expect(juzgar({ audio: AUDIO_OK, lineas })).toEqual([])
  })

  it('el caso del incidente: audio a -14 LUFS pero la voz no está → no se entrega', () => {
    const sinVoz = lineas.map((l) => ({ ...l, medida: { ...medidaCon(-34), correlacion: 0.02 } }))
    const fallas = juzgar({ audio: AUDIO_OK, lineas: sinVoz })
    expect(fallas).toHaveLength(lineas.length)
    expect(fallas[0]).toMatch(/NO está en la mezcla/)
  })

  it('un tramo flojo se tolera si el 90 % llega a +3 dB y ninguno queda bajo 0 dB', () => {
    const doce = (dbs: Record<number, number>) => [{ ...lineas[0], duracionS: 6, medida: medidaCon(10, 12, dbs) }, ...lineas.slice(2)]
    expect(juzgar({ audio: AUDIO_OK, lineas: doce({ 4: 1 }) })).toEqual([])
    expect(juzgar({ audio: AUDIO_OK, lineas: doce({ 4: -0.5 }) })[0]).toMatch(/1 de 12 tramos/)
    expect(juzgar({ audio: AUDIO_OK, lineas: doce({ 4: 1, 9: 2 }) })[0]).toMatch(/2 de 12 tramos/)
  })

  it('manifiesto sin líneas de voz: un reel no se entrega mudo', () => {
    expect(juzgar({ audio: AUDIO_OK, lineas: [] })[0]).toMatch(/no se entrega mudo/)
  })

  it('MP4 sin pista de audio', () => {
    expect(juzgar({ audio: { ...AUDIO_OK, hayPista: false }, lineas })).toEqual(['el MP4 no tiene pista de audio'])
  })

  it('audio que termina antes que el video (la p3 v3 cortaba a los 31,2 s de 34,2 s)', () => {
    const corto = { ...AUDIO_OK, duracionAudioS: 30 - AUDIO_CORTO_MAX_S - 0.1 }
    expect(juzgar({ audio: corto, lineas: lineas.slice(0, 5) })).toEqual([expect.stringMatching(/el final queda mudo/)])
    expect(juzgar({ audio: { ...AUDIO_OK, duracionAudioS: 29.9 }, lineas })).toEqual([])
    const fallas = juzgar({ audio: { ...AUDIO_OK, duracionAudioS: 27 }, lineas })
    expect(fallas.some((f) => /l5\.wav[\s\S]*se corta/.test(f))).toBe(true)
  })

  it('voz tapada por la música, línea que se corta al final, líneas que se pisan', () => {
    const malas = [
      { ...lineas[0], medida: { ...medidaCon(-1.9), correlacion: 0.6 } },
      { ...lineas[1], inicioS: 1 },
      ...lineas.slice(2, 5),
      { ...lineas[5], inicioS: 28 },
    ]
    const fallas = juzgar({ audio: AUDIO_OK, lineas: malas })
    expect(fallas.some((f) => /La música la tapa/.test(f))).toBe(true)
    expect(fallas.some((f) => /se pisa con/.test(f))).toBe(true)
    expect(fallas.some((f) => /se corta/.test(f))).toBe(true)
  })

  it('un WAV sin tramos con voz no cuenta como línea', () => {
    const muda = [{ ...lineas[0], medida: { ...medidaCon(10), ventanas: [] } }, ...lineas.slice(1)]
    expect(juzgar({ audio: AUDIO_OK, lineas: muda })[0]).toMatch(/el WAV no tiene voz/)
  })

  it('poca voz: una línea suelta no es un reel con voz', () => {
    const fallas = juzgar({ audio: AUDIO_OK, lineas: lineas.slice(0, 1) })
    expect(fallas.some((f) => f.includes(`mínimo ${COBERTURA_MIN * 100} %`))).toBe(true)
  })

  it('la cobertura cuenta tramos con voz, no lo que dura el WAV', () => {
    // Seis WAV de 3 s (60 % del reel) con un solo tramo de voz cada uno: 3 s de voz de 30.
    const conAire = lineas.map((l) => ({ ...l, medida: medidaCon(10, 1) }))
    expect(juzgar({ audio: AUDIO_OK, lineas: conAire })).toEqual([expect.stringMatching(/solo 10 % del reel tiene voz/)])
  })

  it('una línea de más de 20 s o que cubre más del 80 % del reel no es una línea', () => {
    const larga = [{ ...lineas[0], duracionS: DURACION_LINEA_MAX_S + 1, medida: medidaCon(10, 42) }]
    expect(juzgar({ audio: { ...AUDIO_OK, duracionS: 60, duracionAudioS: 60 }, lineas: larga })[0]).toMatch(/máximo 20 s/)
    const todoElReel = [{ ...lineas[0], duracionS: 9, medida: medidaCon(10, 18) }]
    expect(juzgar({ audio: { ...AUDIO_OK, duracionS: 10, duracionAudioS: 10 }, lineas: todoElReel })[0]).toMatch(/cubre 90 % del reel/)
  })

  it('volumen fuera de -14 ± 1 LUFS o pico sobre -1 dBTP', () => {
    expect(juzgar({ audio: { ...AUDIO_OK, integradoLufs: -27 }, lineas })[0]).toMatch(/volumen integrado/)
    expect(juzgar({ audio: { ...AUDIO_OK, picoDbtp: -0.2 }, lineas })[0]).toMatch(/pico real/)
    expect(juzgar({ audio: { ...AUDIO_OK, integradoLufs: NaN }, lineas })[0]).toMatch(/volumen integrado/)
  })
})

describe('revisarManifiesto: no hay reel exento de voz', () => {
  const ok = { reel: 'p.mp4', voz: [{ archivo: 'voz/l1.wav', inicio_s: 0.15 }] }

  it('manifiesto completo: pasa', () => {
    expect(revisarManifiesto(ok)).toEqual([])
    expect(revisarManifiesto({ ...ok, voz: [{ archivo: 'voz\\l1.wav', inicio_s: 0 }] })).toEqual([])
  })

  it('«sinVoz» se rechaza aunque venga con aprobación, fecha y cita (decisión de Juanjo, 22-nov-2026)', () => {
    const conExcepcion = { ...ok, voz: [], sinVoz: { aprobadoPor: 'Juanjo', fecha: '2026-11-21', cita: 'Sin voz.' } }
    const fallas = revisarManifiesto(conExcepcion)
    expect(fallas.some((f) => /esa excepción no existe/.test(f))).toBe(true)
    expect(fallas.some((f) => /no trae líneas de voz/.test(f))).toBe(true)
  })

  it('los WAV van en voz/ junto al manifiesto: ni la música, ni el reel, ni otra carpeta', () => {
    for (const archivo of ['musica.wav', 'p.mp4', '../voz/l1.wav', 'voz/../musica.wav', 'otra/voz/l1.wav', 'C:/x/voz/l1.wav', 'voz/sub/l1.wav', 'voz/l1.mp3'])
      expect(revisarManifiesto({ ...ok, voz: [{ archivo, inicio_s: 0 }] }), archivo).toEqual([
        expect.stringMatching(/carpeta voz\//),
      ])
  })

  it('líneas mal escritas o sin reel', () => {
    expect(revisarManifiesto({ voz: [{ inicio_s: -1 }] })).toHaveLength(3)
    expect(revisarManifiesto(null)).toEqual(['el manifiesto no es un objeto JSON'])
  })

  it('el manifiesto de voz va al lado del MP4 con su nombre', () => {
    expect(rutaManifiestoVoz('/x/p2-con-voz.mp4')).toBe('/x/p2-con-voz.voz.json')
    expect(rutaManifiestoVoz('C:\\x\\Reel.MP4')).toBe('C:\\x\\Reel.voz.json')
  })
})
