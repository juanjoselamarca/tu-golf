// Grupo nuevo / borrar grupo vacío con el torneo en juego (#814 · PR4): nombre por defecto, la tarjeta que se manda a
// la RPC (la misma del inicio), reintentos por código y nombre, y el mapeo de motivos. La regla vive en la RPC y se
// prueba en scripts/ci/pruebas-sql/grupo-en-juego.sql.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockCapture = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => mockCapture(...a) }))

import { borrarGrupoEnJuego, crearGrupoEnJuego, nombreDeGrupoNuevo } from './grupoEnJuego'
import { tarjetaDeGrupoDeTorneo } from './startTournament'
import type { TorneoParaEditar } from './editarHandicapInscrito'
import { mensajeDeMotivo } from '@/golf/torneo/gestion-en-juego'

const torneo = (extra: Partial<TorneoParaEditar> = {}): TorneoParaEditar => ({
  id: 'T',
  organizer_id: 'org',
  status: 'in_progress',
  format: null,
  formato_juego: 'stroke_play',
  modo_juego: 'neto',
  hcp_pct: 85,
  tees: 'azul',
  course_name: 'Club',
  course_id: 'C',
  hole_count: 18,
  date_start: '2026-11-19',
  total_rounds: 1,
  courses: { nombre: 'Club de Golf', slope_rating: 120, course_rating: 70, par_total: 72 },
  ...extra,
})

let nombres: Array<{ name: string }>
let lecturaError: unknown
const rpc = vi.fn()
const svc = {
  from: () => ({ select: () => ({ eq: async () => ({ data: lecturaError ? null : nombres, error: lecturaError }) }) }),
  rpc: (...a: unknown[]) => rpc(...a),
} as unknown as SupabaseClient

beforeEach(() => {
  nombres = [{ name: 'Grupo 1' }, { name: 'Grupo 2' }]
  lecturaError = null
  rpc.mockReset()
  mockCapture.mockReset()
})

describe('nombreDeGrupoNuevo', () => {
  it('sigue la convención del panel: "Grupo N" / "Equipo N" desde la cantidad + 1', () => {
    expect(nombreDeGrupoNuevo('stroke_play', ['Grupo 1', 'Grupo 2'])).toBe('Grupo 3')
    expect(nombreDeGrupoNuevo('scramble', ['A', 'B'])).toBe('Equipo 3')
    expect(nombreDeGrupoNuevo('best_ball', [])).toBe('Equipo 1')
    expect(nombreDeGrupoNuevo(null, [])).toBe('Grupo 1')
  })

  it('salta los números ya usados, sin mirar mayúsculas ni espacios', () => {
    expect(nombreDeGrupoNuevo('stroke_play', ['Grupo 1', ' grupo 3 ', 'GRUPO 4'])).toBe('Grupo 5')
  })
})

describe('tarjetaDeGrupoDeTorneo (fuente única con el inicio)', () => {
  it('hereda cancha, tees, hoyos, fecha, modo y % del torneo', () => {
    expect(tarjetaDeGrupoDeTorneo(torneo(), { courseId: 'C', holeCount: 18, date: '2026-11-19' }, 0)).toEqual({
      course_id: 'C', course_name: 'Club de Golf', tees: 'azul', holes: 18, fecha: '2026-11-19',
      formato_juego: 'stroke_play', modo_juego: 'neto', hcp_pct: 85,
    })
  })

  it('match play: solo un par anota match; vacío o trío, stroke play', () => {
    const t = torneo({ formato_juego: 'match_play' })
    const r = { courseId: 'C', holeCount: 18, date: '2026-11-19' }
    expect(tarjetaDeGrupoDeTorneo(t, r, 0).formato_juego).toBe('stroke_play')
    expect(tarjetaDeGrupoDeTorneo(t, r, 2).formato_juego).toBe('match_play')
    expect(tarjetaDeGrupoDeTorneo(t, r, 3).formato_juego).toBe('stroke_play')
  })

  it('sin fecha: el día de Chile', () => {
    const t = tarjetaDeGrupoDeTorneo(torneo(), { courseId: null, holeCount: 9, date: null }, 0, new Date('2026-11-20T02:00:00Z'))
    expect(t.fecha).toBe('2026-11-19')
    expect(t.holes).toBe(9)
  })
})

