// src/lib/draft/deep-merge-config.ts
//
// Merge de un partial sobre la config del borrador, y de un partial sobre otro.
// Lo usan el server (PATCH), el store (optimista, fold de la cola, compactación)
// y la validación en cliente: todos tienen que llegar al mismo estado o el
// autosave "revierte" campos en pantalla.
//
// Reglas, en todos los niveles (raíz, sub-objetos e items de array):
//   `undefined` → no tocar el campo (JSON lo descarta, así que el server
//                 tampoco lo vería: local y server quedan iguales).
//   `null`      → el campo queda en null ("sin valor"). El schema decide
//                 dónde null es válido.
//   listas con clave (categories, prizes, rounds) → merge item a item por clave,
//                 con las marcas de `list-markers.ts`: `_delete` borra el item,
//                 `_replace` lo reemplaza entero.
//   el resto de valores → el partial gana.
//
// Dos modos, porque una lápida significa cosas distintas según sobre qué cae:
//   - `deepMergeConfig` (partial → config): la lápida BORRA el item y ninguna
//     marca queda en el resultado.
//   - `mergePartials` (partial → partial, cola del autosave): la lápida SE
//     CONSERVA, para que el borrado viaje al server. Si se aplicara como en la
//     config, borraría el item del partial pendiente y a sí misma, y el server
//     nunca se enteraría.
import type { TournamentConfig, TournamentConfigPartial } from './types'
import { LIST_ITEM_KEY, isListField, isReplace, isTombstone, stripMarkers } from './list-markers'

type Item = Record<string, unknown>
type Mode = 'config' | 'partial'

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

function mergeListItems(base: Item[], patch: Item[], key: string, mode: Mode): Item[] {
  const map = new Map(base.map((item) => [item[key], item]))
  for (const item of patch) {
    const k = item[key]
    const existing = map.get(k)
    if (isTombstone(item)) {
      // Config: el item desaparece. Partial: la lápida reemplaza lo pendiente
      // de ese item (no tiene sentido mandar ediciones de algo borrado).
      if (mode === 'config') map.delete(k)
      else map.set(k, item)
      continue
    }
    if (mode === 'config') {
      map.set(k, isReplace(item) || !existing ? stripMarkers(mergeDefined({}, item)) : mergeDefined(existing, item))
      continue
    }
    // Partial sobre partial: un item después de una lápida es un reemplazo
    // (borrar + volver a crear con la misma clave); un `_replace` gana entero.
    if (existing && isTombstone(existing)) map.set(k, { ...mergeDefined({}, item), _replace: true })
    else if (isReplace(item) || !existing) map.set(k, mergeDefined({}, item))
    else map.set(k, mergeDefined(existing, item))
  }
  return Array.from(map.values())
}

function mergeInto(base: Record<string, unknown>, partial: Record<string, unknown>, mode: Mode): Record<string, unknown> {
  const result = { ...base }
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) continue
    if (v === null) {
      result[k] = null
      continue
    }
    if (Array.isArray(v) && isListField(k)) {
      const current = base[k]
      let merged = mergeListItems(Array.isArray(current) ? (current as Item[]) : [], v as Item[], LIST_ITEM_KEY[k], mode)
      // Las rondas se guardan ordenadas: un reemplazo o renumeración las reinsertaba al final.
      if (k === 'rounds') merged = merged.slice().sort((a, b) => Number(a.round_number) - Number(b.round_number))
      result[k] = merged
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
  return result
}

/** Aplica un partial sobre la config: resultado sin marcas, listas ya borradas/reemplazadas. */
export function deepMergeConfig(base: TournamentConfig, partial: TournamentConfigPartial): TournamentConfig {
  return mergeInto(base as unknown as Record<string, unknown>, partial as Record<string, unknown>, 'config') as unknown as TournamentConfig
}

/** Combina dos partials de la cola conservando las marcas (el borrado tiene que viajar). */
export function mergePartials(a: TournamentConfigPartial, b: TournamentConfigPartial): TournamentConfigPartial {
  return mergeInto(a as Record<string, unknown>, b as Record<string, unknown>, 'partial') as TournamentConfigPartial
}
