/**
 * loadRoundForPush — los hoyos de la ronda salen de la fuente única
 * (hoyosDeLaVuelta): una cancha de 9 jugada a 18 son dos vueltas (review I-1).
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const catalogo9 = [4, 4, 3, 4, 5, 4, 3, 4, 5].map((par, i) => ({ numero: i + 1, par, stroke_index: i + 1, recorrido: null }))
vi.mock('@/lib/data/course-holes', () => ({ fetchHoyosDeLaRonda: vi.fn(async () => catalogo9) }))
vi.mock('@/lib/data/ronda-libre', () => ({ fetchRondaEquipos: vi.fn(async () => []) }))

import { loadRoundForPush, loadRoundAccess, isRoundParticipant } from './round-snapshot'
import { fetchRondaEquipos } from '@/lib/data/ronda-libre'

function fakeAdmin(row: Record<string, unknown> | null) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }) } as unknown as SupabaseClient
}

const base = {
  id: 'r1', codigo: 'DOSV', course_name: 'Cancha 9', course_id: 'c9', holes: 18, estado: 'en_curso',
  formato_juego: 'stroke_play', modo_juego: 'gross', creador_id: null, admin_user_id: null, recorridos: null,
}

describe('loadRoundForPush — cancha de 9 hoyos jugada a 18', () => {
  it('el hoyo 12 puntúa con el par del 3 (segunda vuelta), no par 4', async () => {
    // Hoyo 1 (par 4) con 5 → +1. Hoyo 12 = hoyo 3 del catálogo (par 3) con 3 → E.
    // Con el catálogo tal cual, el 12 no existiría y caería a par 4 → -1 → total E (mal).
    const snap = await loadRoundForPush(fakeAdmin({
      ...base,
      ronda_libre_jugadores: [{ id: 'j1', nombre: 'Ana Silva', user_id: null, scores: { '1': 5, '12': 3 } }],
    }), 'DOSV')
    expect(snap?.players[0]).toEqual({ nombre: 'Ana Silva', vsPar: 1, holesCompleted: 2, totalHoles: 18 })
    expect(snap?.participants.playerIds).toEqual(['j1'])
  })

  it('sin cancha ligada: par 4 en todos los hoyos (mismo fallback que el marcador)', async () => {
    const snap = await loadRoundForPush(fakeAdmin({
      ...base, course_id: null, holes: 9,
      ronda_libre_jugadores: [{ id: 'j1', nombre: 'Ana Silva', user_id: null, scores: { '9': 6 } }],
    }), 'DOSV')
    expect(snap?.players[0]).toMatchObject({ vsPar: 2, holesCompleted: 1 })
  })

  it('scramble de 9 desde el 10 sin cancha ligada: cuenta los hoyos 10..18 del equipo (la vuelta neutra es 1..9)', async () => {
    vi.mocked(fetchRondaEquipos).mockResolvedValueOnce([
      { id: 'e1', nombre: 'Los Tigres', handicap_equipo: 0, handicap_equipo_juego: null, jugadorIds: [], scores: { '10': 4, '11': 5 } },
    ])
    const snap = await loadRoundForPush(fakeAdmin({
      ...base, course_id: null, holes: 9, hoyo_inicio: 10, formato_juego: 'scramble',
      ronda_libre_jugadores: [{ id: 'j1', nombre: 'Ana Silva', user_id: null, scores: {} }],
    }), 'BACK9')
    expect(snap?.players).toEqual([{ nombre: 'Los Tigres', vsPar: 1, holesCompleted: 2, totalHoles: 9 }])
  })

  it('ronda inexistente → null', async () => {
    expect(await loadRoundForPush(fakeAdmin(null), 'NOPE')).toBeNull()
  })
})

describe('loadRoundAccess — quien anota un equipo desde su celular puede avisar', () => {
  const equipos = [
    { id: 'e1', handicap_origen: 'club', anotador_user_id: 'u-creador' },
    { id: 'e2', handicap_origen: 'club', anotador_user_id: 'u-pedro' },
    { id: 'e3', handicap_origen: 'club', anotador_user_id: null },
  ]
  const fila = { estado: 'en_curso', creador_id: 'u-creador', admin_user_id: null, formato_juego: 'scramble', ronda_libre_jugadores: [{ id: 'j1', user_id: 'u-creador' }] }

  it('un celular por equipo: el anotador de un equipo de club participa; un extraño no', async () => {
    const access = await loadRoundAccess(fakeAdmin({ ...fila, admin_mode: false, ronda_equipos: equipos }), 'X')
    expect(access?.participants.teamScorerUserIds).toEqual(['u-creador', 'u-pedro'])
    expect(isRoundParticipant(access!, 'u-pedro')).toBe(true)
    expect(isRoundParticipant(access!, 'u-extrano')).toBe(false)
  })

  it('ronda de un celular (admin_mode): un anotador anotado en la fila no gana el permiso (la RPC tampoco lo deja escribir)', async () => {
    const access = await loadRoundAccess(fakeAdmin({ ...fila, admin_mode: true, ronda_equipos: equipos }), 'X')
    expect(access?.participants.teamScorerUserIds).toEqual([])
    expect(isRoundParticipant(access!, 'u-pedro')).toBe(false)
  })

  it('ronda sin equipos: sin anotadores', async () => {
    const access = await loadRoundAccess(fakeAdmin({ ...fila, formato_juego: 'stroke_play', admin_mode: false, ronda_equipos: [] }), 'X')
    expect(access?.participants.teamScorerUserIds).toEqual([])
  })
})
