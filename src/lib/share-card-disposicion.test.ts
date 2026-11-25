// 25-nov (ensayo scramble del sáb 28, revisión Fable PR C) — La imagen «Compartir resultado» de equipos
// de 18 hoyos arrancaba el ranking fijo en y=1200, dentro del panel blanco de la tarjeta (1015-1285):
// la fila 1 (el GANADOR, en blanco) quedaba blanco sobre blanco. Y sin golpes (equipos) pintaba la
// tarjeta vacía con un TOTAL «0 −72» falso. Canarios sobre el dibujo real, con un canvas que anota.
import { describe, it, expect } from 'vitest'
import { dibujarRondaLibre, dibujarTorneo, scoreDelTextoParaCompartir, tarjetaDeEquipos, type LeaderboardShareData, type ShareCardRondaLibre } from './share-card'

type Caja = { top: number; bottom: number }

/** Canvas que no dibuja: anota cada texto (con su y) y la caja de cada relleno blanco. */
function canvasQueAnota() {
  const textos: Array<{ t: string; x: number; y: number; color: unknown; ancho: number; alinea: unknown }> = []
  const panelesBlancos: Caja[] = []
  let ys: number[] = []
  const estado: Record<string, unknown> = {}
  // Ancho aproximado de Arial: 0.55 × px por carácter, con el px de la fuente vigente.
  const anchoDe = (t: string) => t.length * 0.55 * Number(/(\d+)px/.exec(String(estado.font ?? ''))?.[1] ?? 10)
  const ctx = new Proxy(estado, {
    get: (_t, k) => {
      if (k === 'fillText') return (t: string, _x: number, y: number) => { textos.push({ t: String(t), x: _x, y, color: estado.fillStyle, ancho: anchoDe(String(t)), alinea: estado.textAlign }) }
      if (k === 'beginPath') return () => { ys = [] }
      if (k === 'moveTo' || k === 'lineTo') return (_x: number, y: number) => { ys.push(y) }
      if (k === 'arcTo') return (_x1: number, y1: number, _x2: number, y2: number) => { ys.push(y1, y2) }
      if (k === 'fill') return () => {
        if (estado.fillStyle === '#ffffff' && ys.length > 0) panelesBlancos.push({ top: Math.min(...ys), bottom: Math.max(...ys) })
      }
      if (k === 'measureText') return (t: string) => ({ width: anchoDe(String(t)) })
      if (k in estado) return estado[k as string]
      return () => ({ addColorStop: () => {} })
    },
    set: (_t, k, v) => { estado[k as string] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, textos, panelesBlancos }
}

const W = 1080, H = 1920

const equipos = (n: number, empate = false): LeaderboardShareData => ({
  players: [], courseName: 'Los Leones', fecha: '28 nov 2026', rondaCodigo: 'ABC123', isFinished: true,
  totalHoles: 18, formato_juego: 'scramble', modo_juego: 'neto',
  teams: Array.from({ length: n }, (_, i) => ({
    nombre: `Equipo ${i + 1}`, jugadores: ['Ana', 'Beto'], score: 65 + (empate && i === 1 ? 0 : i), diff: -7 + (empate && i === 1 ? 0 : i), holesPlayed: 18,
  })),
})

const scores18 = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, i % 3 === 0 ? 3 : 4]))
const pars18 = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, 4]))
const individual18 = (ranking?: ShareCardRondaLibre['ranking']): ShareCardRondaLibre => ({
  tipo: 'ronda_libre', ganador: 'Juanjo', esEmpate: false, scoreGross: 66, scoreDiff: -6, courseName: 'Los Leones', fecha: '28 nov 2026',
  birdies: 6, eagles: 0, scoresByHole: scores18, parsByHole: pars18, holesPlayed: 18, formato_juego: 'stroke_play', modo_juego: 'gross', ranking,
})

const yDe = (textos: Array<{ t: string; y: number }>, texto: string) => textos.filter(x => x.t.includes(texto)).map(x => x.y)

describe('imagen de compartir — el ranking no se monta sobre la tarjeta', () => {
  it('equipos sin golpes: no hay panel blanco ni TOTAL falso, y el ranking se lee completo', () => {
    const { ctx, textos, panelesBlancos } = canvasQueAnota()
    dibujarRondaLibre(ctx, tarjetaDeEquipos(equipos(2))!, W, H)
    expect(panelesBlancos).toEqual([])
    expect(textos.map(x => x.t)).not.toContain('TOTAL')
    expect(textos.map(x => x.t)).not.toContain('-72')
    expect(yDe(textos, '1. Equipo 1')).toHaveLength(1)
    expect(yDe(textos, '2. Equipo 2')).toHaveLength(1)
  })

  it('cuatro equipos: las cuatro filas caben antes del bloque inferior (CTA en H − 380)', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, tarjetaDeEquipos(equipos(4))!, W, H)
    const filas = [1, 2, 3, 4].flatMap(i => yDe(textos, `${i}. Equipo ${i}`))
    expect(filas).toHaveLength(4)
    for (const y of filas) expect(y).toBeLessThan(H - 380)
  })

  it('individual de 18 con tarjeta: los birdies quedan bajo el panel blanco', () => {
    const { ctx, textos, panelesBlancos } = canvasQueAnota()
    dibujarRondaLibre(ctx, individual18(), W, H)
    expect(panelesBlancos).toHaveLength(1)
    const panel = panelesBlancos[0]
    expect(panel.bottom).toBeGreaterThan(1200) // 18 hoyos: el panel pasa de la y fija de antes
    const debajo = yDe(textos, 'birdies')
    expect(debajo).toHaveLength(1)
    // El texto se dibuja sobre su línea base: su parte alta (~30px) también debe quedar fuera del panel.
    for (const y of debajo) expect(y - 30).toBeGreaterThanOrEqual(panel.bottom)
  })
})

