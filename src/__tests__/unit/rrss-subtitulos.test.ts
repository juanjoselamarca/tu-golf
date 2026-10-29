/**
 * Los subtítulos quemados de un reel: que se puedan leer, y que digan la verdad.
 *
 * Son regla dura del plan de lanzamiento («Subtítulos siempre, en español
 * chileno, sin voseo») por una razón práctica: los reels del feed arrancan
 * MUDOS. Una pieza sin texto en pantalla se mira sin saber qué se está mirando,
 * y las tres del lanzamiento se grabaron así.
 *
 * Dos familias de control:
 *  1. `tramosDeSubtitulos` — el ancla, el tiempo de lectura y las reglas de
 *     copy. Es función pura sobre `frames.json`, así que se puede afirmar que
 *     una línea alcanza a leerse SIN montar un video de 14 segundos.
 *  2. Lo que los subtítulos AFIRMAN. «Catalina: 105 golpes, 34 de hándicap.»
 *     queda quemado sobre la imagen: si alguien corrige un golpe de la escena
 *     en una revisión, el video pasa a mentir y nada más se entera. Acá los
 *     números salen del motor de golf, igual que en `rrss-escenas.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { ESCENAS } from '../../../scripts/rrss/escenas.mjs'
import {
  CPS_LECTURA,
  MINIMO_SEGUNDOS,
  TOPE_CARACTERES,
  diferenciaMedia,
  filtroDeSubtitulos,
  tramosDeSubtitulos,
} from '../../../scripts/rrss/subtitulos.mjs'
import {
  type Escena,
  type JugadorDeEscena,
  courseHcp,
  netoVsPar,
} from '@/__tests__/helpers/rrss-escena'

/** Una toma de juguete: tres notas, con duraciones cómodas. */
const TOMA = [
  { archivo: '0000.jpg', ms: 1000, nota: 'abre' },
  { archivo: '0001.jpg', ms: 2000, nota: 'abre' },
  { archivo: '0002.jpg', ms: 3000, nota: 'medio' },
  { archivo: '0003.jpg', ms: 2000, nota: 'cierra' },
]

describe('tramosDeSubtitulos — el ancla', () => {
  it('cada línea vive desde su nota hasta la entrada siguiente', () => {
    const tramos = tramosDeSubtitulos(TOMA, [
      { nota: 'abre', texto: 'Uno.' },
      { nota: 'medio', texto: 'Dos.' },
      { nota: 'cierra', texto: 'Tres.' },
    ])
    expect(tramos.map((t) => [t.texto, t.desde, t.hasta])).toEqual([
      ['Uno.', 0, 3],
      ['Dos.', 3, 6],
      ['Tres.', 6, 8],
    ])
  })

  it('la nota ancla en su PRIMERA aparición, no en la última', () => {
    // "abre" son dos fotogramas: el subtítulo entra con el primero. Si entrara
    // con el último, la línea aparecería un segundo después de lo que muestra.
    const [primero] = tramosDeSubtitulos(TOMA, [{ nota: 'abre', texto: 'Uno.' }])
    expect(primero.desde).toBe(0)
  })

  it('el último tramo llega hasta el final de la toma', () => {
    const [ultimo] = tramosDeSubtitulos(TOMA, [{ nota: 'cierra', texto: 'Final.' }])
    expect(ultimo.hasta).toBe(8)
  })

  it('`texto: null` apaga la línea sin mover a las demás', () => {
    const tramos = tramosDeSubtitulos(TOMA, [
      { nota: 'abre', texto: 'Uno.' },
      { nota: 'medio', texto: null },
    ])
    expect(tramos).toHaveLength(1)
    // Sigue cortando en 3: el null apaga, no estira la línea anterior.
    expect(tramos[0].hasta).toBe(3)
  })

  it('no depende del orden en que la escena declare las notas', () => {
    const alReves = tramosDeSubtitulos(TOMA, [
      { nota: 'cierra', texto: 'Tres.' },
      { nota: 'abre', texto: 'Uno.' },
      { nota: 'medio', texto: 'Dos.' },
    ])
    expect(alReves.map((t) => t.texto)).toEqual(['Uno.', 'Dos.', 'Tres.'])
  })
})