describe('crearGrupoEnJuego', () => {
  it('grupo nuevo: nombre por defecto y la tarjeta del inicio, vacía', async () => {
    rpc.mockResolvedValue({ data: { ok: true, group_id: 'G', ronda_libre_id: 'R', nombre: 'Grupo 3' }, error: null })
    const res = await crearGrupoEnJuego(svc, torneo(), { creatorId: 'org' })
    expect(res).toEqual({ ok: true, groupId: 'G', rondaLibreId: 'R', nombre: 'Grupo 3' })
    const [nombreRpc, args] = rpc.mock.calls[0]
    expect(nombreRpc).toBe('crear_grupo_en_juego')
    expect(args).toMatchObject({ p_tournament_id: 'T', p_group_id: null, p_nombre: 'Grupo 3' })
    const { codigo, creador_id, ...resto } = args.p_tarjeta
    expect(codigo).toMatch(/^T[0-9A-Z]+$/)
    expect(creador_id).toBe('org')
    expect(resto).toEqual(tarjetaDeGrupoDeTorneo(torneo(), { courseId: 'C', holeCount: 18, date: '2026-11-19' }, 0))
  })

  it('nombre elegido: se manda recortado y sin leer los grupos', async () => {
    rpc.mockResolvedValue({ data: { ok: true, group_id: 'G', ronda_libre_id: 'R', nombre: 'Los de atrás' }, error: null })
    lecturaError = new Error('no debería leer')
    await crearGrupoEnJuego(svc, torneo(), { nombre: '  Los de atrás ', creatorId: 'org' })
    expect(rpc.mock.calls[0][1].p_nombre).toBe('Los de atrás')
  })

  it('grupo existente: sin nombre (conserva el suyo)', async () => {
    rpc.mockResolvedValue({ data: { ok: true, group_id: 'G2', ronda_libre_id: 'R', nombre: 'Grupo 2' }, error: null })
    await crearGrupoEnJuego(svc, torneo(), { groupId: 'G2', creatorId: 'org' })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_group_id: 'G2', p_nombre: null })
  })

  it('código repetido: reintenta con otro código; agotados, error', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, motivo: 'codigo-repetido' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, group_id: 'G', ronda_libre_id: 'R', nombre: 'Grupo 3' }, error: null })
    expect((await crearGrupoEnJuego(svc, torneo(), { creatorId: 'org' })).ok).toBe(true)
    expect(rpc.mock.calls[0][1].p_tarjeta.codigo).not.toBe(rpc.mock.calls[1][1].p_tarjeta.codigo)

    rpc.mockReset().mockResolvedValue({ data: { ok: false, motivo: 'codigo-repetido' }, error: null })
    const res = await crearGrupoEnJuego(svc, torneo(), { nombre: 'X', creatorId: 'org' })
    expect(res).toMatchObject({ ok: false, motivo: 'error' })
    expect(rpc).toHaveBeenCalledTimes(3)
  })

  it('nombre por defecto que choca (otro lo creó entretanto): relee y reintenta una vez', async () => {
    rpc.mockImplementationOnce(async () => {
      nombres = [{ name: 'Grupo 1' }, { name: 'Grupo 2' }, { name: 'Grupo 3' }]
      return { data: { ok: false, motivo: 'nombre-repetido' }, error: null }
    }).mockResolvedValueOnce({ data: { ok: true, group_id: 'G', ronda_libre_id: 'R', nombre: 'Grupo 4' }, error: null })
    expect((await crearGrupoEnJuego(svc, torneo(), { creatorId: 'org' })).ok).toBe(true)
    expect(rpc.mock.calls.map((c) => c[1].p_nombre)).toEqual(['Grupo 3', 'Grupo 4'])
  })

  it('nombre elegido repetido: no reintenta y dice grupo o equipo según el formato', async () => {
    rpc.mockResolvedValue({ data: { ok: false, motivo: 'nombre-repetido' }, error: null })
    expect(await crearGrupoEnJuego(svc, torneo(), { nombre: 'Grupo 1', creatorId: 'org' }))
      .toEqual({ ok: false, motivo: 'nombre-repetido', mensaje: 'Ya hay un grupo con ese nombre.' })
    expect(await crearGrupoEnJuego(svc, torneo({ formato_juego: 'scramble' }), { nombre: 'E', creatorId: 'org' }))
      .toEqual({ ok: false, motivo: 'nombre-repetido', mensaje: 'Ya hay un equipo con ese nombre.' })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('motivos compartidos con colocar usan su mismo copy', async () => {
    rpc.mockResolvedValue({ data: { ok: false, motivo: 'torneo-no-en-juego' }, error: null })
    expect(await crearGrupoEnJuego(svc, torneo(), { nombre: 'X', creatorId: 'org' }))
      .toEqual({ ok: false, motivo: 'torneo-no-en-juego', mensaje: mensajeDeMotivo('torneo-no-en-juego') })
  })

  it('tarjeta distinta: niega y avisa a Sentry', async () => {
    rpc.mockResolvedValue({ data: { ok: false, motivo: 'tarjeta-distinta' }, error: null })
    expect((await crearGrupoEnJuego(svc, torneo(), { nombre: 'X', creatorId: 'org' }))).toMatchObject({ ok: false, motivo: 'tarjeta-distinta' })
    expect(mockCapture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'grupo-en-juego.tarjeta-distinta' }))
  })

  it('error de la RPC, respuesta desconocida o lectura fallida: error y Sentry', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await crearGrupoEnJuego(svc, torneo(), { nombre: 'X', creatorId: 'org' })).toMatchObject({ ok: false, motivo: 'error' })
    rpc.mockResolvedValueOnce({ data: { ok: false, motivo: 'raro' }, error: null })
    expect(await crearGrupoEnJuego(svc, torneo(), { nombre: 'X', creatorId: 'org' })).toMatchObject({ ok: false, motivo: 'error' })
    lecturaError = { message: 'sin red' }
    expect(await crearGrupoEnJuego(svc, torneo(), { creatorId: 'org' })).toMatchObject({ ok: false, motivo: 'error' })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(mockCapture).toHaveBeenCalledTimes(3)
  })
})

