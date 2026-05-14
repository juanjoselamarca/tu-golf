// src/__tests__/draft/deep-merge-config.test.ts
import { describe, it, expect } from 'vitest'
import { deepMergeConfig } from '@/lib/draft/deep-merge-config'

describe('deepMergeConfig', () => {
  it('merge primitivos: el partial gana', () => {
    const base = { name: 'A', format: 'stroke_play' }
    const partial = { name: 'B' }
    expect(deepMergeConfig(base as any, partial as any)).toMatchObject({ name: 'B', format: 'stroke_play' })
  })

  it('merge nested objects: deep', () => {
    const base = { team_config: { size: 2, formation_mode: 'random' } }
    const partial = { team_config: { size: 4 } }
    expect(deepMergeConfig(base as any, partial as any)).toMatchObject({ team_config: { size: 4, formation_mode: 'random' } })
  })

  it('merge array de categorías: match por id', () => {
    const base = { categories: [{ id: '1', name: 'Damas' }, { id: '2', name: 'Varones A' }] }
    const partial = { categories: [{ id: '2', name: 'Varones Senior' }] }
    expect(deepMergeConfig(base as any, partial as any).categories).toEqual([
      { id: '1', name: 'Damas' },
      { id: '2', name: 'Varones Senior' },
    ])
  })

  it('merge array de rondas: match por round_number', () => {
    const base = { rounds: [{ round_number: 1, date: '2026-07-12' }, { round_number: 2, date: '2026-07-13' }] }
    const partial = { rounds: [{ round_number: 2, date: '2026-07-20' }] }
    expect(deepMergeConfig(base as any, partial as any).rounds).toEqual([
      { round_number: 1, date: '2026-07-12' },
      { round_number: 2, date: '2026-07-20' },
    ])
  })

  it('agrega items nuevos al array si el id no existe', () => {
    const base = { categories: [{ id: '1', name: 'A' }] }
    const partial = { categories: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] }
    expect(deepMergeConfig(base as any, partial as any).categories).toHaveLength(2)
  })

  it('null en partial elimina el campo', () => {
    const base = { cover_image_url: 'http://x.png' }
    const partial = { cover_image_url: null }
    expect(deepMergeConfig(base as any, partial as any).cover_image_url).toBeNull()
  })

  it('undefined en partial es ignorado', () => {
    const base = { name: 'A' }
    const partial = { name: undefined }
    expect(deepMergeConfig(base as any, partial as any).name).toBe('A')
  })
})
