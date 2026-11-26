/**
 * Editar los jugadores de un Skins antes del primer golpe: el mismo validador y el mismo congelado que al crear, los
 * ids de los que ya estaban se conservan, y la config la pone el servidor.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('./perfiles-existentes', () => ({ perfilesQueExisten: async (ids: readonly string[]) => new Set(ids.filter(id => id !== FANTASMA)) }))
import { clienteFalso, ok } from '@/__tests__/helpers/postgrest-falso'
import { CONFIG_SKINS_POR_DEFECTO } from '@/golf/formats/skins'
import { contextoDelSkinsGuardado } from '@/golf/ronda-libre/skins-congelado'
import { MENSAJE_HANDICAP_UN_DECIMAL } from '@/golf/handicap-index-range'
import { skinsParaCrearRonda } from './skins-ronda-nueva'
import {
  MENSAJE_EDITAR_JUGADOR_QUE_NO_ESTA, MENSAJE_EDITAR_QUITAR_CON_CUENTA, MENSAJE_EDITAR_SIN_CREADOR, prepararEdicionDelSkins,
  type JugadorEditado, type RondaDelSkinsAEditar,
} from './skins-editar'

const CREADOR = '11111111-1111-4111-8111-111111111111'
const PERFIL = '22222222-2222-4222-8222-222222222222'
const FANTASMA = '33333333-3333-4333-8333-333333333333'
const HOYOS = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: i % 6 === 0 ? 3 : 4, stroke_index: ((i * 7) % 18) + 1 }))
const tee = (slope: number, rating: number) => ok({ rating, slope, front_course_rating: null, front_slope_rating: null })
const cancha = () => ({ course_holes: [ok(HOYOS)], courses: [ok({ slope_rating: 140, course_rating: 73, par_total: 69 })], course_tees: [tee(140, 73)] })
const CONFIG = { ...CONFIG_SKINS_POR_DEFECTO, modo: 'neto' as const, pozoPorJugador: 15_000 }

/** Un Skins recién creado por la ruta de crear (mismo camino): Ana (creadora), Beto y Coni. */
async function rondaCreada(): Promise<{ ronda: RondaDelSkinsAEditar; ids: string[] }> {
  const ids = ['a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003']
  let n = 0
  const r = await skinsParaCrearRonda(clienteFalso(cancha()), {
    reglasJuego: CONFIG, modoDeLaRonda: 'neto', courseId: 'c1', holes: 18, hoyoInicio: 1, recorridos: null, tees: 'blanco',
    jugadores: [{ nombre: 'Ana', indice: 10.2 }, { nombre: 'Beto', indice: 24 }, { nombre: 'Coni', indice: 3.1, tees: 'azul' }],
    adminMode: true, nuevoId: () => ids[n++],
  })
  if (!r.ok) throw new Error(r.error)
  return {
    ids,
    ronda: {
      id: 'R1', creador_id: CREADOR, course_id: 'c1', course_name: 'Los Leones', holes: 18, hoyo_inicio: 1, recorridos: null,
      tees: 'blanco', modo_juego: 'neto', admin_mode: true, reglas_juego: r.reglas,
    },
  }
}

const pedidoBase = (ids: string[]): JugadorEditado[] => [
  { id: ids[0], nombre: 'Ana', user_id: CREADOR, handicap: 10.2, tees: null },
  { id: ids[1], nombre: 'Beto', user_id: null, handicap: 24, tees: null },
  { id: ids[2], nombre: 'Coni', user_id: null, handicap: 3.1, tees: 'azul' },
]

async function editar(ronda: RondaDelSkinsAEditar, ids: string[], pedido: JugadorEditado[]) {
  return prepararEdicionDelSkins(clienteFalso(cancha()), {
    ronda, creadorId: CREADOR, pedido,
    jugadoresActuales: ids.map((id, i) => ({ id, user_id: i === 0 ? CREADOR : null })),
  })
}

