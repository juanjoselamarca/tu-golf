// src/lib/draft/list-markers.ts
//
// Marcas de los items de listas del borrador (categories, prizes, rounds) en un
// partial. Las listas se mergean item a item por clave (así la IA y dos
// colaboradores no se pisan), lo que hace imposible BORRAR mandando la lista sin
// el item: el merge lo conserva. Por eso el borrado y el reemplazo se dicen
// explícitamente:
//   `_delete: true`  → el item con esa clave se elimina (lápida).
//   `_replace: true` → el item reemplaza entero al de esa clave (no se mergea
//                      campo a campo). Lo usan las rondas al renumerarse.
// Las marcas viven solo en partials: `deepMergeConfig` las aplica y nunca las
// deja en la config. El merge ordena las rondas pero NO las renumera: un patch
// que borre solo la ronda 2 de 3 deja {1,3}. Quien borra rondas renumera antes
// (`eliminarRonda` + `listPatchFrom`); `validateGolfRules` exige 1..N al crear.

import type { ListPatch } from './types'

export interface ListItemMarkers {
  _delete?: true
  _replace?: true
}

/** Campos lista del config y la clave con que se identifican sus items. */
export const LIST_ITEM_KEY = {
  categories: 'id',
  prizes: 'id',
  rounds: 'round_number',
} as const

export type ListField = keyof typeof LIST_ITEM_KEY

export function isListField(field: string): field is ListField {
  return field in LIST_ITEM_KEY
}

/** Lápida: borra el item con esa clave. */
export function tombstone<K extends string, V>(key: K, value: V): { [P in K]: V } & ListItemMarkers {
  return { [key]: value, _delete: true } as { [P in K]: V } & ListItemMarkers
}

export function isTombstone(item: unknown): boolean {
  return typeof item === 'object' && item !== null && (item as ListItemMarkers)._delete === true
}

export function isReplace(item: unknown): boolean {
  return typeof item === 'object' && item !== null && (item as ListItemMarkers)._replace === true
}

/** El item sin marcas (lo que queda en la config). */
export function stripMarkers<T extends Record<string, unknown>>(item: T): T {
  const { _delete: _d, _replace: _r, ...rest } = item as T & ListItemMarkers
  return rest as T
}

/**
 * Patch que lleva una lista de `prev` a `next` sin depender del merge por clave:
 * lápida para cada clave que ya no está, `_replace` para la que cambió (p. ej. una
 * ronda renumerada que ocupa el número de otra) y el item nuevo tal cual. Lo que
 * no cambió no viaja. Es la única forma de BORRAR de una lista del borrador.
 */
export function listPatchFrom<T extends object, K extends keyof T & string>(
  prev: readonly T[],
  next: readonly T[],
  key: K,
): ListPatch<T, K> {
  const nextKeys = new Set(next.map((i) => i[key]))
  const prevByKey = new Map(prev.map((i) => [i[key], i]))
  const patch: ListPatch<T, K> = []
  for (const p of prev) {
    if (!nextKeys.has(p[key])) patch.push(tombstone(key, p[key]) as Pick<T, K> & { _delete: true })
  }
  for (const n of next) {
    const before = prevByKey.get(n[key])
    if (!before) patch.push(n)
    else if (JSON.stringify(before) !== JSON.stringify(n)) patch.push({ ...n, _replace: true })
  }
  return patch
}