describe('tramosDeSubtitulos — lo que NO deja pasar', () => {
  it('una nota que la toma no tiene: la línea no se vería nunca', () => {
    expect(() => tramosDeSubtitulos(TOMA, [{ nota: 'inventada', texto: 'Hola.' }])).toThrow(
      /inventada/,
    )
    // Y dice cuáles hay, que es lo que uno necesita para corregirlo.
    expect(() => tramosDeSubtitulos(TOMA, [{ nota: 'inventada', texto: 'Hola.' }])).toThrow(
      /abre, medio, cierra/,
    )
  })

  it('un tramo más corto que lo que su texto tarda en leerse', () => {
    const texto = 'A'.repeat(Math.ceil(CPS_LECTURA * 3) + 15) // necesita > 3 s
    expect(() =>
      tramosDeSubtitulos(TOMA, [
        { nota: 'medio', texto },
        { nota: 'cierra', texto: null },
      ]),
    ).toThrow(/necesita/)
  })

  it('una línea corta tiene piso igual: un flash no se lee', () => {
    const corta = [
      { archivo: '0.jpg', ms: 400, nota: 'flash' },
      { archivo: '1.jpg', ms: 3000, nota: 'resto' },
    ]
    expect(MINIMO_SEGUNDOS).toBeGreaterThan(0.4)
    expect(() =>
      tramosDeSubtitulos(corta, [
        { nota: 'flash', texto: 'Ya.' },
        { nota: 'resto', texto: null },
      ]),
    ).toThrow(/necesita 1\.00 s/)
  })

  it('voseo: el copy va en español de Chile', () => {
    expect(() => tramosDeSubtitulos(TOMA, [{ nota: 'abre', texto: 'Ingresá tu score.' }])).toThrow(
      /voseo/,
    )
  })

  it('una línea más larga que el tope: eso ya no es un subtítulo', () => {
    const larga = 'a'.repeat(TOPE_CARACTERES + 1)
    // La toma dura de sobra, así que lo único que puede saltar es el tope.
    const lenta = [{ archivo: '0.jpg', ms: 60_000, nota: 'abre' }]
    expect(() => tramosDeSubtitulos(lenta, [{ nota: 'abre', texto: larga }])).toThrow(
      new RegExp(`${TOPE_CARACTERES + 1} caracteres`),
    )
  })

  it('una línea vacía, que es un null escrito mal', () => {
    expect(() => tramosDeSubtitulos(TOMA, [{ nota: 'abre', texto: '   ' }])).toThrow(/vacío/)
  })

  it('una escena sin subtítulos no se monta', () => {
    expect(() => tramosDeSubtitulos(TOMA, [])).toThrow(/no declara subtítulos/)
    expect(() => tramosDeSubtitulos(TOMA, undefined)).toThrow(/no declara subtítulos/)
  })

  it('una escena donde TODAS las líneas están apagadas', () => {
    expect(() => tramosDeSubtitulos(TOMA, [{ nota: 'abre', texto: null }])).toThrow(
      /ninguno se muestra/,
    )
  })
})

