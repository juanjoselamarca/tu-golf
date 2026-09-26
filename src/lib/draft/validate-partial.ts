// src/lib/draft/validate-partial.ts
//
// Validación en cliente de un partial del borrador con la MISMA fuente que el
// server (`tournamentConfigPartialSchema`, la que corre el PATCH). Un partial
// que no pasa acá tampoco pasaría allá: no se encola ni se envía, el organizador
// lo corrige con el error a la vista.

import { tournamentConfigPartialSchema } from './schema'
import type { TournamentConfigPartial } from './types'
import { describeIssues, type FieldIssue } from './field-labels'

export type PartialValidation =
  | { ok: true }
  | { ok: false; issues: FieldIssue[]; message: string }

export function validatePartial(partial: TournamentConfigPartial): PartialValidation {
  const result = tournamentConfigPartialSchema.safeParse(partial)
  if (result.success) return { ok: true }
  const issues = result.error.issues as unknown as FieldIssue[]
  return { ok: false, issues, message: describeIssues(issues) }
}
