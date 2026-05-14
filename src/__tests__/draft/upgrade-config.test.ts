// src/__tests__/draft/upgrade-config.test.ts
import { describe, it, expect } from 'vitest'
import { upgradeConfig, CURRENT_SCHEMA_VERSION } from '@/lib/draft/upgrade-config'

describe('upgradeConfig', () => {
  it('CURRENT_SCHEMA_VERSION es 1 (estado inicial)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1)
  })

  it('config con schema_version=1 retorna sin cambios', () => {
    const c: any = { schema_version: 1, name: 'X' }
    const r = upgradeConfig(c)
    expect(r.schema_version).toBe(1)
    expect(r.name).toBe('X')
  })

  it('throw si schema_version es desconocida (futuro)', () => {
    const c: any = { schema_version: 99 }
    expect(() => upgradeConfig(c)).toThrow(/schema_version 99/)
  })

  it('throw si schema_version falta', () => {
    const c: any = { name: 'X' }
    expect(() => upgradeConfig(c)).toThrow(/schema_version/)
  })
})
