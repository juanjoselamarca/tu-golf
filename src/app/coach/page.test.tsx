/**
 * /coach (server component) — estados que no pueden quedar mudos ni mentir.
 * Vuelta 1 de revisión del PR3 Ola 1 (17-nov-2026).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CoachHomeData } from '@/lib/data/coach-home'
import { normalizarRondas, type RawStatsRound } from '@/golf/stats/rondas-normalizadas'

const home = vi.hoisted(() => ({ data: null as unknown as CoachHomeData }))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/auth/getPageUser', () => ({ getPageUser: async () => ({ id: 'u1' }) }))
vi.mock('./lib/checkCoachAccess', () => ({ canUseCoach: async () => true }))
vi.mock('@/lib/data/coach-home', () => ({ fetchCoachHome: async () => home.data }))
vi.mock('@/components/coach/TaigerHero', () => ({ TaigerHero: ({ subtitle }: { subtitle: string }) => <p>{subtitle}</p> }))
vi.mock('@/components/DefaultTeeBanner', () => ({ DefaultTeeBanner: () => null }))
vi.mock('@/components/PageTracker', () => ({ PageTracker: () => null }))

import CoachDashboard from './page'

const sesion = { id: 's1', session_type: 'post_round', created_at: '2026-11-10T12:00:00Z', next_focus: 'Respirar antes del putt' }

function datos(over: Partial<CoachHomeData>): CoachHomeData {
  return { sessions: [], primarySessionId: null, patterns: [], plan: null, outcomes: [], rondas: [], ...over }
}

async function pintar() {
  render(await CoachDashboard())
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('/coach — falló la lectura de rondas', () => {
  it('dice el error, deja hablar con el coach y muestra las sesiones; nunca "Bienvenido"', async () => {
    home.data = datos({ rondas: null, sessions: [sesion] })
    await pintar()
    expect(screen.getByText('No pudimos leer tus rondas')).toBeTruthy()
    const cta = screen.getByRole('link', { name: 'Hablar con mi coach' })
    expect(cta.getAttribute('href')).toBe('/coach/sesion/nueva')
    expect(screen.getByText('Análisis post-ronda')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Bienvenido/)
  })
})

describe('/coach — falló la lectura de rondas, con conversación en curso', () => {
  it('el CTA abre la conversación principal, no un chat vacío', async () => {
    home.data = datos({ rondas: null, sessions: [sesion], primarySessionId: 's1' })
    await pintar()
    const cta = screen.getByRole('link', { name: 'Hablar con mi coach' })
    expect(cta.getAttribute('href')).toBe('/coach/sesion/s1')
  })
})

describe('/coach — con rondas pero sin datos para el Mental Index', () => {
  it('pinta la tarjeta del índice con qué falta, sin número', async () => {
    // Ronda de 18 sin par hoyo a hoyo: se lee, pero no entra a la ventana mental.
    const raw: RawStatsRound = {
      id: 'r1', course_name: 'Club', course_id: null, played_at: '2026-11-10',
      scores: Array(18).fill(5), total_gross: null, holes_played: 18, import_source: null,
      par_per_hole: null, metadata: null, formato_juego: null,
    }
    const rondas = normalizarRondas([raw], [], [])
    expect(rondas).toHaveLength(1)
    home.data = datos({ rondas })
    await pintar()
    expect(screen.getByText('Mental Index')).toBeTruthy()
    expect(screen.getByText('Necesitamos tarjetas hoyo a hoyo con par para medir tu recuperación')).toBeTruthy()
    expect(screen.queryByText('/ 100')).toBeNull()
    expect(document.body.textContent).not.toMatch(/esta semana/)
  })
})