describe('el filtro que los quema', () => {
  const tramos = [
    { texto: 'Uno.', nota: 'abre', desde: 0, hasta: 3 },
    { texto: 'Dos.', nota: 'medio', desde: 3, hasta: 8 },
  ]
  const cadena = filtroDeSubtitulos(tramos, { ancho: 1080, alto: 1920, fps: 30 })
  const pasos = cadena.split(';')

  it('numera las bandas desde el input 2: el 0 son los fotogramas y el 1 el silencio', () => {
    expect(pasos[1]).toContain('[2:v]')
    expect(pasos[2]).toContain('[3:v]')
  })

  it('un overlay por tramo, con su ventana de tiempo', () => {
    expect(pasos).toHaveLength(tramos.length + 2) // escalado + overlays + format
    expect(pasos[1]).toContain("enable='between(t,0.000,3.000)'")
    expect(pasos[2]).toContain("enable='between(t,3.000,8.000)'")
  })

  it('el format=yuv420p queda AL FINAL', () => {
    // Antes del overlay le saca el canal alfa a la base y la banda se pega con
    // los bordes duros.
    expect(pasos.at(-1)).toBe(`[b${tramos.length}]format=yuv420p[v]`)
    expect(pasos.slice(0, -1).join(';')).not.toContain('yuv420p')
  })
})

describe('la comparación que verifica el video montado', () => {
  it('dos miniaturas iguales no difieren', () => {
    const a = Uint8Array.from([10, 20, 30, 40])
    expect(diferenciaMedia(a, Uint8Array.from(a))).toBe(0)
  })

  it('promedia por canal, no suma', () => {
    expect(diferenciaMedia(Uint8Array.from([0, 0, 0, 0]), Uint8Array.from([8, 8, 8, 8]))).toBe(8)
  })

  it('se niega a comparar tamaños distintos en vez de dar un 0 tranquilizador', () => {
    expect(() => diferenciaMedia(Uint8Array.from([1, 2]), Uint8Array.from([1]))).toThrow()
    expect(() => diferenciaMedia(Uint8Array.from([]), Uint8Array.from([]))).toThrow()
  })
})

/** El texto que la escena quema, por nota. */
function subtitulo(escena: Escena, nota: string): string {
  const linea = escena.subtitulos?.find((s) => s.nota === nota)
  expect(linea, `la escena no declara subtítulo en "${nota}"`).toBeTruthy()
  return String(linea!.texto)
}

describe('lo que los subtítulos AFIRMAN — reel 2 "cada-uno-su-handicap"', () => {
  const escena = ESCENAS['cada-uno-su-handicap'] as Escena
  const porNombre = (nombre: string): JugadorDeEscena => {
    const j = escena.jugadores.find((x) => x.nombre.startsWith(nombre))
    expect(j, `la escena no tiene a ${nombre}`).toBeTruthy()
    return j!
  }
  const total = (j: JugadorDeEscena) => j.golpes.reduce((a, b) => a + b, 0)

  it('«Cuatro amigos, cuatro hándicaps.»: son cuatro y los cuatro distintos', () => {
    expect(subtitulo(escena, 'marcador')).toBe('Cuatro amigos, cuatro hándicaps.')
    expect(escena.jugadores).toHaveLength(4)
    const hcps = escena.jugadores.map((j) => courseHcp(escena, j))
    expect(new Set(hcps).size).toBe(4)
  })

  it('«Catalina: 105 golpes, 34 de hándicap.» son los números del motor', () => {
    const catalina = porNombre('Catalina')
    const texto = subtitulo(escena, 'tarjeta-primera')
    expect(texto).toContain(`${total(catalina)} golpes`)
    expect(texto).toContain(`${courseHcp(escena, catalina)} de hándicap`)
  })

  it('«Juan: 86 golpes, 13 de hándicap.» también', () => {
    const juan = porNombre('Juan')
    const texto = subtitulo(escena, 'tarjeta-segunda')
    expect(texto).toContain(`${total(juan)} golpes`)
    expect(texto).toContain(`${courseHcp(escena, juan)} de hándicap`)
  })

  it('«Gana la de 34.»: el hándicap que gana el neto es ese y de nadie más', () => {
    const neto = (j: JugadorDeEscena) => netoVsPar(escena, j, escena.hoyos_jugados, j.golpes)
    const ganadora = [...escena.jugadores].sort((a, b) => neto(a) - neto(b))[0]
    const hcp = courseHcp(escena, ganadora)
    expect(subtitulo(escena, 'marcador-final')).toBe(`Gana la de ${hcp}.`)
    expect(escena.jugadores.filter((j) => courseHcp(escena, j) === hcp)).toHaveLength(1)
  })
})

