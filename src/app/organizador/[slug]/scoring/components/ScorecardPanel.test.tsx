// Hunter 04-nov-2026: con 38 gross y 8 golpes recibidos en 9 hoyos (par 36) el
// panel decía "NET +30": formateaba los golpes netos como si fueran vs par.
// GROSS y NET son golpes; vs PAR es el único que lleva signo.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'
import { ScorecardPanel } from './ScorecardPanel'

const montajesStats = vi.hoisted(() => ({ n: 0 }))
vi.mock('./HoleStatsTable', async () => {
  const { useEffect } = await import('react')
  return { HoleStatsTable: () => { useEffect(() => { montajesStats.n++ }, []); return null } }
})

function entry(over: Partial<UseScoreEntryReturn>): UseScoreEntryReturn {
  return {
    selectedPlayer: { id: 'p1', status: 'approved', profiles: { name: 'E2E Test' }, handicap_at_registration: 15 },
    selectedRound: { id: 'r1', status: 'in_progress' },
    holes: [],
    currentScores: {},
    vista: {}, editable: true, cierre: null, reintentarGuardado: vi.fn(),
    saving: false,
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
    const inputs = screen.queryAllByRole('spinbutton')
    expect(inputs.length).toBeGreaterThan(0)
    for (const input of inputs) expect((input as HTMLInputElement).readOnly).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Crear su tarjeta' }))
    expect(ct.crear).toHaveBeenCalledTimes(1)
  })

  it('mientras crea, el botón queda deshabilitado; si no aparece, lo dice', () => {
    const { rerender } = render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={sinTarjeta} crearTarjeta={crearTarjeta({ creando: true })} />)
    expect((screen.getByRole('button', { name: 'Creando...' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={sinTarjeta} crearTarjeta={crearTarjeta({ resultado: 'no_aparece' })} />)
    expect(screen.getByTestId('resultado-crear-tarjeta').textContent).toContain('No se pudo crear ahora')
  })

  it.each([
    ['withdrawn', 'Se retiró: no juega esta ronda.'],
    ['disqualified', 'Descalificación: no juega esta ronda.'],
    ['pending', 'Inscripción sin aprobar: no juega esta ronda.'],
  ])('%s sin tarjeta: dice que no juega, sin botón, en tono neutro y sin grilla', (status, texto) => {
    const e = entry({ selectedRound: undefined, holes: [1, 2], selectedPlayer: { id: 'p1', status, profiles: { name: 'E2E Test' }, handicap_at_registration: 15 } as never })
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={e} crearTarjeta={crearTarjeta()} />)
    const aviso = screen.getByTestId('organizador-no-juega')
    expect(aviso.textContent).toContain(texto)
    expect(aviso.getAttribute('role')).toBe('status')
    expect(aviso.style.background).toBe('var(--surface-soft)')
    expect(screen.queryByRole('button', { name: 'Crear su tarjeta' })).toBeNull()
    expect(screen.queryByTestId('organizador-sin-tarjeta')).toBeNull()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  // Aprobado inscrito durante la ronda 2, mirando la pestaña "Ronda 1": el servidor crea la tarjeta en la
  // vigente (la 2), así que "Crear su tarjeta" terminaba en un "No se pudo crear" falso.
  it('aprobado sin tarjeta en una ronda pasada: "no jugó la ronda N", sin botón ni grilla', () => {
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={sinTarjeta} crearTarjeta={crearTarjeta()} ronda={{ numero: 1, vigente: false }} />)
    const aviso = screen.getByTestId('organizador-no-jugo')
    expect(aviso.textContent).toBe('E2E Test no jugó la ronda 1.')
    expect(aviso.getAttribute('role')).toBe('status')
    expect(screen.queryByRole('button', { name: 'Crear su tarjeta' })).toBeNull()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  it('aprobado sin tarjeta en la ronda vigente: aviso de error con botón y la grilla visible (solo lectura)', () => {
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={sinTarjeta} crearTarjeta={crearTarjeta()} ronda={{ numero: 2, vigente: true }} />)
    expect(screen.getByTestId('organizador-sin-tarjeta').getAttribute('role')).toBe('alert')
    expect(screen.getByRole('button', { name: 'Crear su tarjeta' })).toBeTruthy()
    expect(screen.queryAllByRole('spinbutton').length).toBeGreaterThan(0)
  })

  // Fable #833 v2: con el torneo cerrado la tarjeta ya no se juega; "no juega ESTA ronda" hablaba de algo que
  // ya pasó. Igual que una ronda pasada: "no jugó", y el carrusel dice lo mismo (casoSinTarjeta).
  it('torneo cerrado: un retirado sin tarjeta "no jugó la ronda N"', () => {
    const e = entry({ selectedRound: undefined, holes: [1, 2], selectedPlayer: { id: 'p1', status: 'withdrawn', profiles: { name: 'E2E Test' }, handicap_at_registration: 15 } as never })
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={e} soloLectura />)
    expect(screen.getByTestId('organizador-no-jugo').textContent).toBe('E2E Test no jugó la ronda 1.')
    expect(screen.queryByTestId('organizador-no-juega')).toBeNull()
  })

  it('con tarjeta no hay aviso', () => {
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={entry({})} crearTarjeta={crearTarjeta()} />)
    expect(screen.queryByTestId('organizador-sin-tarjeta')).toBeNull()
  })

  // Fable #829: con el torneo cerrado o publicado, el aprobado sin tarjeta quedaba con una grilla vacía muda.
  it.each([[true], [false]])('torneo cerrado (con o sin crearTarjeta=%s): aprobado sin tarjeta "no jugó la ronda N", sin botón ni grilla', (conCrear) => {
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={sinTarjeta} crearTarjeta={conCrear ? crearTarjeta() : undefined} ronda={{ numero: 2, vigente: true }} soloLectura />)
    expect(screen.queryByTestId('organizador-sin-tarjeta')).toBeNull()
    expect(screen.getByTestId('organizador-no-jugo').textContent).toBe('E2E Test no jugó la ronda 2.')
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  // Fable #829: en una ronda pasada, "no jugó" gana sobre el estado de HOY (retirado en la 3, mirando la 1).
  it('retirado sin tarjeta en una ronda pasada: "no jugó la ronda N", no "Se retiró: no juega esta ronda"', () => {
    const e = entry({ selectedRound: undefined, holes: [1, 2], selectedPlayer: { id: 'p1', status: 'withdrawn', profiles: { name: 'E2E Test' }, handicap_at_registration: 15 } as never })
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={e} crearTarjeta={crearTarjeta()} ronda={{ numero: 1, vigente: false }} />)
    expect(screen.getByTestId('organizador-no-jugo').textContent).toBe('E2E Test no jugó la ronda 1.')
    expect(screen.queryByTestId('organizador-no-juega')).toBeNull()
  })
})