/** Lo que lee la tabla después de editar: congelado si calza con la ronda tal como quedó. */
async function origenTrasEditar(ronda: RondaDelSkinsAEditar, filas: { handicap: number | null; tees: string; nombre: string }[], reglas: unknown, jugadorIds: string[]) {
  return contextoDelSkinsGuardado({
    reglasJuego: reglas,
    ronda: {
      courseId: ronda.course_id!, holes: ronda.holes, hoyoInicio: ronda.hoyo_inicio, recorridos: ronda.recorridos, tees: ronda.tees,
      jugadores: filas.map(f => ({ indice: f.handicap, tees: f.tees })), nombres: filas.map(f => f.nombre),
    },
    jugadorIds,
    recalcular: async () => { throw new Error('no debería recalcular') },
  })
}

describe('prepararEdicionDelSkins', () => {
  it('cambiar un índice: conserva los ids, regraba lo congelado y la tabla lo lee como congelado', async () => {
    const { ronda, ids } = await rondaCreada()
    const antes = (ronda.reglas_juego as { congelado: { golpes: Record<string, number> } }).congelado.golpes
    const pedido = pedidoBase(ids)
    pedido[1] = { ...pedido[1], handicap: 18.4 }
    const r = await editar(ronda, ids, pedido)
    if (!r.ok) throw new Error(r.error)
    expect(r.filas.map(f => f.id)).toEqual(ids)
    expect(r.reglas.jugadorIds).toEqual(ids)
    expect(r.reglas.congelado!.golpes[ids[1]]).toBeLessThan(antes[ids[1]])
    expect(r.reglas.congelado!.golpes[ids[0]]).toBe(antes[ids[0]])
    const { origen, contexto } = await origenTrasEditar(ronda, r.filas, r.reglas, r.reglas.jugadorIds)
    expect(origen).toBe('congelado')
    expect(contexto.jugadores[1].courseHandicap).toBe(r.reglas.congelado!.golpes[ids[1]])
  })

  it('sumar y sacar: el nuevo recibe un id propio, el que sale no queda en las reglas', async () => {
    const { ronda, ids } = await rondaCreada()
    const pedido = [pedidoBase(ids)[0], pedidoBase(ids)[2], { nombre: ' Dani ', user_id: null, perfil_sugerido_id: PERFIL, handicap: 7, tees: 'rojo' }]
    const r = await editar(ronda, ids, pedido)
    if (!r.ok) throw new Error(r.error)
    expect(r.reglas.jugadorIds.slice(0, 2)).toEqual([ids[0], ids[2]])
    expect(r.reglas.jugadorIds[2]).toMatch(/^[0-9a-f-]{36}$/)
    expect(ids).not.toContain(r.reglas.jugadorIds[2])
    expect(Object.keys(r.reglas.congelado!.golpes)).toEqual(r.reglas.jugadorIds)
    expect(r.filas[2]).toMatchObject({ nombre: 'Dani', user_id: null, perfil_sugerido_id: PERFIL, tees: 'rojo', scores: {} })
    expect(r.filas[0].user_id).toBe(CREADOR)
    expect((await origenTrasEditar(ronda, r.filas, r.reglas, r.reglas.jugadorIds)).origen).toBe('congelado')
  })

  it('la config es la guardada y lo congelado se recalcula (nunca el que venía en la ronda)', async () => {
    const { ronda, ids } = await rondaCreada()
    const forjado = { ...(ronda.reglas_juego as object), congelado: { version: 1, golpes: { [ids[1]]: 99 } } }
    const r = await editar({ ...ronda, reglas_juego: forjado }, ids, pedidoBase(ids))
    if (!r.ok) throw new Error(r.error)
    expect(r.reglas.config).toEqual(CONFIG)
    expect(r.reglas.congelado!.golpes[ids[1]]).not.toBe(99)
  })

  it('cuenta sugerida de un jugador que ya estaba: sin la clave se conserva, null la quita, un uuid la cambia', async () => {
    const { ronda, ids } = await rondaCreada()
    const p = pedidoBase(ids)
    const r = await editar(ronda, ids, [p[0], { ...p[1], perfil_sugerido_id: null }, { ...p[2], perfil_sugerido_id: PERFIL }])
    if (!r.ok) throw new Error(r.error)
    expect('perfil_sugerido_id' in r.filas[0]).toBe(false)
    expect(r.filas[1].perfil_sugerido_id).toBeNull()
    expect(r.filas[2].perfil_sugerido_id).toBe(PERFIL)
    const sinClave = await editar(ronda, ids, p)
    if (!sinClave.ok) throw new Error(sinClave.error)
    expect(sinClave.filas.some(f => 'perfil_sugerido_id' in f)).toBe(false)
    // Un jugador nuevo con null entra sin cuenta sugerida (no hay nada que quitar).
    const nuevo = await editar(ronda, ids, [p[0], { nombre: 'Dani', user_id: null, perfil_sugerido_id: null, handicap: 7, tees: null }])
    if (!nuevo.ok) throw new Error(nuevo.error)
    expect('perfil_sugerido_id' in nuevo.filas[1]).toBe(false)
  })

  it('el creador no se saca ni cambia de lugar', async () => {
    const { ronda, ids } = await rondaCreada()
    const [a, b, c] = pedidoBase(ids)
    expect(await editar(ronda, ids, [b, c])).toEqual({ ok: false, status: 400, error: MENSAJE_EDITAR_SIN_CREADOR })
    expect(await editar(ronda, ids, [b, a, c])).toEqual({ ok: false, status: 400, error: MENSAJE_EDITAR_SIN_CREADOR })
  })

  // Revisión Fable #898 (P2-4): 409 para que la hoja caiga en «cerrar» y la pantalla recargue la lista.
  it('un id que no es de la ronda o repetido: 409 (lista vieja: cerrar y recargar)', async () => {
    const { ronda, ids } = await rondaCreada()
    const [a, b] = pedidoBase(ids)
    expect(await editar(ronda, ids, [a, { ...b, id: FANTASMA }])).toMatchObject({ status: 409, error: MENSAJE_EDITAR_JUGADOR_QUE_NO_ESTA })
    expect(await editar(ronda, ids, [a, b, b])).toMatchObject({ status: 409, error: MENSAJE_EDITAR_JUGADOR_QUE_NO_ESTA })
  })

  // Revisión Fable #898 (P2-1): antes llegaba a la función SQL (P0001 → 409 «cambiaron») y Editar quedaba en bucle.
  it('sacar a un jugador con cuenta (user_id): 400 con mensaje propio; dejarlo, ok', async () => {
    const { ronda, ids } = await rondaCreada()
    const [a, b, c] = pedidoBase(ids)
    const conCuenta = (pedido: JugadorEditado[]) => prepararEdicionDelSkins(clienteFalso(cancha()), {
      ronda, creadorId: CREADOR, pedido,
      jugadoresActuales: ids.map((id, i) => ({ id, user_id: i === 0 ? CREADOR : i === 1 ? 'u-beto' : null })),
    })
    expect(await conCuenta([a, c])).toEqual({ ok: false, status: 409, error: MENSAJE_EDITAR_QUITAR_CON_CUENTA })
    expect(await conCuenta([a, b])).toMatchObject({ ok: true })
  })

  it('valida igual que al crear: dos decimales, cuenta inexistente, índice faltante en neto', async () => {
    const { ronda, ids } = await rondaCreada()
    const p = pedidoBase(ids)
    expect(await editar(ronda, ids, [p[0], { ...p[1], handicap: 12.35 }])).toEqual({
      ok: false, status: 400, error: `Índice de Beto: ${MENSAJE_HANDICAP_UN_DECIMAL}`,
    })
    const conFantasma = await editar(ronda, ids, [p[0], { ...p[1], perfil_sugerido_id: FANTASMA }])
    expect(conFantasma).toMatchObject({ ok: false, status: 400 })
    expect(conFantasma.ok ? '' : conFantasma.error).toContain('Beto')
    const sinIndice = await editar(ronda, ids, [p[0], { ...p[1], handicap: null }])
    expect(sinIndice).toMatchObject({ ok: false, status: 400 })
    expect(await editar(ronda, ids, [p[0]])).toMatchObject({ ok: false, status: 400 })
  })
})
