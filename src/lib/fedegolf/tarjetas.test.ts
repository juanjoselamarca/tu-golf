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
  truncarIndiceFedegolf,
  parseTarjetasUtilizadas,
  formulaEsExplicable,
} from './tarjetas'

const fixtureHtml = readFileSync(
  resolve(process.cwd(), 'src/lib/fedegolf/__fixtures__/listado-20.html'),
  'utf8'
)

const fixtureTrunca = readFileSync(
  resolve(process.cwd(), 'src/lib/fedegolf/__fixtures__/listado-20-trunca.html'),
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

describe('parseTarjetasUtilizadas', () => {
  it('saca el conteo de la nota "N tarjetas Utilizadas"', () => {
    expect(parseTarjetasUtilizadas(fixtureTrunca)).toBe(8)
  })

  it('devuelve null si la página no trae la nota (fixture anterior a que existiera)', () => {
    // `listado-20.html` trae el `fede-disclaimer` VACÍO. null = "no se pudo
    // verificar", no error: ser estricto acá sería un apagón auto-infligido.
    expect(parseTarjetasUtilizadas(fixtureHtml)).toBeNull()
  })

  it('el conteo que publica la fede coincide con los diferenciales que elegimos', () => {
    // Cruza SLOTS, no rondas físicas: el campeonato son 2 filas seleccionadas
    // (7 tarjetas físicas → 8 slots) y la fede dice 8. Si alguien comparara
    // contra `rondasQueCuentan` daría 7 ≠ 8 y este test se pondría rojo.
    const r = resumenIndiceOficial(procesarTarjetas(fixtureTrunca))
    expect(r.rondasQueCuentan).toBe(7)
    expect(parseTarjetasUtilizadas(fixtureTrunca)).toBe(r.diferencialesQueCuentan.length)
  })

  // ── Con el anclaje PRESENTE y el markup roto ──────────────────────────────
  // Estos son los que faltaban: los casos sin "ÍNDICE ACTUAL" cortan en el
  // early-return y nunca llegan a ejecutar el regex, así que no prueban nada.

  it('no se come un número de más abajo en la página (ventana acotada)', () => {
    const lejos = '<h3>ÍNDICE ACTUAL</h3>' + 'x'.repeat(4000) + '<span>17 tarjetas Utilizadas</span>'
    expect(parseTarjetasUtilizadas(lejos)).toBeNull()
  })

  it('rechaza un conteo fuera de la ventana WHS en vez de inventarlo', () => {
    expect(parseTarjetasUtilizadas('<h3>ÍNDICE ACTUAL</h3> 2025 tarjetas Utilizadas')).toBeNull()
    expect(parseTarjetasUtilizadas('<h3>ÍNDICE ACTUAL</h3> 0 tarjetas Utilizadas')).toBeNull()
    expect(parseTarjetasUtilizadas('<h3>ÍNDICE ACTUAL</h3> 20 tarjetas Utilizadas')).toBe(20)
  })

  it('con el anclaje presente pero la nota ausente devuelve null, no NaN', () => {
    const r = parseTarjetasUtilizadas('<h3>ÍNDICE ACTUAL</h3><strong class="h5">9.1</strong>')
    expect(r).toBeNull()
    expect(Number.isNaN(r as unknown as number)).toBe(false)
  })

  it('tolera la Í como entidad HTML y el singular', () => {
    expect(parseTarjetasUtilizadas('<h3>&Iacute;NDICE ACTUAL</h3> 1 tarjeta Utilizada')).toBe(1)
  })

  it('sin el bloque de índice devuelve null', () => {
    expect(parseTarjetasUtilizadas('<html><body>otra cosa</body></html>')).toBeNull()
    expect(parseTarjetasUtilizadas('')).toBeNull()
  })
})

describe('formulaEsExplicable', () => {
  const base = {
    indiceDerivado: 9.1,
    oficialDelMismoInstante: 9.1,
    tarjetasUtilizadas: 8,
    diferencialesQueCuentan: 8,
  }

  it('todo cuadra → se explica', () => {
    expect(formulaEsExplicable(base)).toBe(true)
  })

  it('sin derivado no hay nada que explicar', () => {
    expect(formulaEsExplicable({ ...base, indiceDerivado: null })).toBe(false)
  })

  it('un décimo de diferencia basta para esconderla (sin tolerancia)', () => {
    // Éste es EL bug: con `Math.abs(dif) <= 0.1` esto daba true y la pantalla
    // mostraba 9.1 arriba y 9.2 al final de la fórmula.
    expect(formulaEsExplicable({ ...base, indiceDerivado: 9.2 })).toBe(false)
  })

  it('si el conteo de la fede no cuadra, se esconde aunque el número dé', () => {
    // Selección mal hecha que da el promedio correcto de casualidad.
    expect(formulaEsExplicable({ ...base, tarjetasUtilizadas: 7 })).toBe(false)
  })

  it('conteo null no bloquea (no se pudo verificar ≠ está mal)', () => {
    expect(formulaEsExplicable({ ...base, tarjetasUtilizadas: null })).toBe(true)
  })

  it('sin oficial del mismo instante NO se compara contra nada', () => {
    // Nunca contra `profiles.indice`: tiene cooldown de 24h y compararlo contra
    // una derivación en vivo es justamente el bug que este guard provocaba.
    expect(formulaEsExplicable({ ...base, oficialDelMismoInstante: null })).toBe(true)
    expect(
      formulaEsExplicable({ ...base, indiceDerivado: 4.2, oficialDelMismoInstante: null })
    ).toBe(true)
  })

  it('un índice 0 (scratch) se compara, no se trata como ausente', () => {
    expect(
      formulaEsExplicable({ ...base, indiceDerivado: 0, oficialDelMismoInstante: 0 })
    ).toBe(true)
    expect(
      formulaEsExplicable({ ...base, indiceDerivado: 0.5, oficialDelMismoInstante: 0 })
    ).toBe(false)
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

describe('truncarIndiceFedegolf', () => {
  it('trunca al primer decimal, no redondea', () => {
    expect(truncarIndiceFedegolf(9.3625)).toBe(9.3)
    expect(truncarIndiceFedegolf(9.19)).toBe(9.1)
    expect(truncarIndiceFedegolf(12.99)).toBe(12.9)
  })

  it('no se come un decimal por error de float al promediar', () => {
    // El error NO está en `8.7 * 10` (V8 da 87 exacto): está en la suma y la
    // división que producen el promedio crudo. Estos dos son promedios de
    // diferenciales reales que sin el epsilon bajan un décimo — y además
    // rompen el guard del modal, escondiendo la pantalla entera.
    expect((15.5 + 37.1 + 24.2) / 3).not.toBe(25.6) // 25.599999999999998
    expect(truncarIndiceFedegolf((15.5 + 37.1 + 24.2) / 3)).toBe(25.6)
    expect(truncarIndiceFedegolf((17.3 + 7 + 33.8 + 12.4 + 4 + 16.1 + 0.6 + 22.6 + 7.7) / 9)).toBe(
      13.5
    )
  })

  it('con índices plus hace floor — convención de la fede NO verificada (TODO: medir)', () => {
    // -1.25 → -1.3 es floor, no truncado hacia cero (que daría -1.2). La
    // evidencia del 3-ago cubre sólo el lado positivo. Esto documenta lo que
    // el código HACE, no lo que la fede hace: no tomarlo por spec. El modo de
    // falla es seguro (el guard esconde la fórmula, el hero no miente).
    expect(truncarIndiceFedegolf(-1.25)).toBe(-1.3)
  })
})

describe('resumenIndiceOficial', () => {
  it('el índice derivado cuadra con el índice oficial (9.1)', () => {
    const { indiceDerivado } = resumenIndiceOficial(procesarTarjetas(fixtureHtml))
    expect(indiceDerivado).toBe(9.1)
  })

  it('expone el promedio crudo aparte del derivado (para explicar el truncado)', () => {
    const r = resumenIndiceOficial(procesarTarjetas(fixtureHtml))
    expect(r.promedioCrudo).toBeCloseTo(9.1375, 6)
    expect(r.indiceDerivado).toBe(9.1)
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

  it('sin tarjetas que cuenten → derivado null, sin crash', () => {
    const r = resumenIndiceOficial([])
    expect(r.promedioCrudo).toBeNull()
    expect(r.indiceDerivado).toBeNull()
    expect(r.diferencialesQueCuentan).toEqual([])
    expect(r.slotsVentana).toBe(0)
  })
})

/**
 * CANARIO DISCRIMINANTE — el fixture de arriba (oficial 9.1) promedia 9.1375, y
 * ahí redondear y truncar dan lo mismo: pasaba en verde con el código roto.
 * Este fixture es el estado real del 3-ago-2026, donde las dos convenciones se
 * separan, y es el único que puede volver a poner en rojo esta regresión.
 */
describe('convención de redondeo (fixture discriminante, oficial 9.3)', () => {
  const htmlTrunca = readFileSync(
    resolve(process.cwd(), 'src/lib/fedegolf/__fixtures__/listado-20-trunca.html'),
    'utf8'
  )
  const INDICE_OFICIAL_MEDIDO = 9.3 // leído de fedegolf.cl en la misma corrida

  it('el promedio crudo cae justo donde redondear y truncar difieren', () => {
    const r = resumenIndiceOficial(procesarTarjetas(htmlTrunca))
    expect(r.diferencialesQueCuentan).toEqual([7.2, 8.8, 8.9, 8.9, 9.5, 9.7, 10.5, 11.4])
    expect(r.promedioCrudo).toBeCloseTo(9.3625, 6)
    // Si esto dejara de cumplirse, el test ya no estaría probando nada.
    expect(Math.round(r.promedioCrudo! * 10) / 10).not.toBe(INDICE_OFICIAL_MEDIDO)
  })

  it('el derivado es el índice oficial — truncando, no redondeando', () => {
    const r = resumenIndiceOficial(procesarTarjetas(htmlTrunca))
    expect(r.indiceDerivado).toBe(INDICE_OFICIAL_MEDIDO)
  })

  it('el guard del modal exige coincidencia exacta al decimal mostrado', () => {
    const r = resumenIndiceOficial(procesarTarjetas(htmlTrunca))
    // Réplica del predicado de FedegolfIndiceModal: con el derivado correcto
    // cuadra, y con el redondeado (el bug) NO — que es lo que escondía la
    // pantalla entera. Una tolerancia de ±0.1 daría true en ambos casos.
    const cuadra = (derivado: number) => derivado.toFixed(1) === INDICE_OFICIAL_MEDIDO.toFixed(1)
    expect(cuadra(r.indiceDerivado!)).toBe(true)
    expect(cuadra(Math.round(r.promedioCrudo! * 10) / 10)).toBe(false)
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

    const { tarjetas, tarjetasUtilizadas } = await fedegolfGetTarjetasIndice({
      cookie: 'PHPSESSID=abc',
    })

    expect(tarjetas).toHaveLength(19)
    // El conteo sale del MISMO fetch que las tarjetas (el índice oficial no:
    // ése lo trae `fedegolfGetIndice` por JSON).
    expect(tarjetasUtilizadas).toBeNull() // este fixture no trae la nota
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/publico/modVeinteMejoresPalos/listadoMejoresPalos.php')
    expect(opts.headers.Cookie).toBe('PHPSESSID=abc')
  })
})
