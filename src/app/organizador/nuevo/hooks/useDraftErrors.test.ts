// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createInitialConfig } from '@/lib/draft/initial-config'
import { useDraftStore } from '@/lib/draft/store'

const data = vi.hoisted(() => ({ saveDraftPartial: vi.fn(), fetchDraft: vi.fn() }))
vi.mock('@/lib/data/tournament-drafts', () => data)

import { useDraftErrors } from './useDraftErrors'

beforeEach(() => {
  useDraftStore.getState().reset()
  window.localStorage.clear()
})
afterEach(() => {
  useDraftStore.getState().reset()
  window.localStorage.clear()
})

describe('useDraftErrors', () => {
  it('atribuye por key raíz: base inválida, inválidos en cliente, rechazados y bloqueados', () => {
    useDraftStore.getState().init('d1', {
      config: { ...createInitialConfig(), format: 'stroke' as never },
      version: 1,
      collaborators: [],
    })
    const store = useDraftStore.getState()
    store.applyChange({ prizes: [{ id: 'p1', type: 'special', description: '' }] }, 'manual')
    useDraftStore.setState({
      pendingChanges: [
        { partial: { name: 'x' }, source: 'manual', timestamp: 1, rejected: 'regla del server' },
        { partial: { date_start: '2026-10-10' }, source: 'manual', timestamp: 2, blocked: { keys: ['modo'], message: 'modo: opción inválida' } },
      ],
    })

    const { result } = renderHook(() => useDraftErrors())

    expect(result.current.byKey).toEqual({
      format: ['formato: opción inválida'],
      prizes: ['premio 1 · descripción: obligatorio'],
      name: ['regla del server'],
      modo: ['modo: opción inválida'],
    })
    expect(result.current.summary).toContain('formato: opción inválida')
  })

  it('sin problemas no hay resumen', () => {
    useDraftStore.getState().init('d1', { config: createInitialConfig(), version: 1, collaborators: [] })
    const { result } = renderHook(() => useDraftErrors())
    expect(result.current.byKey).toEqual({})
    expect(result.current.summary).toBeNull()
  })
})
