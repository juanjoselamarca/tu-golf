/**
 * /torneo/[slug]/en-vivo (server component) — quién entra.
 *
 * Decisión de producto 24-nov-2026: el «En vivo» lo ve cualquiera con cuenta
 * (gratis incluida); sin sesión va al login y vuelve acá. Un slug inexistente
 * es 404 antes de pedir login (no se insinúa que el torneo existe).
 * El Modo TV (/tv) sigue siendo PRO: no es este archivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const estado = vi.hoisted(() => ({
  user: null as { id: string } | null,
  row: null as Record<string, unknown> | null,
}))

class Redireccion extends Error {
  constructor(readonly destino: string) { super(`redirect:${destino}`) }
}
class NoEncontrado extends Error {}

vi.mock('next/navigation', () => ({
  // Como en Next real: redirect() y notFound() cortan el render lanzando.
  redirect: vi.fn((destino: string) => { throw new Redireccion(destino) }),
  notFound: vi.fn(() => { throw new NoEncontrado('notFound') }),
}))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: estado.user } }) } }),
}))
// Usuario FREE: si alguien vuelve a poner un gate de plan en la página, este test lo ve.
vi.mock('@/golf/billing/server', () => ({ canAccessServer: vi.fn(async () => false) }))
vi.mock('@/lib/data/tournaments/en-vivo', () => ({
  fetchTorneoEnVivoRow: vi.fn(async () => estado.row),
  armarTorneoEnVivo: vi.fn(async () => ({
    tournament: { slug: 'copa-verano', name: 'Copa Verano' },
    players: [], teams: [], categories: [], groups: [], fuera: [],
  })),
}))
vi.mock('@/lib/data/indices-de-perfil', () => ({ indicesDePerfil: vi.fn() }))
vi.mock('@/lib/data/nombres-de-perfil', () => ({ nombresDePerfil: vi.fn() }))
vi.mock('./LiveView', () => ({
  default: ({ audiencia }: { audiencia: string }) => <p>LIVEVIEW {audiencia}</p>,
}))

import { fetchTorneoEnVivoRow } from '@/lib/data/tournaments/en-vivo'
import LivePage from './page'

async function pintar(slug = 'copa-verano') {
  render(await LivePage({ params: Promise.resolve({ slug }) }))
}

beforeEach(() => {
  document.body.innerHTML = ''
  estado.user = null
  estado.row = { id: 't1', slug: 'copa-verano', organizer_id: 'org-1' }
  vi.mocked(fetchTorneoEnVivoRow).mockClear()
})

describe('/torneo/[slug]/en-vivo — sin sesión', () => {
  it('manda al login con la vuelta a este en vivo', async () => {
    const error = await pintar().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Redireccion)
    const url = new URL((error as Redireccion).destino, 'https://golfersplus.vercel.app')
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('next')).toBe('/torneo/copa-verano/en-vivo')
  })
})

describe('/torneo/[slug]/en-vivo — slug inexistente', () => {
  it('es 404 sin pedir login', async () => {
    estado.row = null
    const error = await pintar('no-existe').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NoEncontrado)
    expect(fetchTorneoEnVivoRow).toHaveBeenCalledWith(expect.anything(), 'no-existe')
  })
})

describe('/torneo/[slug]/en-vivo — slug con caracteres que no existen en un slug', () => {
  it.each(['copa#x', 'copa?next=/x', 'Copa-Verano', 'copa%2F..'])('«%s» es 404 sin consultar la base ni pedir login', async (slug) => {
    const error = await pintar(slug).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NoEncontrado)
    expect(fetchTorneoEnVivoRow).not.toHaveBeenCalled()
  })
})

describe('/torneo/[slug]/en-vivo — con sesión de plan gratis', () => {
  it('ve el en vivo, no un upsell', async () => {
    estado.user = { id: 'u-free' }
    await pintar()
    expect(screen.getByText('LIVEVIEW player')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/PRO|Ver planes/)
  })

  it('el organizador lo ve como organizador', async () => {
    estado.user = { id: 'org-1' }
    await pintar()
    expect(screen.getByText('LIVEVIEW organizer')).toBeTruthy()
  })
})
