/**
 * loadRoundForPush — los hoyos de la ronda salen de la fuente única
 * (hoyosDeLaVuelta): una cancha de 9 jugada a 18 son dos vueltas (review I-1).
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const catalogo9 = [4, 4, 3, 4, 5, 4, 3, 4, 5].map((par, i) => ({ numero: i + 1, par, stroke_index: i + 1, recorrido: null }))
vi.mock('@/lib/data/course-holes', () => ({ fetchHoyosDeLaRonda: vi.fn(async () => catalogo9) }))
vi.mock('@/lib/data/ronda-libre', () => ({ fetchRondaEquipos: vi.fn(async () => []) }))

import { loadRoundForPush } from './round-snapshot'

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

  it('ronda inexistente → null', async () => {
    expect(await loadRoundForPush(fakeAdmin(null), 'NOPE')).toBeNull()
  })
})