describe('imagen de compartir — equipos en ronda neta', () => {
  it('el número grande es el vs par con «neto» (como la pantalla), no el total neto con «bajo par»', () => {
    const { ctx, textos } = canvasQueAnota()
    const tarjeta = tarjetaDeEquipos(equipos(2))!
    dibujarRondaLibre(ctx, tarjeta, W, H)
    const t = textos.map(x => x.t)
    expect(t).toContain('-7')
    expect(t).toContain('neto')
    expect(t).not.toContain('65')
    expect(scoreDelTextoParaCompartir(tarjeta)).toBe('-7 neto')
  })
  it('empate neto: también dice «neto»', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, tarjetaDeEquipos(equipos(2, true))!, W, H)
    expect(textos.map(x => x.t)).toContain('neto')
  })
  it('ronda gross: sigue el total bruto con su vs par', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, tarjetaDeEquipos({ ...equipos(2), modo_juego: 'gross' })!, W, H)
    const t = textos.map(x => x.t)
    expect(t).toContain('65')
    expect(t).not.toContain('neto')
  })
})

describe('imagen de compartir de torneo — misma regla', () => {
  it('los birdies van bajo el panel de 18 hoyos, no encima (antes: y fija 1200 dentro del panel)', () => {
    const { ctx, textos, panelesBlancos } = canvasQueAnota()
    dibujarTorneo(ctx, { tipo: 'torneo', torneoNombre: 'Copa', jugadorNombre: 'Juanjo', posicion: 1, totalJugadores: 20, scoreGross: 66, scoreDiff: -6, courseName: 'Los Leones', fecha: '28 nov 2026', birdies: 6, eagles: 0, scoresByHole: scores18, parsByHole: pars18, formato_juego: 'stroke_play' }, W, H)
    expect(panelesBlancos).toHaveLength(1)
    const [y] = yDe(textos, 'birdies')
    expect(y - 30).toBeGreaterThanOrEqual(panelesBlancos[0].bottom)
  })
})

/** El bloque inferior (CTA) arranca en H − 380; las líneas base del ranking deben quedar 24px antes. */
const TECHO_CTA = H - 380 - 24

describe('imagen de compartir — tope de filas del ranking', () => {
  it('nueve equipos: 7 filas con nombre y cierra con «+2 más», todo antes del CTA', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, tarjetaDeEquipos(equipos(9))!, W, H)
    const conNombre = textos.filter(x => /^\d+\. Equipo \d$/.test(x.t))
    expect(conNombre.map(x => x.t)).toEqual([1, 2, 3, 4, 5, 6, 7].map(i => `${i}. Equipo ${i}`))
    const [mas] = textos.filter(x => x.t === '+2 más')
    expect(mas).toBeDefined()
    for (const { y } of [...conNombre, mas]) expect(y).toBeLessThanOrEqual(TECHO_CTA)
  })
  it('ocho equipos caben enteros: sin «más»', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, tarjetaDeEquipos(equipos(8))!, W, H)
    expect(textos.filter(x => /^\d+\. Equipo \d$/.test(x.t))).toHaveLength(8)
    expect(textos.some(x => x.t.endsWith(' más'))).toBe(false)
  })
  const ranking4 = ['Juanjo', 'Cristián', 'Max', 'Pedro'].map((nombre, i) => ({ nombre, score: 66 + i, diff: -6 + i }))
  const delRanking = (textos: Array<{ t: string; y: number }>) => textos.filter(x => /^\d+\. /.test(x.t) || x.t.endsWith(' más'))
  it('tarjeta de 18 sin birdies + ranking de 4: caben 2 filas, no 3 → sin ranking (truncar exige 2 nombres)', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, { ...individual18(ranking4), birdies: 0 }, W, H)
    expect(delRanking(textos)).toEqual([])
  })
  it('tarjeta de 18 sin birdies + ranking de 2: las 2 filas completas, sin «más»', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, { ...individual18(ranking4.slice(0, 2)), birdies: 0 }, W, H)
    expect(delRanking(textos).map(x => x.t)).toEqual(['1. Juanjo', '2. Cristián'])
    for (const { y } of delRanking(textos)) expect(y).toBeLessThanOrEqual(TECHO_CTA)
  })
  it('tarjeta de 18 + birdies + ranking de 4: no cabe ni dos filas → sin ranking (nada pisa el panel ni el CTA)', () => {
    const { ctx, textos, panelesBlancos } = canvasQueAnota()
    dibujarRondaLibre(ctx, individual18(ranking4), W, H)
    expect(panelesBlancos).toHaveLength(1)
    expect(delRanking(textos)).toEqual([])
  })
  it('tarjeta de 9 + birdies + ranking de 4: 2 filas y «+2 más», bajo el panel y antes del CTA', () => {
    const { ctx, textos, panelesBlancos } = canvasQueAnota()
    const nueve = { ...individual18(ranking4), holesPlayed: 9, scoresByHole: Object.fromEntries(Object.entries(scores18).slice(0, 9)) }
    dibujarRondaLibre(ctx, nueve, W, H)
    const filas = delRanking(textos)
    expect(filas.map(x => x.t)).toEqual(['+2 más', '1. Juanjo', '2. Cristián'])
    for (const { y } of filas) {
      expect(y - 30).toBeGreaterThanOrEqual(panelesBlancos[0].bottom)
      expect(y).toBeLessThanOrEqual(TECHO_CTA)
    }
  })
})

