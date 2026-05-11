// src/lib/draft/deep-merge-config.ts
import type { TournamentConfig, TournamentConfigPartial } from './types'

const ARRAY_KEY_BY_FIELD: Record<string, 'id' | 'round_number'> = {
  categories: 'id',
  prizes: 'id',
  rounds: 'round_number',
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function mergeArrayByKey<T extends Record<string, unknown>>(
  base: T[],
  patch: T[],
  key: keyof T
): T[] {
  const baseMap = new Map(base.map(item => [item[key], item]))
  for (const item of patch) {
    const existing = baseMap.get(item[key])
    if (existing) {
      baseMap.set(item[key], { ...existing, ...item })
    } else {
      baseMap.set(item[key], item)
    }
  }
  return Array.from(baseMap.values())
}

export function deepMergeConfig(
  base: TournamentConfig,
  partial: TournamentConfigPartial
): TournamentConfig {
  const result = { ...base } as Record<string, unknown>

  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) continue
    if (v === null) {
      result[k] = null
      continue
    }
    if (Array.isArray(v) && k in ARRAY_KEY_BY_FIELD) {
      const matchKey = ARRAY_KEY_BY_FIELD[k]
      result[k] = mergeArrayByKey(
        Array.isArray(base[k as keyof TournamentConfig]) ? (base[k as keyof TournamentConfig] as Record<string, unknown>[]) : [],
        v as Record<string, unknown>[],
        matchKey,
      )
      continue
    }
    if (isPlainObject(v) && isPlainObject(result[k])) {
      result[k] = { ...(result[k] as object), ...v }
      continue
    }
    result[k] = v
  }

  return result as TournamentConfig
}
