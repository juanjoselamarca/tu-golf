// `moverFechasDeRondas` corre con el torneo YA en juego: nunca lanza ni convierte un inicio
// exitoso en error. Una ronda sin fecha se salta; un update que falla queda en Sentry.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import { captureError } from '@/lib/error-tracking'
import { moverFechasDeRondas } from './startTournament'

type Fila = { round_number: number; date: string | null }

function svcCon(filas: Fila[] | Error, falla: (round: number) => boolean = () => false) {
  const updates: Array<{ date: string; round: number }> = []
  const from = () => ({
    select: () => ({
      eq: async () => (filas instanceof Error ? Promise.reject(filas) : { data: filas, error: null }),
    }),
    update: (patch: { date: string }) => ({
      eq: () => ({
        eq: async (_c: string, round: number) => {
          if (falla(round)) return { error: { message: 'boom' } }
          updates.push({ date: patch.date, round })
          return { error: null }
        },
      }),
    }),
  })
  return { svc: { from } as unknown as SupabaseClient, updates }
}

beforeEach(() => vi.mocked(captureError).mockClear())

describe('moverFechasDeRondas', () => {
  it('corre cada ronda con fecha por el mismo delta y se salta la que no tiene fecha', async () => {
    const { svc, updates } = svcCon([{ round_number: 2, date: '2026-06-09' }, { round_number: 3, date: null }])
    expect(await moverFechasDeRondas(svc, 't1', 3)).toBe(true)
    expect(updates).toEqual([{ date: '2026-06-12', round: 2 }])
  })

  it('un update fallido: sigue con las demás, devuelve false y lo reporta (no lanza)', async () => {
    const { svc, updates } = svcCon([{ round_number: 2, date: '2026-06-09' }, { round_number: 3, date: '2026-06-10' }], (r) => r === 2)
    expect(await moverFechasDeRondas(svc, 't1', 1)).toBe(false)
    expect(updates).toEqual([{ date: '2026-06-11', round: 3 }])
    expect(captureError).toHaveBeenCalledTimes(1)
  })

  it('una excepción de la base no se propaga', async () => {
    const { svc } = svcCon(new Error('conexión caída'))
    await expect(moverFechasDeRondas(svc, 't1', 2)).resolves.toBe(false)
    expect(captureError).toHaveBeenCalledTimes(1)
  })

  it('delta 0: no consulta nada', async () => {
    const { svc, updates } = svcCon([{ round_number: 2, date: '2026-06-09' }])
    expect(await moverFechasDeRondas(svc, 't1', 0)).toBe(true)
    expect(updates).toEqual([])
  })
})
