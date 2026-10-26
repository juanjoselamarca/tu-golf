/**
 * GET /api/en-vivo — scramble y foursome publican UNA fila por equipo.
 *
 * El puntaje de bola compartida vive en `ronda_equipos`; los jugadores quedan con
 * `scores` vacío toda la ronda. El feed los listaba a ellos: "Thru 0" y sin hoyos
 * en un scramble que iba en el 7, y el botón "Seguir" del feed no avisaba
 * (follow-up de la revisión del PR #634).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoyos9 = {
  parMap: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 4])) as Record<number, number>,
  holeDataMap: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, { numero: i + 1, par: 4, stroke_index: i + 1, yardaje: null }])),
  finalParTotal: 36,
}

type Ronda = Record<string, unknown>
function ronda(over: Ronda = {}): Ronda {
  return {
    id: 'r1', codigo: 'SCR1', course_name: 'Los Leones', course_id: 'c1', tees: 'azul', holes: 9,
    fecha: '2026-10-26', created_at: '2026-10-26T13:00:00+00:00', estado: 'en_curso', hoyo_inicio: 1,
    formato_juego: 'scramble', modo_juego: 'gross', recorridos: null,
    ronda_libre_jugadores: [
      { id: 'j1', nombre: 'Ana', user_id: 'u1', scores: {}, handicap: null, tees: 'azul' },
      { id: 'j2', nombre: 'Beto', user_id: null, scores: {}, handicap: 18, tees: 'azul' },
      { id: 'j3', nombre: 'Caro', user_id: null, scores: {}, handicap: 9, tees: 'azul' },
      { id: 'j4', nombre: 'Dani', user_id: null, scores: {}, handicap: 4, tees: 'azul' },
    ],
    ...over,
  }
}
const equipo = (id: string, ronda_id: string, nombre: string, scores: Record<string, number>) => ({
  id, ronda_id, nombre, handicap_equipo: 10, scores,
  ronda_equipo_jugadores: [{ jugador_id: 'j1', orden: 0 }, { jugador_id: 'j2', orden: 1 }],
})

let rondas: Ronda[] = []
let equipos: Array<ReturnType<typeof equipo>> = []
let errorEquipos: { message: string } | null = null
const consultas: Array<{ tabla: string; filtros: string[] }> = []

function query(tabla: string, data: unknown[]) {
  const registro = { tabla, filtros: [] as string[] }
  consultas.push(registro)
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'ilike']) {
    q[m] = (...args: unknown[]) => { registro.filtros.push(`${m}:${JSON.stringify(args)}`); return q }
  }
  const error = tabla === 'ronda_equipos' ? errorEquipos : null
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(error ? { data: null, error } : { data, error: null }).then(res)
  return q
}

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => query(t, t === 'rondas_libres' ? rondas : t === 'ronda_equipos' ? equipos : []),
  }),
}))
vi.mock('@/lib/data/ronda-libre-scorer', () => ({ cargarHoyosDelScorer: async () => hoyos9 }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { GET } from '@/app/api/en-vivo/route'

async function feed() {
  const res = await GET(new Request('http://localhost/api/en-vivo'))
  return (await res.json()) as { rondas: Array<Record<string, unknown>> }
}

beforeEach(() => {
  vi.clearAllMocks()
  consultas.length = 0
  errorEquipos = null
  rondas = [ronda()]
  equipos = [
    equipo('e1', 'r1', 'Los Tigres', { '1': 4, '2': 5, '3': 3 }),
    equipo('e2', 'r1', 'Las Águilas', { '1': 5 }),
  ]
})

describe('GET /api/en-vivo — scramble y foursome', () => {
  it('scramble en el hoyo 3: una fila por equipo con el avance del equipo, no 4 jugadores en cero', async () => {
    const { rondas: [r] } = await feed()
    expect(r.jugadores).toEqual([
      { id: 'e1', nombre: 'Los Tigres', holesCompleted: 3, totalGross: 12, vsPar: 0, stablefordPts: null, totalHoles: 9 },
      { id: 'e2', nombre: 'Las Águilas', holesCompleted: 1, totalGross: 5, vsPar: 1, stablefordPts: null, totalHoles: 9 },
    ])
    expect(r.maxHolesCompleted).toBe(3)
    // Personas en la ronda, no filas: la tarjeta sigue diciendo "4 jugadores".
    expect(r.totalJugadores).toBe(4)
  })

  it('foursome usa el mismo camino (motor de foursome) y publica bruto vs par', async () => {
    rondas = [ronda({ formato_juego: 'foursome', modo_juego: 'neto' })]
    const { rondas: [r] } = await feed()
    expect(r.jugadores).toMatchObject([{ nombre: 'Los Tigres', holesCompleted: 3, vsPar: 0 }, { nombre: 'Las Águilas', holesCompleted: 1, vsPar: 1 }])
    expect(JSON.stringify(r)).not.toMatch(/"handicap|neto/)
  })

  it('9 hoyos desde el 10: cuenta los hoyos 10..18 del equipo', async () => {
    rondas = [ronda({ hoyo_inicio: 10 })]
    equipos = [equipo('e1', 'r1', 'Los Tigres', { '10': 4, '11': 4, '1': 9 })]
    const { rondas: [r] } = await feed()
    expect(r.jugadores).toMatchObject([{ nombre: 'Los Tigres', holesCompleted: 2, vsPar: 0 }])
    expect(r.maxHolesCompleted).toBe(2)
  })

  it('scramble recién creado (equipos sin scores): filas en cero, no se cae', async () => {
    equipos = [equipo('e1', 'r1', 'Los Tigres', {})]
    const { rondas: [r] } = await feed()
    expect(r.jugadores).toMatchObject([{ nombre: 'Los Tigres', holesCompleted: 0, vsPar: 0 }])
    expect(captureError).not.toHaveBeenCalled()
  })

  it('los equipos de TODAS las rondas de bola compartida salen en UNA query; stroke play no la hace', async () => {
    rondas = [
      ronda(),
      ronda({ id: 'r2', codigo: 'SCR2' }),
      ronda({ id: 'r3', codigo: 'IND1', formato_juego: 'stroke_play', ronda_libre_jugadores: [{ id: 'j9', nombre: 'Eva', user_id: null, scores: { '1': 4 }, handicap: null, tees: 'azul' }] }),
    ]
    equipos = [equipo('e1', 'r1', 'Los Tigres', { '1': 4 }), equipo('e2', 'r2', 'Los Pumas', { '1': 3, '2': 4 })]
    const { rondas: feedRondas } = await feed()
    const deEquipos = consultas.filter(c => c.tabla === 'ronda_equipos')
    expect(deEquipos).toHaveLength(1)
    expect(deEquipos[0].filtros).toContain('in:["ronda_id",["r1","r2"]]')
    // Desempate por id: equipos insertados en el mismo INSERT comparten created_at.
    expect(deEquipos[0].filtros).toContain('order:["created_at"]')
    expect(deEquipos[0].filtros).toContain('order:["id"]')
    expect(feedRondas.map(r => [r.codigo, (r.jugadores as Array<{ nombre: string }>).map(j => j.nombre)])).toEqual([
      ['SCR1', ['Los Tigres']], ['SCR2', ['Los Pumas']], ['IND1', ['Eva']],
    ])

    consultas.length = 0
    rondas = [ronda({ formato_juego: 'stroke_play' })]
    await feed()
    expect(consultas.map(c => c.tabla)).not.toContain('ronda_equipos')
  })

  it('si falla la lectura de equipos, los scramble SALEN del feed (no se publican vacíos) y se registra; stroke play sigue', async () => {
    rondas = [
      ronda(),
      ronda({ id: 'r3', codigo: 'IND1', formato_juego: 'stroke_play', ronda_libre_jugadores: [{ id: 'j9', nombre: 'Eva', user_id: null, scores: { '1': 4 }, handicap: null, tees: 'azul' }] }),
    ]
    errorEquipos = { message: 'canceling statement due to statement timeout' }
    const { rondas: feedRondas } = await feed()
    expect(feedRondas.map(r => r.codigo)).toEqual(['IND1'])
    expect(captureError).toHaveBeenCalledWith(errorEquipos, expect.objectContaining({ context: 'api.en-vivo.equipos' }))
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'api.en-vivo.ronda', meta: { codigo: 'SCR1' } }))
  })
})