describe('ScorecardPanel — estado de guardado por hoyo', () => {
  const fila = (estado: string, motivo: string | null = null) =>
    ({ gross: 5, putts: null, fairway_hit: null, gir: null, estado, motivo, quizaAplicado: false })

  it('un hoyo sin confirmar y uno rechazado se dicen con texto y el toque reintenta la ronda abierta', () => {
    const reintentarGuardado = vi.fn()
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={entry({
      holes: [1, 2, 3], currentScores: { 1: 5, 2: 5, 3: 5 }, reintentarGuardado,
      vista: { 1: fila('limpio'), 2: fila('sin_confirmar'), 3: fila('rechazado', 'closed') },
    } as never)} />)
    expect(screen.getByLabelText('Golpes del hoyo 1')).toBeTruthy()
    expect(screen.getByLabelText('Golpes del hoyo 2 (sin confirmar)')).toBeTruthy()
    const aviso = screen.getByRole('button', { name: 'Hoyo 3: no se guardó (tarjeta cerrada) · Reintentar' })
    expect(parseInt(aviso.style.minHeight)).toBeGreaterThanOrEqual(44)
    expect(screen.getByRole('button', { name: 'Hoyo 2: sin confirmar · Reintentar' })).toBeTruthy()
    fireEvent.click(aviso)
    expect(reintentarGuardado).toHaveBeenCalledWith('r1')
  })

  it('un hoyo guardando no lleva aviso de error (sólo la marca de la celda)', () => {
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={entry({
      holes: [1], currentScores: { 1: 5 }, vista: { 1: fila('guardando') },
    } as never)} />)
    expect(screen.getByLabelText('Golpes del hoyo 1 (guardando)')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('cerrando: el botón dice qué hoyos faltan y no se puede tocar; con otra tarjeta, dice de quién', () => {
    const base = { holes: [1], currentScores: { 1: 4 }, allFilled: true }
    const cierre = { roundId: 'r1', playerId: 'p1', nombre: 'Ana', fase: 'guardando', hoyos: [17, 18] }
    const { rerender } = render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={entry({ ...base, cierre } as never)} />)
    const boton = screen.getByRole('button', { name: 'Terminando de guardar… hoyos 17, 18' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    rerender(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={entry({ ...base, cierre: { ...cierre, roundId: 'otra' } } as never)} />)
    expect((screen.getByRole('button', { name: 'Cerrando tarjeta de Ana…' }) as HTMLButtonElement).disabled).toBe(true)
  })

describe('ScorecardPanel — tabla de stats por ronda', () => {
  it('cambiar de ronda remonta la tabla: lo tecleado en putts no pasa a la tarjeta de otro jugador', () => {
    montajesStats.n = 0
    const e1 = entry({ holes: [1] } as never)
    const { rerender } = render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={e1} />)
    fireEvent.click(screen.getByRole('button', { name: /Estadísticas adicionales/ }))
    expect(montajesStats.n).toBe(1)
    rerender(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={e1} />)
    expect(montajesStats.n).toBe(1)
    const e2 = entry({ holes: [1], selectedRound: { id: 'r2', status: 'in_progress' }, selectedId: 'p2' } as never)
    rerender(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={18} entry={e2} />)
    expect(montajesStats.n).toBe(2)
  })
})
})
