// El reel que se sube tiene que durar lo que la escena dice que dura.
//
// No es una preocupación teórica: la pieza 1 del lanzamiento se produjo entera
// con la lámina de cierre durando 5,18 s en vez de los 2,60 que declara
// `escenas.mjs`. El demuxer concat de ffmpeg corta en el último `duration` sin
// mostrar ese fotograma, así que la lista repite el archivo final para tener
// material donde sostenerlo; esa copia extra se reproducía entera. Nadie se
// enteró: ffmpeg no da error, el MP4 es válido y la duración medida se escribía
// en `video.json` sin compararse con nada.
//
// En Instagram eso es un tercio del reel en una imagen fija, que es la forma más
// rápida de perder la retención, y es exactamente el tipo de error que no se ve
// hasta que está publicado.
import { describe, expect, it } from 'vitest'
import {
  MEDIDA,
  TOLERANCIA_DURACION_S,
  duracionEsperada,
  listaConcat,
  segundosDeDuracion,
} from '../../../scripts/rrss/montar.mjs'

const FRAMES = [
  { archivo: '0000.jpg', ms: 2100 },
  { archivo: '0001.jpg', ms: 1500 },
  { archivo: '0002.jpg', ms: 50 },
  { archivo: 'zz-cierre.jpg', ms: 2600, nota: 'cierre' },
]

describe('la duración declarada de una toma', () => {
  it('es la suma de lo que dura cada fotograma', () => {
    expect(duracionEsperada(FRAMES)).toBeCloseTo(6.25, 5)
    expect(duracionEsperada([])).toBe(0)
  })

  it('cambia si cambia la lámina de cierre', () => {
    // El control que faltaba: subir `cierre.ms` tiene que mover la duración
    // esperada, porque es lo que `-t` le pasa a ffmpeg.
    const masLargo = FRAMES.map((f) => (f.nota === 'cierre' ? { ...f, ms: 4000 } : f))
    expect(duracionEsperada(masLargo)).toBeCloseTo(duracionEsperada(FRAMES) + 1.4, 5)
  })
})

describe('la duración que ffmpeg informa', () => {
  it('se lee como segundos', () => {
    expect(segundosDeDuracion('00:00:13.89')).toBeCloseTo(13.89, 5)
    expect(segundosDeDuracion('00:01:00.00')).toBeCloseTo(60, 5)
    expect(segundosDeDuracion('01:02:03.50')).toBeCloseTo(3723.5, 5)
  })

  it('devuelve null cuando no se pudo medir, en vez de un cero que pasaría por bueno', () => {
    // `montar.mjs` convierte ese null en un error. Un 0 silencioso habría dicho
    // "el video dura cero" y la comparación se habría quejado de otra cosa.
    for (const basura of ['?', '', 'N/A', null, undefined, 'Duration: 00:00:13.89'])
      expect(segundosDeDuracion(basura as string), String(basura)).toBeNull()
  })
})

describe('la lista de concat', () => {
  const lista = listaConcat(FRAMES, '/tmp/frames')
  const lineas = lista.trim().split('\n')

  it('declara una duración por fotograma y ninguna más', () => {
    const duraciones = lineas.filter((l) => l.startsWith('duration '))
    expect(duraciones).toHaveLength(FRAMES.length)
    const suma = duraciones.reduce((t, l) => t + Number(l.slice('duration '.length)), 0)
    expect(suma).toBeCloseTo(duracionEsperada(FRAMES), 3)
  })

  it('repite el último archivo SIN duración, para que lo corte -t', () => {
    // La repetición existe porque el demuxer corta en el último `duration` sin
    // mostrar ese fotograma. Si además trajera su propia duración, el cierre se
    // reproduciría dos veces, que es el bug que esto previene.
    expect(lineas.at(-1)).toMatch(/^file .*zz-cierre\.jpg'$/)
    expect(lineas.filter((l) => l.includes('zz-cierre.jpg'))).toHaveLength(2)
    expect(lineas.at(-1)).not.toMatch(/duration/)
  })

  it('escribe rutas absolutas con barras normales', () => {
    // El archivo lo lee ffmpeg, no el shell: en Windows una ruta con
    // backslashes dentro de comillas simples no resuelve.
    for (const l of lineas.filter((x) => x.startsWith('file '))) expect(l).not.toMatch(/\\\\/)
  })
})

describe('la tolerancia entre lo medido y lo declarado', () => {
  it('son cuatro fotogramas, no un número suelto', () => {
    // Con una tolerancia grande el guard no caza nada: el error que lo motivó
    // era de 2,58 s. Con una de cero, el redondeo del contenedor haría fallar
    // cada montaje.
    expect(TOLERANCIA_DURACION_S).toBeCloseTo(4 / MEDIDA.fps, 10)
    expect(TOLERANCIA_DURACION_S).toBeLessThan(0.2)
    expect(TOLERANCIA_DURACION_S).toBeGreaterThan(0)
    // El caso real tiene que quedar MUY afuera.
    expect(2.58).toBeGreaterThan(TOLERANCIA_DURACION_S)
  })
})
