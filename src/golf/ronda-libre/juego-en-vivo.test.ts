import { describe, expect, it } from 'vitest'
import { crearConfigDePlantilla, formatPuntosConUnidad, type ConfigJuego } from '@/golf/formats/personalizado'
import {
  estadoDelTramo,
  etiquetasUnicas,
  fraseDelEstado,
  ganadorDelHoyoDeParejas,
  indiceDelTramoDestacado,
  letrasDeLosPuntitos,
  rangoDeHoyos,
  tituloDelTramo,
} from './juego-en-vivo'
import { armarTablaDelJuego, TEXTO_NO_JUGO } from './tabla-del-juego'
import { COLOMBIANA, ID, IDS, NOMBRES, golpesDe, vistaDeTimba } from './__fixtures__/vista-timba'

const hoyo = (estado: 'puntuado' | 'pendiente' | 'sin_jugar', marcadorParejas: [number, number] | null = null, scoreDeJuego: Record<string, number | null | undefined> = {}) =>
  ({ estado, marcadorParejas, scoreDeJuego })

describe('ganadorDelHoyoDeParejas', () => {
  it('lee el marcador del hoyo del motor', () => {
    expect(ganadorDelHoyoDeParejas(hoyo('puntuado', [3, 1]))).toBe('a')
    expect(ganadorDelHoyoDeParejas(hoyo('puntuado', [0, 2]))).toBe('b')
    expect(ganadorDelHoyoDeParejas(hoyo('puntuado', [1, 1]))).toBe('empate')
    expect(ganadorDelHoyoDeParejas(hoyo('puntuado', [0, 0]))).toBe('empate')
    expect(ganadorDelHoyoDeParejas(hoyo('pendiente', [0, 0]))).toBe('pendiente')
    expect(ganadorDelHoyoDeParejas(hoyo('sin_jugar'))).toBe('sin_jugar')
  })
})

describe('estadoDelTramo', () => {
  it('por jugar, en juego (con cuántos quedan), terminado y no se jugó', () => {
    expect(estadoDelTramo([hoyo('pendiente'), hoyo('pendiente')])).toEqual({ tipo: 'por_jugar' })
    expect(estadoDelTramo([hoyo('puntuado'), hoyo('pendiente'), hoyo('pendiente')])).toEqual({ tipo: 'en_juego', quedan: 2 })
    // Un golpe anotado en el primer hoyo ya lo pone en juego aunque no se haya puntuado.
    expect(estadoDelTramo([hoyo('pendiente', null, { a: 4 }), hoyo('pendiente')])).toEqual({ tipo: 'en_juego', quedan: 2 })
    expect(estadoDelTramo([hoyo('puntuado'), hoyo('puntuado')])).toEqual({ tipo: 'terminado' })
    // Ronda cerrada antes de tiempo: los hoyos sin jugar no quedan pendientes.
    expect(estadoDelTramo([hoyo('puntuado'), hoyo('sin_jugar')])).toEqual({ tipo: 'terminado' })
    expect(estadoDelTramo([hoyo('sin_jugar'), hoyo('sin_jugar')])).toEqual({ tipo: 'no_se_jugo' })
  })
})

describe('indiceDelTramoDestacado', () => {
  const t = (tipo: 'por_jugar' | 'terminado' | 'no_se_jugo') => ({ tipo }) as const
  const enJuego = { tipo: 'en_juego', quedan: 3 } as const
  const destacado = (estados: Parameters<typeof indiceDelTramoDestacado>[0]['estados'], o: { scorer?: number; ultimo?: number; cerrada?: boolean } = {}) =>
    indiceDelTramoDestacado({ estados, tramoDelScorer: o.scorer ?? null, tramoDelUltimoHoyoConGolpes: o.ultimo ?? null, cerrada: o.cerrada ?? false })
  it('manda el hoyo del scorer', () => {
    expect(destacado([t('terminado'), enJuego, t('por_jugar')], { scorer: 0, ultimo: 1 })).toBe(0)
  })
  it('sin scorer: el tramo del último hoyo con golpes, aunque un tramo anterior tenga un hoyo sin anotar', () => {
    expect(destacado([enJuego, enJuego, t('por_jugar')], { ultimo: 1 })).toBe(1)
  })
  it('ese tramo terminó y el siguiente no parte: el siguiente; si el siguiente ya partió, manda el último con golpes', () => {
    expect(destacado([t('terminado'), t('por_jugar'), t('por_jugar')], { ultimo: 0 })).toBe(1)
    expect(destacado([t('terminado'), t('terminado')], { ultimo: 1 })).toBe(1)
  })
  it('sin golpes: el primero; sin tramos: -1', () => {
    expect(destacado([t('por_jugar'), t('por_jugar')])).toBe(0)
    expect(destacado([])).toBe(-1)
  })
  it('ronda cerrada antes de terminar: el último que se jugó, nunca el que no se jugó', () => {
    expect(destacado([t('terminado'), t('terminado'), t('no_se_jugo')], { ultimo: 1, cerrada: true })).toBe(1)
    expect(destacado([t('no_se_jugo'), t('no_se_jugo')], { cerrada: true })).toBe(0)
  })
})

