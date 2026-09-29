// src/lib/draft/deep-merge-config.ts
//
// Merge de un partial sobre la config del borrador. Lo usan el server (PATCH),
// el store (optimista) y el fold de la cola: los tres tienen que dejar el
// mismo estado o el autosave "revierte" campos en pantalla.
//
// Reglas, en todos los niveles (raíz, sub-objetos e items de array):
//   `undefined` → no tocar el campo (JSON lo descarta, así que el server
//                 tampoco lo vería: local y server quedan iguales).
//   `null`      → el campo queda en null ("sin valor"). El schema decide
//                 dónde null es válido.
//   arrays con id (categories, prizes, rounds) → merge item a item por clave;
//   el resto de valores → el partial gana.
import type { TournamentConfig, TournamentConfigPartial } from './types'

const ARRAY_KEY_BY_FIELD: Record<string, 'id' | 'round_number'> = {
  categories: 'id',
  prizes: 'id',
  rounds: 'round_number',
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Spread que ignora `undefined` (mismo resultado que JSON.stringify + spread). */
function mergeDefined<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    result[k] = v
  }
  return result as T
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
      baseMap.set(item[key], mergeDefined(existing, item))
    } else {
      baseMap.set(item[key], mergeDefined({} as T, item))
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
      const baseArr = base[k as keyof TournamentConfig]
      result[k] = mergeArrayByKey(
        Array.isArray(baseArr) ? (baseArr as unknown as Record<string, unknown>[]) : [],
        v as unknown as Record<string, unknown>[],
        matchKey,
      )
      continue
    }
    if (isPlainObject(v) && isPlainObject(result[k])) {
      result[k] = mergeDefined(result[k] as Record<string, unknown>, v)
      continue
    }
    if (isPlainObject(v)) {
      result[k] = mergeDefined({}, v)
      continue
    }
    result[k] = v
  }

  return result as unknown as TournamentConfig
}
