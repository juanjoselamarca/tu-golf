// Hunter 04-nov-2026: con 38 gross y 8 golpes recibidos en 9 hoyos (par 36) el
// panel decía "NET +30": formateaba los golpes netos como si fueran vs par.
// GROSS y NET son golpes; vs PAR es el único que lleva signo.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'
import { ScorecardPanel } from './ScorecardPanel'

vi.mock('./HoleStatsTable', () => ({ HoleStatsTable: () => null }))

function entry(over: Partial<UseScoreEntryReturn>): UseScoreEntryReturn {
  return {
    selectedPlayer: { id: 'p1', profiles: { name: 'E2E Test' }, handicap_at_registration: 15 },
    selectedRound: { id: 'r1', status: 'in_progress' },
    holes: [],
    currentScores: {},
    errorHoles: new Set(),
    saving: new Set(),
    allFilled: false,
    outGross: 0,
    inGross: 0,
    stablefordPtsAt: () => 0,
    saveScore: vi.fn(),
    finalizeRound: vi.fn(),
    selectedId: 'p1',
    ...over,
  } as unknown as UseScoreEntryReturn
}

const tournament = { format: 'stroke_play', modo_juego: 'neto' } as unknown as ScoringTournament

function totales(e: UseScoreEntryReturn): Record<string, string> {
  render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={e} />)
  const out: Record<string, string> = {}
  for (const etiqueta of ['GROSS', 'NET', 'vs PAR']) {
    out[etiqueta] = screen.getByText(etiqueta).nextElementSibling?.textContent ?? ''
  }
  return out
}

describe('ScorecardPanel — totales del jugador', () => {
  it('NET son golpes netos sin signo, igual que GROSS; vs PAR lleva el signo', () => {
    const t = totales(entry({ grossTotal: 38, netTotal: 30, parJugado: 36 }))
    expect(t.GROSS).toBe('38')
    expect(t.NET).toBe('30')
    expect(t['vs PAR']).toBe('+2')
  })

  it('sin scores muestra "—" en los tres', () => {
    const t = totales(entry({ grossTotal: 0, netTotal: 0, parJugado: 0 }))
    expect(t).toEqual({ GROSS: '—', NET: '—', 'vs PAR': '—' })
  })

  it('un neto bajo par sigue siendo golpes (no "-3")', () => {
    const t = totales(entry({ grossTotal: 41, netTotal: 33, parJugado: 36 }))
    expect(t.NET).toBe('33')
    expect(t['vs PAR']).toBe('+5')
  })
})

// Jugador sin tarjeta en la ronda en juego: antes el golpe se descartaba en silencio. Ahora la grilla queda
// de solo lectura y el aviso ofrece "Crear su tarjeta" (POST /api/torneos/[slug]/tarjeta).
describe('ScorecardPanel — jugador sin tarjeta en la ronda en juego', () => {
  const crearTarjeta = (over: Partial<{ creando: boolean; resultado: 'no_aparece' | null }> = {}) => ({
    creando: false, resultado: null, crear: vi.fn(async () => {}), ...over,
  })
  const sinTarjeta = entry({ selectedRound: undefined, holes: [1, 2] })

  it('muestra el aviso, bloquea la grilla y "Crear su tarjeta" la pide', () => {
    const ct = crearTarjeta()
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={sinTarjeta} crearTarjeta={ct} />)
    expect(screen.getByTestId('organizador-sin-tarjeta').textContent).toContain('E2E Test no tiene tarjeta en esta ronda')
    for (const input of screen.queryAllByRole('textbox')) expect((input as HTMLInputElement).readOnly).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Crear su tarjeta' }))
    expect(ct.crear).toHaveBeenCalledTimes(1)
  })

  it('mientras crea, el botón queda deshabilitado; si no aparece, lo dice', () => {
    const { rerender } = render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={sinTarjeta} crearTarjeta={crearTarjeta({ creando: true })} />)
    expect((screen.getByRole('button', { name: 'Creando...' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={sinTarjeta} crearTarjeta={crearTarjeta({ resultado: 'no_aparece' })} />)
    expect(screen.getByTestId('resultado-crear-tarjeta').textContent).toContain('No se pudo crear ahora')
  })

  it('con tarjeta no hay aviso; con el torneo cerrado tampoco (no se puede crear)', () => {
    const { rerender } = render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={entry({})} crearTarjeta={crearTarjeta()} />)
    expect(screen.queryByTestId('organizador-sin-tarjeta')).toBeNull()
    rerender(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={sinTarjeta} crearTarjeta={crearTarjeta()} soloLectura />)
    expect(screen.queryByTestId('organizador-sin-tarjeta')).toBeNull()
  })
})