describe('borrarGrupoEnJuego', () => {
  it('ok: devuelve la tarjeta borrada', async () => {
    rpc.mockResolvedValue({ data: { ok: true, ronda_libre_id: 'R' }, error: null })
    expect(await borrarGrupoEnJuego(svc, torneo(), 'G')).toEqual({ ok: true, groupId: 'G', rondaLibreId: 'R', nombre: null })
    expect(rpc).toHaveBeenCalledWith('borrar_grupo_en_juego', { p_tournament_id: 'T', p_group_id: 'G' })
  })

  it('con jugadores o golpes: niega con su motivo', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, motivo: 'grupo-con-jugadores' }, error: null })
    expect(await borrarGrupoEnJuego(svc, torneo(), 'G')).toMatchObject({ ok: false, motivo: 'grupo-con-jugadores' })
    rpc.mockResolvedValueOnce({ data: { ok: false, motivo: 'grupo-con-golpes' }, error: null })
    expect(await borrarGrupoEnJuego(svc, torneo(), 'G')).toMatchObject({ ok: false, motivo: 'grupo-con-golpes' })
  })

  it('error o respuesta desconocida: error y Sentry', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await borrarGrupoEnJuego(svc, torneo(), 'G')).toMatchObject({ ok: false, motivo: 'error' })
    rpc.mockRejectedValueOnce(new Error('red'))
    expect(await borrarGrupoEnJuego(svc, torneo(), 'G')).toMatchObject({ ok: false, motivo: 'error' })
    expect(mockCapture).toHaveBeenCalledTimes(2)
  })
})
