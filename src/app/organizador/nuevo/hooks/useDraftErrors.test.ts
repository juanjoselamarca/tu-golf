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

    // Descripción de premio: tiene input propio → el motivo va junto al campo.
    expect(result.current.byPath).toEqual({ 'prizes.0.description': 'Obligatorio' })
    // Sin campo propio (formato de la base, rechazo sin path, bloqueo) → bajo la sección.
    expect(result.current.sectionMessages).toEqual({
      format: ['Formato: opción inválida'],
      name: ['regla del server'],
      modo: ['modo: opción inválida'],
    })
    // Un inválido en cliente + un rechazado + un bloqueado.
    expect(result.current.count).toBe(3)
    expect(result.current.summary).toBe('4 campos por corregir · Formato: opción inválida')
  })

  it('un rechazo del server con path marca el campo exacto, no la sección', () => {
    useDraftStore.getState().init('d1', { config: createInitialConfig(), version: 1, collaborators: [] })
    useDraftStore.setState({
      pendingChanges: [
        {
          partial: { name: 'x'.repeat(61) },
          source: 'manual',
          timestamp: 1,
          rejected: 'Nombre: máximo 60 caracteres',
          rejectedIssues: [{ path: ['name'], code: 'too_big', origin: 'string', maximum: 60, message: 'Too big' }],
        },
      ],
    })
    const { result } = renderHook(() => useDraftErrors())
    expect(result.current.byPath).toEqual({ name: 'Máximo 60 caracteres' })
    expect(result.current.sectionMessages).toEqual({})
    expect(result.current.count).toBe(1)
  })

  it('sin problemas no hay resumen', () => {
    useDraftStore.getState().init('d1', { config: createInitialConfig(), version: 1, collaborators: [] })
    const { result } = renderHook(() => useDraftErrors())
    expect(result.current.byPath).toEqual({})
    expect(result.current.sectionMessages).toEqual({})
    expect(result.current.count).toBe(0)
    expect(result.current.summary).toBeNull()
  })
})
