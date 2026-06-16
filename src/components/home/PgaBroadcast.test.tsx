/**
 * Render del widget PGA "broadcast" del landing, por estado del torneo.
 * Prueba que la data real de /api/pga-live se mapee al diseño correcto y que
 * los estados CERO FALLOS (nada que mostrar → null) funcionen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import PgaBroadcast from './PgaBroadcast'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

function stubFetch(data: unknown) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)))
}

async function mount() {
  let utils!: ReturnType<typeof render>
  await act(async () => { utils = render(<PgaBroadcast />) })
  await act(async () => { await Promise.resolve() })
  return utils
}

describe('PgaBroadcast — estados del widget', () => {
  beforeEach(() => {
    // El auto-crawl usa rAF; lo neutralizamos para que no corra en el test.
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('sin torneo y sin próximo evento → no renderiza nada (hero perfecto sin widget)', async () => {
    stubFetch({ active: false })
    const { container } = await mount()
    expect(container.querySelector('.pgalive')).toBeNull()
  })

  it('sin torneo activo pero con próximo evento → tarjeta "Próximo evento"', async () => {
    stubFetch({ active: false, next_event: { name: 'The Memorial', start: '2026-06-05', end: '2026-06-08', venue: 'Muirfield Village' } })
    const { container } = await mount()
    expect(container.querySelector('.pgalive')).not.toBeNull()
    expect(container.querySelector('.evcard')).not.toBeNull()
    expect(container.querySelector('.evcard .ev-n')?.textContent).toContain('The Memorial')
    expect(container.querySelector('.live')?.textContent).toContain('Próximo')
    expect(container.querySelector('.pwin')).toBeNull() // sin leaderboard
  })

  it('en vivo → leaderboard con latino tintado, over-par en rojo y "Hoy" vacío en guion', async () => {
    stubFetch({
      active: true, live: true, complete: false, round: 'R3 · Moving Day',
      players: [
        { position: '1', name: 'J. Niemann', nameFull: 'Joaquín Niemann', score: '-7', today: '-2', thru: '14', flag: 'https://flagcdn.com/w40/cl.png', countryCode: 'cl', isTeam: false },
        { position: '2', name: 'S. Scheffler', nameFull: 'Scottie Scheffler', score: '-5', today: '+1', thru: '13', flag: 'https://flagcdn.com/w40/us.png', countryCode: 'us', isTeam: false },
        { position: '3', name: 'R. McIlroy', nameFull: 'Rory McIlroy', score: 'E', today: '-', thru: 'F', flag: 'https://flagcdn.com/w40/ie.png', countryCode: 'ie', isTeam: false },
      ],
    })
    const { container } = await mount()
    const rows = container.querySelectorAll('.pwin .prow')
    expect(rows.length).toBe(3)
    expect(container.querySelector('.live')?.textContent).toContain('En vivo')
    // Niemann (cl) tintado de latino
    expect(rows[0].classList.contains('cl')).toBe(true)
    // total negativo en dorado (.u) y con signo menos tipográfico
    const total0 = rows[0].querySelector('.ps')
    expect(total0?.classList.contains('u')).toBe(true)
    expect(total0?.textContent).toBe('−7')
    // Scheffler +1 hoy → rojo (over)
    expect(rows[1].querySelector('.ptd')?.classList.contains('over')).toBe(true)
    // McIlroy "Hoy" vacío → guion
    const today2 = rows[2].querySelector('.ptd')
    expect(today2?.classList.contains('dash')).toBe(true)
    expect(today2?.textContent).toBe('–')
  })

  it('en vivo con corte proyectado → muestra la línea "Corte proyectado · +X"', async () => {
    stubFetch({
      active: true, live: true, complete: false, round: 'R2 · Viernes',
      projectedCut: '+1',
      players: [
        { position: '1', name: 'S. Scheffler', nameFull: 'Scottie Scheffler', score: '-9', today: '-4', thru: 'F', flag: 'https://flagcdn.com/w40/us.png', countryCode: 'us', isTeam: false },
      ],
    })
    const { container } = await mount()
    const cut = container.querySelector('.cutline.proj')
    expect(cut).not.toBeNull()
    expect(cut?.textContent).toContain('Corte proyectado')
    expect(cut?.textContent).toContain('+1')
  })

  it('en vivo sin corte (signature / projectedCut null) → NO muestra línea de corte', async () => {
    stubFetch({
      active: true, live: true, complete: false, round: 'R2', projectedCut: null,
      players: [{ position: '1', name: 'S. Scheffler', nameFull: 'Scottie Scheffler', score: '-9', today: '-4', thru: 'F', flag: 'https://flagcdn.com/w40/us.png', countryCode: 'us', isTeam: false }],
    })
    const { container } = await mount()
    expect(container.querySelector('.cutline')).toBeNull()
  })

  it('finalizado → campeón con trofeo y footer de campeón', async () => {
    stubFetch({
      active: true, live: false, complete: true, round: 'Finalizada',
      players: [
        { position: '1', name: 'W. Clark', nameFull: 'Wyndham Clark', score: '-11', today: '-5', thru: 'F', flag: 'https://flagcdn.com/w40/us.png', countryCode: 'us', isTeam: false },
        { position: '2', name: 'T. Fleetwood', nameFull: 'Tommy Fleetwood', score: '-9', today: '-3', thru: 'F', flag: 'https://flagcdn.com/w40/gb-eng.png', countryCode: 'gb-eng', isTeam: false },
      ],
    })
    const { container } = await mount()
    const rows = container.querySelectorAll('.pwin .prow')
    expect(rows[0].classList.contains('champ')).toBe(true)
    expect(rows[0].querySelector('.champ-ic')).not.toBeNull() // trofeo de línea
    expect(container.querySelector('.live')?.textContent).toContain('Final')
    expect(container.querySelector('.pf')?.textContent).toContain('Campeón')
  })

  it('header muestra el NOMBRE del campeonato como chip primario + ronda secundaria', async () => {
    stubFetch({
      active: true, complete: true, tournament: 'RBC Canadian Open', round: 'Finalizada',
      players: [{ position: '1', name: 'B. Cauley', nameFull: 'Bud Cauley', score: '-17', today: '-1', thru: 'F', flag: 'https://flagcdn.com/w40/us.png', countryCode: 'us', isTeam: false }],
    })
    const { container } = await mount()
    expect(container.querySelector('.pgalive .tour')?.textContent).toBe('RBC Canadian Open')
    expect(container.querySelector('.pgalive .rd')?.textContent).toBe('Finalizada')
  })

  it('línea de corte se posiciona tras el último que pasa el corte, no al fondo', async () => {
    stubFetch({
      active: true, live: true, projectedCut: '+1',
      players: [
        { position: '1', name: 'A', nameFull: 'AA', score: '-5', today: '-2', thru: 'F', flag: '', countryCode: 'us', isTeam: false },
        { position: '2', name: 'B', nameFull: 'BB', score: '-3', today: '-1', thru: 'F', flag: '', countryCode: 'us', isTeam: false },
        { position: '3', name: 'C', nameFull: 'CC', score: '+1', today: '+2', thru: 'F', flag: '', countryCode: 'us', isTeam: false },
        { position: '4', name: 'D', nameFull: 'DD', score: '+4', today: '+5', thru: 'F', flag: '', countryCode: 'us', isTeam: false },
      ],
    })
    const { container } = await mount()
    const cut = container.querySelector('.cutline.proj')
    expect(cut).not.toBeNull()
    // el jugador justo arriba del corte es el +1; el de abajo es el +4
    expect(cut?.previousElementSibling?.querySelector('.ps')?.textContent).toBe('+1')
    expect(cut?.nextElementSibling?.querySelector('.ps')?.textContent).toBe('+4')
  })

  it('fila de equipo no renderiza bandera <img>', async () => {
    stubFetch({
      active: true, complete: true, isTeamEvent: true, tournament: 'Zurich Classic', round: 'Finalizada',
      players: [{ position: '1', name: 'Lowry/McIlroy', nameFull: 'Lowry/McIlroy', score: '-25', today: '-6', thru: 'F', flag: '', countryCode: '', isTeam: true }],
    })
    const { container } = await mount()
    const row = container.querySelector('.pwin .prow')
    expect(row?.querySelector('img.fg')).toBeNull()
    expect(row?.querySelector('span.fg')).not.toBeNull()
  })
})