describe('títulos y rangos de tramo', () => {
  it('seguidos "Hoyos 7 a 12"; pasando del 18 al 1 nunca "16 a 3"', () => {
    expect(tituloDelTramo([7, 8, 9, 10, 11, 12])).toBe('Hoyos 7 a 12')
    expect(tituloDelTramo([16, 17, 18, 1, 2, 3])).toBe('Hoyos 16–18 y 1–3')
    expect(tituloDelTramo([5])).toBe('Hoyo 5')
    expect(rangoDeHoyos([1, 2, 3])).toBe('1–3')
  })
})

describe('etiquetasUnicas (casillas inequívocas)', () => {
  it('una letra si alcanza', () => {
    expect(etiquetasUnicas(['Pancho', 'Cristóbal', 'Tomás', 'Nico'])).toEqual(['P', 'C', 'T', 'N'])
  })
  it('"Pancho" y "Pedro" se distinguen con dos letras; los demás siguen con una', () => {
    expect(etiquetasUnicas(['Pancho', 'Pedro', 'Tomás', 'Nico'])).toEqual(['Pa', 'Pe', 'T', 'N'])
  })
  it('mismo nombre: la inicial del apellido que ya trae el nombre corto', () => {
    expect(etiquetasUnicas(['Pancho E.', 'Pancho R.', 'Tomás', 'Nico'])).toEqual(['PE', 'PR', 'T', 'N'])
  })
  it('sin mayúscula ni acento de diferencia: "ángel" y "Ana" no chocan por mayúsculas', () => {
    const e = etiquetasUnicas(['ángel', 'Ana', 'Tomás'])
    expect(new Set(e.map(x => x.toUpperCase())).size).toBe(3)
  })
  it('nombres idénticos sin apellido: igual quedan distintas', () => {
    const e = etiquetasUnicas(['Pancho', 'Pancho', 'Tomás', 'Nico'])
    expect(new Set(e).size).toBe(4)
  })
  it('nunca más de 2 caracteres por jugador (la pareja cabe en una casilla de 30 px), ni con 12 jugadores', () => {
    const casos = [
      ['Pancho', 'Pablo', 'Patricio', 'Pedro'],
      ['Pancho Vial', 'Pablo Vera', 'Pancho Vial', 'Pía Valdés'],
      Array.from({ length: 12 }, () => 'Juan'),
    ]
    for (const nombres of casos) {
      const e = etiquetasUnicas(nombres)
      expect(e.every(x => x.length <= 2), e.join(',')).toBe(true)
      expect(new Set(e.map(x => x.toUpperCase())).size).toBe(nombres.length)
    }
  })
})

describe('letrasDeLosPuntitos', () => {
  it('G greenie, S sandy; dos que empiezan igual llevan más letras', () => {
    const l = letrasDeLosPuntitos([
      { id: 'g', tipo: 'greenie' }, { id: 's', tipo: 'sandy' }, { id: 'p', tipo: 'propio', nombre: 'Saque largo' },
    ])
    expect(l.g).toBe('G')
    expect(l.s).not.toBe(l.p)
    expect(l.s.startsWith('S') && l.p.startsWith('S')).toBe(true)
  })
})

describe('formatPuntosConUnidad', () => {
  it('con unidad y sin "+"', () => {
    expect(formatPuntosConUnidad(18)).toBe('18 pts')
    expect(formatPuntosConUnidad(1)).toBe('1 pt')
    expect(formatPuntosConUnidad(0)).toBe('0 pts')
    expect(formatPuntosConUnidad(-2)).toBe('−2 pts')
  })
})