describe('imagen de compartir — colores legibles sobre el fondo oscuro', () => {
  it('el −7 del ganador ya no va en el azul oscuro #0B6BA6 (2.4:1); doble+ no va en #DC3B2E (3:1)', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, tarjetaDeEquipos({ ...equipos(2), teams: [...equipos(2).teams!.slice(0, 1), { nombre: 'Equipo 2', jugadores: [], score: 75, diff: 3, holesPlayed: 18 }] })!, W, H)
    const colores = textos.filter(x => x.t === '-7' || x.t.includes('(+3)')).map(x => x.color)
    expect(colores).toEqual(['#60A5FA', '#F87171'])
  })
  it('ronda neta: cada fila dice que su total es neto', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, tarjetaDeEquipos(equipos(2))!, W, H)
    expect(textos.map(x => x.t)).toEqual(expect.arrayContaining(['65 neto (-7)', '66 neto (-6)']))
  })
})

describe('imagen de compartir — nombres largos en el ranking', () => {
  const largo = 'Los Cóndores de Chicureo y Las Águilas del Sur Club'.slice(0, 50) // 50 caracteres
  const lb = (nombre: string) => tarjetaDeEquipos({ ...equipos(2), teams: [{ nombre, jugadores: [], score: 65, diff: -7, holesPlayed: 18 }, { nombre: 'Equipo 2', jugadores: [], score: 66, diff: -6, holesPlayed: 18 }] })!
  const fila = (textos: Array<{ t: string; x: number; ancho: number; alinea: unknown }>, empieza: string) => textos.find(x => x.t.startsWith(empieza) && x.alinea === 'left')!
  const score = (textos: Array<{ t: string; x: number; ancho: number; alinea: unknown }>, t: string) => textos.find(x => x.t === t && x.alinea === 'right')!
  it('un nombre de 50 caracteres no choca con su score (24px de aire)', () => {
    expect(largo).toHaveLength(50)
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, lb(largo), W, H)
    const n = fila(textos, '1. ')
    const s = score(textos, '65 neto (-7)')
    expect(n.x + n.ancho).toBeLessThanOrEqual(s.x - s.ancho - 24)
  })
  it('si ni achicado cabe, se corta con «…»', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, lb(largo + ' ' + largo), W, H)
    const n = fila(textos, '1. ')
    expect(n.t.endsWith('…')).toBe(true)
    const s = score(textos, '65 neto (-7)')
    expect(n.x + n.ancho).toBeLessThanOrEqual(s.x - s.ancho - 24)
  })
  it('un nombre corto queda igual', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, lb('Los Ross'), W, H)
    expect(fila(textos, '1. ').t).toBe('1. Los Ross')
  })
})

describe('imagen de compartir — escala de totales (no la de un hoyo)', () => {
  it('bajo par, par y sobre par; un +1 de total no va en dorado de bogey ni un −1 en celeste de birdie', () => {
    const { ctx, textos } = canvasQueAnota()
    const teams = [[-1, 71], [0, 72], [1, 73], [3, 75]].map(([diff, score], i) => ({ nombre: `E${i}`, jugadores: [], score, diff, holesPlayed: 18 }))
    dibujarRondaLibre(ctx, tarjetaDeEquipos({ ...equipos(2), modo_juego: 'gross', teams })!, W, H)
    const color = (t: string) => textos.find(x => x.t === t && x.alinea === 'right')?.color
    expect([color('71 (-1)'), color('72 (E)'), color('73 (+1)'), color('75 (+3)')]).toEqual(['#60A5FA', '#c9a84c', '#F87171', '#F87171'])
  })
  it('«+N más» y los nombres que no lideran van a 55 % de blanco (45 % daba 4.0:1 en la caja)', () => {
    const { ctx, textos } = canvasQueAnota()
    dibujarRondaLibre(ctx, tarjetaDeEquipos(equipos(9))!, W, H)
    expect(textos.find(x => x.t === '+2 más')?.color).toBe('rgba(255,255,255,0.55)')
    expect(textos.find(x => x.t === '2. Equipo 2')?.color).toBe('rgba(255,255,255,0.55)')
  })
})
