// Tests de `fetchLegacyHcpContext` — la capa que le da al board los datos con los
// que resuelve el course handicap de cada jugador.
//
// Lo que se protege acá NO se ve en los tests del motor: el motor recibe el
// contexto ya armado, así que un contexto mal armado pasa desapercibido. El caso
// filoso es `courses.par_total`: no es un rating de fallback, es la SEÑAL DE
// ESCALA del PR #289 (¿el CR viene en escala de 9 o de 18?) y la usa también la
// rama del TEE, que corre aunque la cancha no tenga ratings propios. Perderla
// desalinea el board del scorer ~36 golpes en una vuelta de 9 hoyos.

import { describe, it, expect, vi } from 'vitest'
import { fetchLegacyHcpContext } from './leaderboard'

type Row = Record<string, unknown> | null

/** Cliente Supabase mínimo: `.from().select().eq().maybeSingle()`. */
function supabaseMock(result: { data: Row; error?: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn((_columns: string) => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { client: { from } as never, select }
}

const TEE = {
  id: 't1', nombre: 'azul', rating: 71.9, slope: 132, yardaje_total: 6395,
  genero: 'M', front_course_rating: null, front_slope_rating: null,
  back_course_rating: null, back_slope_rating: null,
}

describe('fetchLegacyHcpContext', () => {
  it('conserva par_total aunque la cancha no tenga slope/CR (señal de escala)', async () => {
    const { client } = supabaseMock({
      data: {
        tees: 'azul',
        hcp_calc_mode: 'whs',
        courses: { par_total: 72, slope_rating: null, course_rating: null, course_tees: [TEE] },
      },
    })
    const ctx = await fetchLegacyHcpContext(client, 't-1')

    // Sin esto, `computePlayerCourseHcp` cae al par de la RONDA (36), no parte el
    // CR del tee y devuelve ~+36 golpes de más.
    expect(ctx.course?.par_total).toBe(72)
    // Los ratings ausentes viajan como 0 (falsy): el fallback de cancha queda
    // apagado, igual que hoy en el scorer, que los recibe en null.
    expect(ctx.course?.slope_rating).toBe(0)
    expect(ctx.course?.course_rating).toBe(0)
    expect(ctx.courseTees).toHaveLength(1)
  })

  it('trae el gate y el tee global tal cual vienen de la BD', async () => {
    const { client } = supabaseMock({
      data: {
        tees: 'per_player',
        hcp_calc_mode: 'raw',
        courses: { par_total: 72, slope_rating: 113, course_rating: 71.9, course_tees: [] },
      },
    })
    const ctx = await fetchLegacyHcpContext(client, 't-1')
    expect(ctx.mode).toBe('raw')
    expect(ctx.tees).toBe('per_player')
    expect(ctx.course).toEqual({ par_total: 72, slope_rating: 113, course_rating: 71.9 })
  })

  it('torneo sin cancha vinculada: contexto sin course, no revienta', async () => {
    const { client } = supabaseMock({
      data: { tees: null, hcp_calc_mode: 'whs', courses: null },
    })
    const ctx = await fetchLegacyHcpContext(client, 't-1')
    expect(ctx.course).toBeNull()
    expect(ctx.courseTees).toEqual([])
    expect(ctx.mode).toBe('whs')
  })

  it('torneo inexistente: contexto vacío (el board cae al índice crudo)', async () => {
    const { client } = supabaseMock({ data: null })
    const ctx = await fetchLegacyHcpContext(client, 't-inexistente')
    expect(ctx).toEqual({ mode: null, tees: null, course: null, courseTees: [] })
  })

  it('error de query: PROPAGA — no degrada el neto en silencio', async () => {
    const { client } = supabaseMock({ data: null, error: { message: 'boom' } })
    // Devolver contexto vacío acá haría que una vuelta de 9h salte al doble de
    // golpes y vuelva sola al siguiente refresh: el board parpadeando entre dos
    // rankings. Mejor que el caller muestre error con reintento.
    await expect(fetchLegacyHcpContext(client, 't-1')).rejects.toBeTruthy()
  })

  it('pide las columnas de tee canónicas (board y scorer con los mismos datos)', async () => {
    const { client, select } = supabaseMock({
      data: { tees: null, hcp_calc_mode: null, courses: null },
    })
    await fetchLegacyHcpContext(client, 't-1')
    const sel = select.mock.calls[0][0]
    for (const col of ['id', 'nombre', 'rating', 'slope', 'front_course_rating', 'front_slope_rating']) {
      expect(sel).toContain(col)
    }
    expect(sel).toContain('hcp_calc_mode')
  })
})
