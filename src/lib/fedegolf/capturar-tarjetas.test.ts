import { describe, it, expect, vi } from 'vitest'
import { tarjetaToRow, capturarTarjetas } from './capturar-tarjetas'
import type { FedegolfTarjeta } from './types'

const tarjeta: FedegolfTarjeta = {
  fechaJuego: '2026-07-11',
  clubCancha: 'C.G. Los Leones / Los Leones (VARONES)',
  scoreGross: 84,
  courseRating: 73.3,
  slope: 136,
  tee: 'Azul',
  diferencial: 8.8,
  ticket: '6902341',
  cuenta: true,
  valeDoble: false,
  holes: null,
}

describe('tarjetaToRow', () => {
  it('mapea una tarjeta a una fila de historical_rounds con las banderas correctas', () => {
    const row = tarjetaToRow('user-1', tarjeta)
    expect(row).toMatchObject({
      user_id: 'user-1',
      course_name: 'C.G. Los Leones / Los Leones (VARONES)',
      course_id: null,
      tee_color: 'Azul',
      played_at: '2026-07-11',
      total_gross: 84,
      course_rating: 73.3,
      slope_rating: 136,
      diferencial: 8.8,
      holes_played: 18, // gross 84 ≥ 60 → 18h (holes_played es NOT NULL en BD)
      import_source: 'fedegolf',
      excluded_from_handicap: true, // D7: NO alimenta indice_golfers
      fedegolf_ticket: '6902341',
      vale_doble: false,
      privacy: 'private',
      formato_juego: 'stroke_play',
      modo_juego: 'gross',
    })
  })

  it('holes_played: usa holes si viene, si no infiere por gross (9h si <60, 18h si no)', () => {
    // NOT NULL en BD → siempre un número. Fidelidad-only (excluded_from_handicap).
    expect(tarjetaToRow('u', { ...tarjeta, holes: null, scoreGross: 84 }).holes_played).toBe(18)
    expect(tarjetaToRow('u', { ...tarjeta, holes: null, scoreGross: 46 }).holes_played).toBe(9)
    expect(tarjetaToRow('u', { ...tarjeta, holes: 9, scoreGross: 84 }).holes_played).toBe(9)
  })

  it('propaga vale_doble y course_id resuelto', () => {
    const row = tarjetaToRow('u', { ...tarjeta, valeDoble: true, ticket: '6766119' }, 'course-uuid')
    expect(row.vale_doble).toBe(true)
    expect(row.course_id).toBe('course-uuid')
    expect(row.fedegolf_ticket).toBe('6766119')
  })
})

describe('capturarTarjetas', () => {
  it('hace upsert de las filas con onConflict por (user_id, fedegolf_ticket)', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = { from: vi.fn().mockReturnValue({ upsert }) }

    const res = await capturarTarjetas(supabase as never, 'user-1', [tarjeta])

    expect(supabase.from).toHaveBeenCalledWith('historical_rounds')
    expect(upsert).toHaveBeenCalledTimes(1)
    const [rows, opts] = upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'user_id,fedegolf_ticket' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fedegolf_ticket: '6902341',
      excluded_from_handicap: true,
      import_source: 'fedegolf',
    })
    expect(res.total).toBe(1)
  })

  it('no hace upsert si no hay tarjetas', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = { from: vi.fn().mockReturnValue({ upsert }) }
    const res = await capturarTarjetas(supabase as never, 'u', [])
    expect(upsert).not.toHaveBeenCalled()
    expect(res.total).toBe(0)
  })

  it('usa el resolver de course_id inyectado', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = { from: vi.fn().mockReturnValue({ upsert }) }
    const resolver = vi.fn().mockResolvedValue('resolved-course')

    await capturarTarjetas(supabase as never, 'u', [tarjeta], resolver)

    expect(resolver).toHaveBeenCalledWith('C.G. Los Leones / Los Leones (VARONES)')
    expect(upsert.mock.calls[0][0][0].course_id).toBe('resolved-course')
  })

  it('lanza si el upsert devuelve error', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const supabase = { from: vi.fn().mockReturnValue({ upsert }) }
    await expect(capturarTarjetas(supabase as never, 'u', [tarjeta])).rejects.toThrow(/boom/)
  })
})
