import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const fetchTournamentStatus = vi.fn()
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchTournamentStatus: (...args: unknown[]) => fetchTournamentStatus(...args),
}))

import { useEsperarInicioDelTorneo, INTERVALO_ESPERA_INICIO_MS } from './useEsperarInicioDelTorneo'

const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_ESPERA_INICIO_MS) }) }

describe('useEsperarInicioDelTorneo', () => {
  beforeEach(() => { vi.useFakeTimers(); fetchTournamentStatus.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  // Revisión del PR #588: el aviso dice "Podrás anotar cuando el organizador lo inicie", pero la pantalla cargaba el
  // torneo una sola vez y el jugador quedaba bloqueado en el tee hasta recargar a mano.
  it('cuando el organizador inicia el torneo, recarga sola (una vez)', async () => {
    fetchTournamentStatus.mockResolvedValueOnce('open').mockResolvedValue('in_progress')
    const onCambio = vi.fn()
    renderHook(() => useEsperarInicioDelTorneo({ tournamentId: 't1', esperando: true, onCambio }))
    await tick()
    expect(onCambio).not.toHaveBeenCalled()
    await tick()
    expect(onCambio).toHaveBeenCalledTimes(1)
    await tick()
    expect(onCambio).toHaveBeenCalledTimes(1)
    expect(fetchTournamentStatus).toHaveBeenCalledWith({}, 't1')
  })

  it('si lo cierran sin empezar también recarga: el aviso no puede seguir diciendo "todavía no empieza"', async () => {
    fetchTournamentStatus.mockResolvedValue('closed')
    const onCambio = vi.fn()
    renderHook(() => useEsperarInicioDelTorneo({ tournamentId: 't1', esperando: true, onCambio }))
    await tick()
    expect(onCambio).toHaveBeenCalledTimes(1)
  })

  it('un corte de red no recarga ni rompe: el siguiente tick reintenta', async () => {
    fetchTournamentStatus.mockRejectedValueOnce(new Error('offline')).mockResolvedValue('in_progress')
    const onCambio = vi.fn()
    renderHook(() => useEsperarInicioDelTorneo({ tournamentId: 't1', esperando: true, onCambio }))
    await tick()
    expect(onCambio).not.toHaveBeenCalled()
    await tick()
    expect(onCambio).toHaveBeenCalledTimes(1)
  })

  it('con el torneo en curso (o sin cargar) no consulta nada', async () => {
    renderHook(() => useEsperarInicioDelTorneo({ tournamentId: 't1', esperando: false, onCambio: vi.fn() }))
    renderHook(() => useEsperarInicioDelTorneo({ tournamentId: null, esperando: true, onCambio: vi.fn() }))
    await tick()
    expect(fetchTournamentStatus).not.toHaveBeenCalled()
  })
})