describe('fraseDelEstado', () => {
  const base = { hoyosPuntuados: 9, hoyosSinJugar: 0, totalHoyos: 18, hayGolpes: true, hoyoDeSalida: 1 }
  const r = (nombre: string, puntos: number, puesto: number) => ({ nombre, puntos, puesto })
  it('un líder: "gana por N punto(s)" y cuántos hoyos quedan', () => {
    expect(fraseDelEstado({ ...base, ranking: [r('Pancho', 18, 1), r('Cristóbal', 17, 2), r('Nico', 10, 3)] }))
      .toEqual({ texto: 'Pancho gana por 1 punto', detalle: '9 de 18 hoyos · quedan 9', empezo: true })
    expect(fraseDelEstado({ ...base, ranking: [r('Pancho', 18, 1), r('Nico', 10, 2)] }).texto).toBe('Pancho gana por 8 puntos')
  })
  it('empate arriba, y todos empatados', () => {
    expect(fraseDelEstado({ ...base, ranking: [r('Pancho', 5, 1), r('Cristóbal', 5, 1), r('Nico', 1, 3)] }).texto)
      .toBe('Pancho y Cristóbal empatados')
    expect(fraseDelEstado({ ...base, ranking: [r('Pancho', 5, 1), r('Cristóbal', 5, 1)] }).texto).toBe('Todos empatados')
  })
  it('antes de partir: "Aún no parten" con desde dónde salen', () => {
    expect(fraseDelEstado({ ...base, hoyosPuntuados: 0, hayGolpes: false, hoyoDeSalida: 10, ranking: [r('Pancho', 0, 1), r('Nico', 0, 1)] }))
      .toEqual({ texto: 'Aún no parten', detalle: '18 hoyos · salen del 10', empezo: false })
  })
  it('todo jugado (sin cerrar) no dice "quedan 0"; cerrada dice "ganó"', () => {
    expect(fraseDelEstado({ ...base, hoyosPuntuados: 18, ranking: [r('Pancho', 3, 1), r('Nico', 1, 2)] }).detalle).toBe('18 de 18 hoyos')
    expect(fraseDelEstado({ ...base, cerrada: true, ranking: [r('Pancho', 3, 1), r('Nico', 1, 2)] }).texto).toBe('Pancho ganó por 2 puntos')
  })
  it('ronda cerrada sin un golpe: "No se jugó", no "Aún no parten"', () => {
    expect(fraseDelEstado({ ...base, hoyosPuntuados: 0, hayGolpes: false, cerrada: true, ranking: [r('Pancho', 0, 1), r('Nico', 0, 1)] }))
      .toEqual({ texto: 'No se jugó', detalle: '18 hoyos', empezo: false })
  })
  it('puntos negativos (2-0-2): la ventaja se cuenta igual', () => {
    expect(fraseDelEstado({ ...base, ranking: [r('Pancho', -1, 1), r('Nico', -3, 2)] }).texto).toBe('Pancho gana por 2 puntos')
  })
})

