// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createInitialConfig } from '@/lib/draft/initial-config'
import { useDraftStore } from '@/lib/draft/store'
import type { DraftRecord } from '@/lib/data/tournament-drafts'
import { TOURNAMENT_TEMPLATES } from '../tournament-templates'

const router = { replace: vi.fn(), push: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const data = vi.hoisted(() => ({
  fetchDraft: vi.fn(),
  createDraft: vi.fn(),
  duplicateDraftFromTournament: vi.fn(),
  saveDraftPartial: vi.fn(),
}))
vi.mock('@/lib/data/tournament-drafts', () => data)

import { useDraftSession } from './useDraftSession'

function record(id: string, over: Partial<DraftRecord> = {}): DraftRecord {
  return { id, config: createInitialConfig(), version: 1, collaborators: [], ...over }
}

beforeEach(() => {
  vi.clearAllMocks()
  useDraftStore.getState().reset()
  data.saveDraftPartial.mockResolvedValue({ kind: 'ok', version: 2, config: createInitialConfig() })
})

afterEach(() => {
  useDraftStore.getState().reset()
})

describe('useDraftSession — carga por URL', () => {
  it('con initialDraftId carga el borrador al store y no muestra el modal', async () => {
    data.fetchDraft.mockResolvedValue(
      record('d1', { version: 7, collaborators: [{ user_id: 'u1', role: 'owner', name: 'Juanjo' }] }),
    )

    const { result } = renderHook(() => useDraftSession('d1'))

    expect(result.current.showStartModal).toBe(false)
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(data.fetchDraft).toHaveBeenCalledWith('d1')
    const store = useDraftStore.getState()
    expect(store.draftId).toBe('d1')
    expect(store.version).toBe(7)
    expect(store.collaborators).toEqual([{ user_id: 'u1', role: 'owner', name: 'Juanjo' }])
    expect(result.current.loadError).toBeNull()
  })

  it('si la carga falla, expone el mensaje del server', async () => {
    data.fetchDraft.mockRejectedValue(new Error('No encontrado'))

    const { result } = renderHook(() => useDraftSession('missing'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.loadError).toBe('No encontrado')
    expect(useDraftStore.getState().draftId).toBeNull()
  })

  it('sin initialDraftId muestra el modal y no llama al server', () => {
    const { result } = renderHook(() => useDraftSession(undefined))
    expect(result.current.showStartModal).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(data.fetchDraft).not.toHaveBeenCalled()
  })

  it('al desmontar limpia el store', async () => {
    data.fetchDraft.mockResolvedValue(record('d1'))
    const { result, unmount } = renderHook(() => useDraftSession('d1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(useDraftStore.getState().draftId).toBe('d1')

    unmount()

    expect(useDraftStore.getState().draftId).toBeNull()
  })
})

describe('useDraftSession — modal de arranque', () => {
  it('empezar desde cero: crea, refleja el id en la URL y carga el borrador', async () => {
    data.createDraft.mockResolvedValue(record('new1'))
    data.fetchDraft.mockResolvedValue(record('new1', { version: 1 }))

    const { result } = renderHook(() => useDraftSession(undefined))
    await act(async () => {
      await result.current.startFromScratch()
    })

    expect(router.replace).toHaveBeenCalledWith('/organizador/nuevo?draft=new1')
    expect(result.current.showStartModal).toBe(false)
    await waitFor(() => expect(useDraftStore.getState().draftId).toBe('new1'))
    expect(result.current.creating).toBe(false)
    // Sin plantilla, la config queda tal cual vino del server.
    expect(useDraftStore.getState().pendingChanges).toHaveLength(0)
  })

  it('empezar con plantilla: aplica formato, modo y hoyos UNA vez cargado el borrador', async () => {
    const scramble = TOURNAMENT_TEMPLATES.find((t) => t.format === 'scramble')!
    const config = createInitialConfig()
    config.rounds = [{ ...config.rounds[0], hole_count: 9 }]
    data.createDraft.mockResolvedValue(record('tpl1'))
    data.fetchDraft.mockResolvedValue(record('tpl1', { config }))

    const { result } = renderHook(() => useDraftSession(undefined))
    await act(async () => {
      await result.current.startFromTemplate(scramble)
    })

    await waitFor(() => expect(useDraftStore.getState().draftId).toBe('tpl1'))
    const store = useDraftStore.getState()
    expect(store.config?.format).toBe('scramble')
    expect(store.config?.modo).toBe('neto')
    expect(store.config?.rounds[0].hole_count).toBe(18)
    // La plantilla entra por applyChange: queda encolada para el autosave.
    expect(store.pendingChanges).toHaveLength(1)
  })

  it('duplicar desde torneo: usa el endpoint de duplicado', async () => {
    data.duplicateDraftFromTournament.mockResolvedValue(record('dup1'))
    data.fetchDraft.mockResolvedValue(record('dup1'))

    const { result } = renderHook(() => useDraftSession(undefined))
    await act(async () => {
      await result.current.duplicateFromTournament('t-99')
    })

    expect(data.duplicateDraftFromTournament).toHaveBeenCalledWith('t-99')
    expect(router.replace).toHaveBeenCalledWith('/organizador/nuevo?draft=dup1')
    await waitFor(() => expect(useDraftStore.getState().draftId).toBe('dup1'))
  })

  it('si crear falla, el modal sigue abierto con el error y sin spinner', async () => {
    data.createDraft.mockRejectedValue(new Error('Sin cupo'))

    const { result } = renderHook(() => useDraftSession(undefined))
    await act(async () => {
      await result.current.startFromScratch()
    })

    expect(result.current.showStartModal).toBe(true)
    expect(result.current.loadError).toBe('Sin cupo')
    expect(result.current.creating).toBe(false)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('reanudar un borrador: cierra el modal y carga ese id', async () => {
    data.fetchDraft.mockResolvedValue(record('old1'))

    const { result } = renderHook(() => useDraftSession(undefined))
    act(() => {
      result.current.resumeDraft('old1')
    })

    expect(result.current.showStartModal).toBe(false)
    expect(router.replace).toHaveBeenCalledWith('/organizador/nuevo?draft=old1')
    await waitFor(() => expect(useDraftStore.getState().draftId).toBe('old1'))
  })
})
