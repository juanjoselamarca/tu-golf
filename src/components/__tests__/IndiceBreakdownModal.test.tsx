// "¿Qué rondas cuentan?": el resumen muestra el índice con la notación del golf (un plus es "+1.0", no
// "-1") y no aparece mientras no hay índice (antes decía "mejores 0 entran al cálculo … = —").
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

let filas: unknown[] = []
/** Respuestas de error en cola: cada lectura consume una (4G débil en la cancha). */
let errores: unknown[] = []
let usuario: { id: string } | null = { id: 'u1' }

vi.mock('@/lib/error-tracking', () => ({ captureError: () => {} }))
vi.mock('@/lib/supabase', () => ({
  createClient: () => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'not', 'order']) q[m] = () => q
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      const error = errores.shift() ?? null
      return Promise.resolve(error ? { data: null, error } : { data: filas, error: null }).then(ok, ko)
    }
    return {
      auth: { getUser: () => Promise.resolve({ data: { user: usuario } }) },
      from: () => q,
    }
  },
}))

import IndiceBreakdownModal from '../IndiceBreakdownModal'

function ronda(id: string, diferencial: number, extra: Record<string, unknown> = {}) {
  return {
    id, course_name: `Cancha ${id}`, played_at: `2026-10-0${id}`, created_at: null, total_gross: 72, diferencial,
    holes_played: 18, slope_rating: 113, course_rating: 72, excluded_from_handicap: false, ...extra,
  }
}

beforeEach(() => { filas = []; errores = []; usuario = { id: 'u1' } })

describe('IndiceBreakdownModal', () => {
  it('índice plus: el resumen dice "+1.0", nunca "-1"', async () => {
    // 3 rondas → la mejor menos 2.0 (WHS 5.2): 1.0 − 2.0 = −1.0 → plus 1.0.
    filas = [ronda('1', 1.0), ronda('2', 5.0), ronda('3', 6.0)]
    render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toContain('rondas válidas'))
    expect(document.body.textContent).toContain('= +1.0.')
    expect(document.body.textContent).not.toMatch(/= -1/)
  })

  it('índice hándicap normal: un decimal fijo ("14.0", no "14")', async () => {
    filas = [ronda('1', 16.0), ronda('2', 17.0), ronda('3', 18.0)]
    render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toContain('= 14.0.'))
  })

  it('con menos rondas válidas que las de la tabla WHS no hay resumen, solo cuántas faltan', async () => {
    // La excluida y la de gross imposible no cuentan (mismo predicado que el RPC).
    filas = [ronda('1', 10.0), ronda('2', 9.0, { excluded_from_handicap: true }), ronda('3', 8.0, { total_gross: 40 })]
    render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Faltan 2 rondas válidas para activar el índice.')).toBeTruthy())
    expect(document.body.textContent).not.toContain('entran al cálculo')
    expect(document.body.textContent).not.toContain('= —')
  })

  it('sin rondas válidas: dice la verdad (slope y rating) y no ofrece FedeGolf como camino', async () => {
    // Una tarjeta FedeGolf llega excluida del índice: no cuenta.
    filas = [ronda('1', 10.0, { excluded_from_handicap: true })]
    render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toContain('Aún no tienes rondas válidas (canchas con slope y rating).'))
    expect(document.body.textContent).not.toMatch(/FedeGolf/i)
    expect(screen.getByRole('link', { name: 'Registrar una ronda →' }).getAttribute('href')).toBe('/ronda-libre/nueva')
  })

  it('si la lectura falla NO dice "sin rondas válidas": pide reintentar, y al reintentar muestra las rondas', async () => {
    filas = [ronda('1', 16.0), ronda('2', 17.0), ronda('3', 18.0)]
    errores = [{ code: 'PGRST000', message: 'network' }]
    render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    const boton = await screen.findByRole('button', { name: 'Reintentar' })
    expect(document.body.textContent).not.toContain('Aún no tienes rondas válidas')
    fireEvent.click(boton)
    await waitFor(() => expect(document.body.textContent).toContain('= 14.0.'))
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('sin sesión: lo dice, no muestra la hoja vacía', async () => {
    usuario = null
    render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toContain('Tu sesión expiró'))
    expect(document.body.textContent).not.toContain('Aún no tienes rondas válidas')
  })
})