describe('armarTablaDelJuego — vista en vivo (La Colombiana de verdad)', () => {
  // Hoyos 1-9 jugados; en el 1 gana A+B (Pancho y Cristóbal) con birdie de Pancho.
  const scores = golpesDe([1, 2, 3, 4, 5, 6, 7, 8, 9], { 1: { [ID.pancho]: 3 }, 8: { [ID.nico]: 3 } })
  const v = vistaDeTimba({ config: COLOMBIANA, scores })
  const tabla = armarTablaDelJuego(v, NOMBRES, null)

  it('tres tramos: terminado, en juego (quedan 3) y por jugar, con títulos de hoyos', () => {
    expect(tabla.tramos.map(t => [t.titulo, t.estado])).toEqual([
      ['Hoyos 1 a 6', { tipo: 'terminado' }],
      ['Hoyos 7 a 12', { tipo: 'en_juego', quedan: 3 }],
      ['Hoyos 13 a 18', { tipo: 'por_jugar' }],
    ])
    expect(tabla.tramoDestacado).toBe(1)
  })

  it('las casillas siguen el marcador por hoyo del motor; etiqueta = iniciales de la pareja', () => {
    const t0 = tabla.tramos[0]
    expect(t0.parejas.map(p => [p.nombre, p.etiqueta])).toEqual([['Pancho y Cristóbal', 'PC'], ['Tomás y Nico', 'TN']])
    expect(t0.casillas.map(c => c.ganador)).toEqual(['a', 'empate', 'empate', 'empate', 'empate', 'empate'])
    const t1 = tabla.tramos[1]
    // Hoyo 8: birdie de Nico, que juega con Cristóbal (A+C vs B+D → Pancho y Tomás vs Cristóbal y Nico).
    expect(t1.parejas.map(p => p.nombre)).toEqual(['Pancho y Tomás', 'Cristóbal y Nico'])
    expect(t1.casillas.map(c => c.ganador)).toEqual(['empate', 'b', 'empate', 'pendiente', 'pendiente', 'pendiente'])
    for (const t of tabla.tramos) {
      for (const [i, c] of t.casillas.entries()) {
        const h = v.resultado.hoyos.find(x => x.numero === c.numero)!
        expect(c.numero).toBe(t.casillas[0].numero + i)
        if (c.ganador === 'a') expect(h.marcadorParejas![0]).toBeGreaterThan(h.marcadorParejas![1])
      }
    }
  })

  it('frase y ranking con unidad y distancia al primero', () => {
    const [primero, ...resto] = tabla.ranking
    expect(tabla.frase.empezo).toBe(true)
    expect(tabla.frase.detalle).toBe('9 de 18 hoyos · quedan 9')
    expect(primero.diferencia).toBeNull()
    expect(primero.textoConUnidad).toBe(`${primero.puntos} ${Math.abs(primero.puntos) === 1 ? 'pt' : 'pts'}`)
    for (const r of resto) {
      if (r.puntos < primero.puntos) expect(r.diferencia).toBe(`a ${formatPuntosConUnidad(primero.puntos - r.puntos)}`)
    }
  })

  it('el hoyo del scorer manda el duelo destacado', () => {
    expect(armarTablaDelJuego(v, NOMBRES, 3).tramoDestacado).toBe(0)
    expect(armarTablaDelJuego(v, NOMBRES, 14).tramoDestacado).toBe(2)
  })

  it('sin scorer, con un hoyo sin anotar atrás (el 4) y el grupo en el 9: destaca 7 a 12, no 1 a 6', () => {
    const s = golpesDe([1, 2, 3, 4, 5, 6, 7, 8, 9])
    delete s[ID.nico][4]
    const t = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: s }), NOMBRES, null)
    expect(t.tramos[0].estado.tipo).toBe('en_juego')
    expect(t.tramos[t.tramoDestacado].titulo).toBe('Hoyos 7 a 12')
  })

  it('tramo 1 a 6 terminado justo en el 6: destaca el que viene (7 a 12)', () => {
    const t = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: golpesDe([1, 2, 3, 4, 5, 6]) }), NOMBRES, null)
    expect(t.tramos[t.tramoDestacado].titulo).toBe('Hoyos 7 a 12')
  })

  it('ronda cerrada en el hoyo 12: destaca 7 a 12 (terminado), no "13 a 18 · No se jugó"', () => {
    const t = armarTablaDelJuego(
      vistaDeTimba({ config: COLOMBIANA, scores: golpesDe([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), cerrada: true }), NOMBRES, null,
    )
    expect(t.tramos.map(x => x.estado.tipo)).toEqual(['terminado', 'terminado', 'no_se_jugo'])
    expect(t.tramoDestacado).toBe(1)
  })

  it('ronda cerrada sin golpes: "No se jugó"', () => {
    const t = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: {}, cerrada: true }), NOMBRES, null)
    expect(t.frase.texto).toBe('No se jugó')
  })

  it('golpes recibidos: solo en neto y con todos con hándicap (predicado único de la tabla)', () => {
    expect(armarTablaDelJuego(v, NOMBRES, null).muestraGolpesRecibidos).toBe(false)
    const neto = vistaDeTimba({ config: COLOMBIANA, scores: golpesDe([1]), modo: 'neto' })
    expect(armarTablaDelJuego(neto, NOMBRES, null).muestraGolpesRecibidos).toBe(true)
  })

  it('0 hoyos: "Aún no parten", primer tramo destacado, sin filas', () => {
    const t = armarTablaDelJuego(
      vistaDeTimba({ config: COLOMBIANA, scores: {}, modo: 'neto', ch: { [ID.pancho]: 8, [ID.cristobal]: 12, [ID.tomas]: 16, [ID.nico]: 20 } }),
      NOMBRES, null,
    )
    expect(t.frase.texto).toBe('Aún no parten')
    expect(t.tramoDestacado).toBe(0)
    expect(t.tramos.every(x => x.estado.tipo === 'por_jugar')).toBe(true)
    expect(t.filas).toEqual([])
  })

  it('retirado: "se retiró" en el ranking, en los tramos que no juega y "—" en sus hoyos', () => {
    const s = golpesDe([1, 2, 3, 4, 5, 6, 7, 8, 9])
    delete s[ID.nico][8]
    delete s[ID.nico][9]
    const t = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: s, retiros: { [ID.nico]: 8 } }), NOMBRES, null)
    const nico = t.ranking.find(r => r.jugadorId === ID.nico)!
    expect(nico.retiradoDesde).toBe(8)
    expect(nico.diferencia).toBeNull()
    expect(t.tramos.map(x => x.retiros)).toEqual([[], ['Nico se retiró en el hoyo 8'], ['Nico se retiró en el hoyo 8']])
    const h8 = t.filas.find(f => f.tipo === 'hoyo' && f.numero === 8)
    expect(h8?.tipo === 'hoyo' && h8.celdas.find(c => c.jugadorId === ID.nico)).toMatchObject({ noJugo: true, texto: TEXTO_NO_JUGO })
  })

  it('9 hoyos: tramos de 3', () => {
    const t = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: golpesDe([1, 2, 3, 4]), holes: 9 }), NOMBRES, null)
    expect(t.tramos.map(x => x.titulo)).toEqual(['Hoyos 1 a 3', 'Hoyos 4 a 6', 'Hoyos 7 a 9'])
    expect(t.tramos.map(x => x.estado.tipo)).toEqual(['terminado', 'en_juego', 'por_jugar'])
    expect(t.frase.detalle).toBe('4 de 9 hoyos · quedan 5')
  })

  it('"Pancho" y "Pedro": las etiquetas de casilla no se confunden', () => {
    const t = armarTablaDelJuego(v, { ...NOMBRES, [ID.tomas]: 'Pedro Lira' }, null)
    expect(t.tramos[1].parejas.map(p => p.etiqueta)).toEqual(['PaPe', 'CN'])
  })

  it('puntos especiales: la letra va solo si el motor lo cuenta, y la leyenda solo con lo que aparece', () => {
    const cfg: ConfigJuego = {
      ...COLOMBIANA,
      puntitos: [
        { id: 'gr', tipo: 'greenie', valor: 1, destino: 'individual', activo: true },
        { id: 'sa', tipo: 'sandy', valor: 1, destino: 'individual', activo: true },
      ],
    }
    const t = armarTablaDelJuego(vistaDeTimba({
      config: cfg, scores: golpesDe([1, 2, 3]),
      // Sandy con par: cuenta. Greenie en par 4: el motor no lo cuenta (solo par 3) → no se muestra.
      marcas: [{ jugadorId: ID.tomas, hoyo: 2, puntitoId: 'sa' }, { jugadorId: ID.nico, hoyo: 2, puntitoId: 'gr' }],
    }), NOMBRES, null)
    const h2 = t.filas.find(f => f.tipo === 'hoyo' && f.numero === 2)
    const celda = (id: string) => (h2?.tipo === 'hoyo' ? h2.celdas.find(c => c.jugadorId === id) : undefined)
    expect(celda(ID.tomas)?.especiales).toEqual(['S'])
    expect(celda(ID.nico)?.especiales).toEqual([])
    expect(t.letrasEnLaTabla).toEqual([{ letra: 'S', nombre: 'sandy' }])
  })
})

