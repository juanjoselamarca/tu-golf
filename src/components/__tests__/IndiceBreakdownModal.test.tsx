// "¿Qué rondas cuentan?": el resumen muestra el índice con la notación del golf (un plus es "+1.0", no
// "-1") y no aparece mientras no hay índice (antes decía "mejores 0 entran al cálculo … = —").
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

let filas: unknown[] = []
/** Respuestas de error en cola: cada lectura consume una (4G débil en la cancha). */
let errores: unknown[] = []
let usuario: { id: string } | null = { id: 'u1' }
/** Lo que devuelve getUser además del usuario (red caída, sesión ausente) o una excepción. */
let errorAuth: unknown = null
let getUserLanza = false

vi.mock('@/lib/error-tracking', () => ({ captureError: () => {} }))
const formateados = vi.hoisted(() => [] as number[])
vi.mock('@/golf/handicap-index-range', async orig => {
  const real = (await orig()) as typeof import('@/golf/handicap-index-range')
  return { ...real, formatearIndice: (v: number) => { formateados.push(v); return real.formatearIndice(v) } }
})
vi.mock('@/lib/supabase', () => ({
  createClient: () => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'not', 'order']) q[m] = () => q
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      const error = errores.shift() ?? null
      return Promise.resolve(error ? { data: null, error } : { data: filas, error: null }).then(ok, ko)
    }
    return {
      auth: {
        getUser: () => (getUserLanza ? Promise.reject(new Error('boom')) : Promise.resolve({ data: { user: usuario }, error: errorAuth })),
      },
      from: () => q,
    }
  },
}))

import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js'
import IndiceBreakdownModal from '../IndiceBreakdownModal'

function ronda(id: string, diferencial: number, extra: Record<string, unknown> = {}) {
  return {
    id, course_name: `Cancha ${id}`, played_at: `2026-10-0${id}`, created_at: null, total_gross: 72, diferencial,
    holes_played: 18, slope_rating: 113, course_rating: 72, excluded_from_handicap: false, ...extra,
  }
}

beforeEach(() => { filas = []; errores = []; usuario = { id: 'u1' }; errorAuth = null; getUserLanza = false })

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
    expect(screen.getByRole('link', { name: 'Importar de Garmin →' }).getAttribute('href')).toBe('/importar')
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

  it('sin sesión: lo dice, ofrece ingresar (44 px) y no muestra la hoja vacía', async () => {
    usuario = null
    errorAuth = new AuthSessionMissingError()
    window.history.pushState({}, '', '/perfil')
    render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toContain('Tu sesión expiró'))
    expect(document.body.textContent).not.toContain('Aún no tienes rondas válidas')
    const link = screen.getByRole('link', { name: 'Ingresar →' })
    expect(link.getAttribute('href')).toBe('/login?next=%2Fperfil')
    expect(link.style.minHeight).toBe('44px')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('sin red, getUser trae user null + AuthRetryableFetchError: pide reintentar, no dice "sesión expirada"', async () => {
    usuario = null
    errorAuth = new AuthRetryableFetchError('Failed to fetch', 0)
    render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    const boton = await screen.findByRole('button', { name: 'Reintentar' })
    expect(document.body.textContent).not.toContain('Tu sesión expiró')
    usuario = { id: 'u1' }
    errorAuth = null
    filas = [ronda('1', 16.0), ronda('2', 17.0), ronda('3', 18.0)]
    fireEvent.click(boton)
    await waitFor(() => expect(document.body.textContent).toContain('= 14.0.'))
  })

  it('si algo lanza dentro de la lectura, muestra el error con Reintentar (no se queda en "Cargando…")', async () => {
    getUserLanza = true
    render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    await screen.findByRole('button', { name: 'Reintentar' })
    expect(document.body.textContent).not.toContain('Cargando')
  })

  it('al reabrir, el primer cuadro no pinta la lectura anterior', async () => {
    filas = [ronda('1', 16.0), ronda('2', 17.0), ronda('3', 18.0)]
    const { rerender } = render(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toContain('= 14.0.'))
    rerender(<IndiceBreakdownModal isOpen={false} onClose={() => {}} />)
    filas = [ronda('1', 1.0), ronda('2', 5.0), ronda('3', 6.0)]
    // act() corre el efecto antes de volver, así que el DOM final no muestra el primer cuadro: se mira
    // qué índices llegó a formatear el render (el resumen es el único que llama a formatearIndice).
    formateados.length = 0
    rerender(<IndiceBreakdownModal isOpen onClose={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toContain('= +1.0.'))
    expect(formateados).not.toContain(14)
  })
})
