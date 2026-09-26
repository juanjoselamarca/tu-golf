// src/lib/draft/validate-partial.ts
//
// Validación en cliente de un partial del borrador con la MISMA fuente que el
// server: el schema parcial (lo que el PATCH acepta como entrada) y el schema
// completo sobre la config resultante del merge (lo que el PATCH valida antes
// de persistir). Un partial que no pasa acá tampoco pasaría allá: no se encola
// ni se envía, el organizador lo corrige con el error a la vista.

import { tournamentConfigPartialSchema, tournamentConfigSchema } from './schema'
import { deepMergeConfig } from './deep-merge-config'
import type { TournamentConfig, TournamentConfigPartial } from './types'
import { describeIssues, type FieldIssue } from './field-labels'

export type PartialValidation =
  | { ok: true }
  | { ok: false; issues: FieldIssue[]; message: string }

/**
 * @param base Config actual: si se pasa, también se valida la config completa
 *   resultante del merge, quedándose solo con los issues de las keys que el
 *   partial toca (un problema previo en otra key no es culpa de este cambio).
 */
export function validatePartial(partial: TournamentConfigPartial, base?: TournamentConfig): PartialValidation {
  const keys = new Set(Object.keys(partial))
  let issues: FieldIssue[] = []

  const asPartial = tournamentConfigPartialSchema.safeParse(partial)
  if (!asPartial.success) {
    issues = asPartial.error.issues as unknown as FieldIssue[]
  } else if (base) {
    const merged = tournamentConfigSchema.safeParse(deepMergeConfig(base, partial))
    if (!merged.success) {
      issues = (merged.error.issues as unknown as FieldIssue[]).filter((i) => keys.has(String(i.path[0])))
    }
  }

  if (issues.length === 0) return { ok: true }
  return { ok: false, issues, message: describeIssues(issues) }
}