describe('armarTablaDelJuego — juegos sin parejas y parejas fijas', () => {
  it('2-0-2 (individual, 3 jugadores): sin tramos ni duelo destacado; puntos negativos con unidad', () => {
    const ids = IDS.slice(0, 3)
    const t = armarTablaDelJuego(
      vistaDeTimba({ config: crearConfigDePlantilla('dos_cero_dos'), ids, scores: golpesDe([1], { 1: { [ID.pancho]: 3, [ID.tomas]: 5 } }, ids) }),
      NOMBRES, null,
    )
    expect(t.tramos).toEqual([])
    expect(t.tramoDestacado).toBe(-1)
    expect(t.ranking.map(r => r.textoConUnidad)).toEqual(['2 pts', '0 pts', '−2 pts'])
    expect(t.frase.texto).toBe('Pancho gana por 2 puntos')
  })
  it('parejas fijas: un solo tramo de toda la ronda', () => {
    const cfg: ConfigJuego = { ...crearConfigDePlantilla('subterranea'), parejas: [[0, 1], [2, 3]] }
    const t = armarTablaDelJuego(vistaDeTimba({ config: cfg, scores: golpesDe([1, 2]) }), NOMBRES, null)
    expect(t.tramos).toHaveLength(1)
    expect(t.tramos[0].titulo).toBe('Hoyos 1 a 18')
    expect(t.tramos[0].casillas).toHaveLength(18)
    expect(t.tramoDestacado).toBe(0)
  })
})
