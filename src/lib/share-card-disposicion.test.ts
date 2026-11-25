// 25-nov (ensayo scramble del sáb 28, revisión Fable PR C) — La imagen «Compartir resultado» de equipos
// de 18 hoyos arrancaba el ranking fijo en y=1200, dentro del panel blanco de la tarjeta (1015-1285):
// la fila 1 (el GANADOR, en blanco) quedaba blanco sobre blanco. Y sin golpes (equipos) pintaba la
// tarjeta vacía con un TOTAL «0 −72» falso. Canarios sobre el dibujo real, con un canvas que anota.
import { describe, it, expect } from 'vitest'
import { dibujarRondaLibre, dibujarTorneo, scoreDelTextoParaCompartir, tarjetaDeEquipos, type LeaderboardShareData, type ShareCardRondaLibre } from './share-card'

type Caja = { top: number; bottom: number }

/** Canvas que no dibuja: anota cada texto (con su y) y la caja de cada relleno blanco. */
function canvasQueAnota() {
  const textos: Array<{ t: string; y: number }> = []
  const panelesBlancos: Caja[] = []
  let ys: number[] = []
  const estado: Record<string, unknown> = {}
  const ctx = new Proxy(estado, {
    get: (_t, k) => {
      if (k === 'fillText') return (t: string, _x: number, y: number) => { textos.push({ t: String(t), y }) }
      if (k === 'beginPath') return () => { ys = [] }
      if (k === 'moveTo' || k === 'lineTo') return (_x: number, y: number) => { ys.push(y) }
      if (k === 'arcTo') return (_x1: number, y1: number, _x2: number, y2: number) => { ys.push(y1, y2) }
      if (k === 'fill') return () => {
        if (estado.fillStyle === '#ffffff' && ys.length > 0) panelesBlancos.push({ top: Math.min(...ys), bottom: Math.max(...ys) })
      }
      if (k === 'measureText') return (t: string) => ({ width: String(t).length * 10 })
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

  it('individual de 18 con tarjeta: birdies y cada fila del ranking quedan bajo el panel blanco', () => {
    const { ctx, textos, panelesBlancos } = canvasQueAnota()
    dibujarRondaLibre(ctx, individual18([{ nombre: 'Juanjo', score: 66, diff: -6 }, { nombre: 'Cristián', score: 70, diff: -2 }]), W, H)
    expect(panelesBlancos).toHaveLength(1)
    const panel = panelesBlancos[0]
    expect(panel.bottom).toBeGreaterThan(1200) // 18 hoyos: el panel pasa de la y fija de antes
    const debajo = [...yDe(textos, 'birdies'), ...yDe(textos, '1. Juanjo'), ...yDe(textos, '2. Cristián')]
    expect(debajo).toHaveLength(3)
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
