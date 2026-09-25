// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createInitialConfig } from '@/lib/draft/initial-config'
import { useDraftStore } from '@/lib/draft/store'

const router = { replace: vi.fn(), push: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const data = vi.hoisted(() => ({
  createTournamentFromDraft: vi.fn(),
  saveDraftPartial: vi.fn(),
}))
vi.mock('@/lib/data/tournament-drafts', () => data)

import { useDraftActions } from './useDraftActions'

beforeEach(() => {
  vi.clearAllMocks()
  useDraftStore.getState().reset()
  data.saveDraftPartial.mockResolvedValue({ kind: 'ok', version: 2, config: createInitialConfig() })
})

afterEach(() => {
  useDraftStore.getState().reset()
})

function initStore(id = 'd1') {
  useDraftStore.getState().init(id, {
    config: createInitialConfig(),
    version: 1,
    collaborators: [{ user_id: 'u1', role: 'owner', name: 'Juanjo' }],
  })
}

describe('useDraftActions', () => {
  it('applyChangeManual aplica el partial como cambio manual optimista', () => {
    initStore()
    const { result } = renderHook(() => useDraftActions())

    act(() => result.current.applyChangeManual({ name: 'Copa del Club' }))

    const store = useDraftStore.getState()
    expect(store.config?.name).toBe('Copa del Club')
    expect(store.pendingChanges).toHaveLength(1)
    expect(store.pendingChanges[0].source).toBe('manual')
  })

  it('applyAssistantConfig reemplaza la config y conserva colaboradores', () => {
    initStore()
    const { result } = renderHook(() => useDraftActions())
    const next = { ...createInitialConfig(), name: 'Desde la IA', format: 'scramble' as const }

    act(() => result.current.applyAssistantConfig({}, next, 'Listo.', []))

    const store = useDraftStore.getState()
    expect(store.config?.name).toBe('Desde la IA')
    expect(store.config?.format).toBe('scramble')
    expect(store.version).toBe(2)
    expect(store.collaborators).toEqual([{ user_id: 'u1', role: 'owner', name: 'Juanjo' }])
  })

  it('applyAssistantConfig sin borrador activo no hace nada', () => {
    const { result } = renderHook(() => useDraftActions())
    act(() => result.current.applyAssistantConfig({}, createInitialConfig(), 'x', []))
    expect(useDraftStore.getState().config).toBeNull()
  })

  it('createTournament flushea el autosave ANTES de crear y navega al slug', async () => {
    initStore('d1')
    const calls: string[] = []
    useDraftStore.setState({
      flush: vi.fn(async () => {
        calls.push('flush')
      }),
    })
    data.createTournamentFromDraft.mockImplementation(async () => {
      calls.push('create')
      return { tournament_id: 't1', slug: 'copa-club' }
    })

    const { result } = renderHook(() => useDraftActions())
    await act(async () => {
      await result.current.createTournament()
    })

    expect(calls).toEqual(['flush', 'create'])
    expect(data.createTournamentFromDraft).toHaveBeenCalledWith('d1')
    expect(router.push).toHaveBeenCalledWith('/organizador/copa-club/jugadores')
  })

  it('createTournament propaga el error del server (el footer lo muestra)', async () => {
    initStore('d1')
    useDraftStore.setState({ flush: vi.fn(async () => {}) })
    data.createTournamentFromDraft.mockRejectedValue(new Error('Falta la cancha'))

    const { result } = renderHook(() => useDraftActions())
    await expect(result.current.createTournament()).rejects.toThrow('Falta la cancha')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('createTournament frena si quedaron cambios sin guardar después del flush', async () => {
    initStore('d1')
    // El autosave no pudo confirmar: la cola sigue con cambios.
    useDraftStore.getState().applyChange({ name: 'Copa' }, 'manual')
    useDraftStore.setState({ flush: vi.fn(async () => {}) })

    const { result } = renderHook(() => useDraftActions())
    await expect(result.current.createTournament()).rejects.toThrow(/No se pudieron guardar/)
    expect(data.createTournamentFromDraft).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('applyAssistantConfig no pisa lo que el organizador está escribiendo', () => {
    initStore()
    const { result } = renderHook(() => useDraftActions())
    act(() => result.current.applyChangeManual({ name: 'Copa del Cl' }))

    const next = { ...createInitialConfig(), name: '', format: 'scramble' as const }
    act(() => result.current.applyAssistantConfig({}, next, 'Listo.', []))

    const store = useDraftStore.getState()
    expect(store.config?.format).toBe('scramble')
    expect(store.config?.name).toBe('Copa del Cl')
    expect(store.pendingChanges).toHaveLength(1)
  })

  it('createTournament sin borrador activo no llama al server', async () => {
    const { result } = renderHook(() => useDraftActions())
    await act(async () => {
      await result.current.createTournament()
    })
    expect(data.createTournamentFromDraft).not.toHaveBeenCalled()
  })
})
