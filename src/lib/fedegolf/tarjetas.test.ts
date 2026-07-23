import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseTarjetas,
  normalizarTee,
  filtrarSanidad,
  procesarTarjetas,
  resumenIndiceOficial,
  fedegolfGetTarjetasIndice,
} from './tarjetas'

const fixtureHtml = readFileSync(
  resolve(process.cwd(), 'src/lib/fedegolf/__fixtures__/listado-20.html'),
  'utf8'
)

describe('parseTarjetas', () => {
  it('extrae las 20 filas crudas del listado', () => {
    const filas = parseTarjetas(fixtureHtml)
    expect(filas).toHaveLength(20)
  })

  it('mapea columnas de una fila normal', () => {
    const fila = parseTarjetas(fixtureHtml).find((f) => f.ticket === '6902341')!
    expect(fila).toBeDefined()
    expect(fila.fechaJuego).toBe('2026-07-11')
    expect(fila.scoreGross).toBe(84)
    expect(fila.courseRating).toBe(73.3)
    expect(fila.slope).toBe(136)
    expect(fila.tee).toBe('Azul')
    expect(fila.diferencial).toBe(8.8)
    expect(fila.cuenta).toBe(true)
    expect(fila.esCampeonato).toBe(false)
  })

  it('marca ambas filas del campeonato con trofeo; la sin ticket queda con ticket null', () => {
    const camp = parseTarjetas(fixtureHtml).filter((f) => f.esCampeonato)
    expect(camp).toHaveLength(2)
    expect(camp.every((f) => f.fechaJuego === '2026-04-12')).toBe(true)
    expect(camp.some((f) => f.ticket === '6766119')).toBe(true)
    expect(camp.some((f) => f.ticket === null)).toBe(true)
  })
})

describe('normalizarTee', () => {
  it('expande abreviaturas y respeta nombres completos', () => {
    expect(normalizarTee('A')).toBe('Azul')
    expect(normalizarTee('Azul')).toBe('Azul')
    expect(normalizarTee('B')).toBe('Blanco')
    expect(normalizarTee('R')).toBe('Rojo')
    expect(normalizarTee('')).toBeNull()
    expect(normalizarTee(null)).toBeNull()
  })
})

describe('filtrarSanidad', () => {
  it('descarta diferenciales fuera de rango (basura)', () => {
    expect(filtrarSanidad({ diferencial: -49.2 })).toBe(false)
    expect(filtrarSanidad({ diferencial: 60 })).toBe(false)
    expect(filtrarSanidad({ diferencial: NaN })).toBe(false)
  })

  it('conserva 9h legítimo (gross bajo, diff normal) — NO filtra por gross', () => {
    expect(filtrarSanidad({ diferencial: 12.4 })).toBe(true)
    expect(filtrarSanidad({ diferencial: 8.8 })).toBe(true)
  })
})

describe('procesarTarjetas', () => {
  it('descarta la casilla fantasma sin ticket → 19 tarjetas', () => {
    const t = procesarTarjetas(fixtureHtml)
    expect(t).toHaveLength(19)
    expect(t.every((x) => typeof x.ticket === 'string' && x.ticket.length > 0)).toBe(true)
  })

  it('marca la tarjeta de campeonato ticketeada como valeDoble', () => {
    const t = procesarTarjetas(fixtureHtml)
    const camp = t.filter((x) => x.valeDoble)
    expect(camp).toHaveLength(1)
    expect(camp[0].ticket).toBe('6766119')
    expect(camp[0].scoreGross).toBe(83)
    expect(camp[0].diferencial).toBe(8)
  })

  it('las tarjetas normales no son valeDoble', () => {
    const t = procesarTarjetas(fixtureHtml)
    const normal = t.find((x) => x.ticket === '6902341')!
    expect(normal.valeDoble).toBe(false)
  })
})

describe('resumenIndiceOficial', () => {
  it('el promedio de los diferenciales que cuentan cuadra con el índice oficial (9.1)', () => {
    const { promedio } = resumenIndiceOficial(procesarTarjetas(fixtureHtml))
    expect(promedio).toBe(9.1)
  })

  it('el campeonato aporta su diferencial dos veces (8 slots que cuentan sobre 20)', () => {
    const r = resumenIndiceOficial(procesarTarjetas(fixtureHtml))
    // 7 rondas físicas cuentan; una es campeonato → 8 diferenciales.
    expect(r.rondasQueCuentan).toBe(7)
    expect(r.diferencialesQueCuentan).toHaveLength(8)
    expect(r.slotsVentana).toBe(20)
    // el 8.0 del campeonato aparece dos veces
    expect(r.diferencialesQueCuentan.filter((d) => d === 8)).toHaveLength(2)
    // ordenados ascendente (el mejor primero)
    expect(r.diferencialesQueCuentan[0]).toBe(7.2)
  })

  it('sin tarjetas que cuenten → promedio null, sin crash', () => {
    const r = resumenIndiceOficial([])
    expect(r.promedio).toBeNull()
    expect(r.diferencialesQueCuentan).toEqual([])
    expect(r.slotsVentana).toBe(0)
  })
})

describe('fedegolfGetTarjetasIndice', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hace GET a listadoMejoresPalos con la cookie y devuelve las tarjetas procesadas', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      status: 200,
      text: async () => fixtureHtml,
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const tarjetas = await fedegolfGetTarjetasIndice({ cookie: 'PHPSESSID=abc' })

    expect(tarjetas).toHaveLength(19)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/publico/modVeinteMejoresPalos/listadoMejoresPalos.php')
    expect(opts.headers.Cookie).toBe('PHPSESSID=abc')
  })
})