describe('lo que los subtítulos AFIRMAN — reel 1 "anota-todos-ven"', () => {
  const escena = ESCENAS['anota-todos-ven'] as Escena
  const [protagonista] = escena.jugadores
  const antes = escena.hoyos_jugados
  const neto = (j: JugadorDeEscena, hoyos: number[], golpes: number[]) =>
    netoVsPar(escena, j, hoyos, golpes)

  it('«Vas segundo, por un golpe.»: segundo, y el golpe es UNO', () => {
    expect(subtitulo(escena, 'marcador-antes')).toBe('Vas segundo, por un golpe.')
    const tabla = escena.jugadores
      .map((j) => ({ nombre: j.nombre, n: neto(j, antes, j.golpes) }))
      .sort((a, b) => a.n - b.n)
    expect(tabla[1].nombre).toBe(protagonista.nombre)
    expect(tabla[1].n - tabla[0].n).toBe(1)
  })

  it('«Anotas tu hoyo 12.» es el hoyo del gesto', () => {
    expect(subtitulo(escena, 'scorer-quieto')).toBe(`Anotas tu hoyo ${escena.hoyo_del_gesto}.`)
    // Y ese hoyo todavía no está anotado: si estuviera, el scorer lo mostraría
    // lleno y el gesto del reel sería una corrección, no una anotación.
    expect(antes).not.toContain(escena.hoyo_del_gesto)
  })

  it('«Birdie.» es un birdie de verdad en ese hoyo', () => {
    expect(subtitulo(escena, 'score-anotado')).toBe('Birdie.')
    const hoyo = escena.catalogo.hoyos[escena.hoyo_del_gesto! - 1]
    expect(escena.golpes_del_gesto).toBe(hoyo.par - 1)
  })

  it('«Y pasas a liderar.»: después del gesto queda primero y solo', () => {
    expect(subtitulo(escena, 'marcador-despues')).toBe('Y pasas a liderar.')
    const despues = [...antes, escena.hoyo_del_gesto!]
    const tabla = escena.jugadores
      .map((j) => ({
        nombre: j.nombre,
        n:
          j === protagonista
            ? neto(j, despues, [...j.golpes, escena.golpes_del_gesto!])
            : neto(j, antes, j.golpes),
      }))
      .sort((a, b) => a.n - b.n)
    expect(tabla[0].nombre).toBe(protagonista.nombre)
    expect(tabla[0].n).toBeLessThan(tabla[1].n)
  })
})

describe('las tres escenas del lanzamiento', () => {
  const SLUGS = ['anota-todos-ven', 'cada-uno-su-handicap', 'torneo-en-dos-minutos'] as const

  it.each(SLUGS)('"%s" declara subtítulos y apaga la lámina de cierre', (slug) => {
    const escena = ESCENAS[slug] as Escena
    expect(escena.subtitulos?.length).toBeGreaterThan(0)
    // El cierre trae su propio titular: una banda encima sería texto sobre texto.
    const cierre = escena.subtitulos!.find((s) => s.nota === 'cierre')
    expect(cierre, `"${slug}" no apaga el subtítulo del cierre`).toBeTruthy()
    expect(cierre!.texto).toBeNull()
  })

  it.each(SLUGS)('"%s" no pasa el tope de caracteres en ninguna línea', (slug) => {
    for (const s of (ESCENAS[slug] as Escena).subtitulos ?? []) {
      if (s.texto === null) continue
      expect(s.texto.length, `"${s.texto}" en ${slug}`).toBeLessThanOrEqual(TOPE_CARACTERES)
    }
  })
})
