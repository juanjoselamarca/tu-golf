'use client'

// src/app/organizador/nuevo/hooks/useDraftErrors.ts
//
// Errores del borrador, repartidos donde el organizador los va a ver:
// - junto al campo (`byPath`), cuando el issue trae path y ese campo tiene input
//   propio (`isInlineFieldPath`);
// - debajo de la sección (`sectionMessages`), cuando no hay campo al que
//   apuntar (rechazo del server sin path, base inválida en una key sin input).
// Tres fuentes: base inválida del server (`baseIssues`), partials que no pasaron
// el schema en cliente (`invalidChanges`) y cambios rechazados/bloqueados.

import { useMemo } from 'react'
import { useDraftStore } from '@/lib/draft/store'
import {
  capitalizeFirst,
  describeIssue,
  describeIssueReason,
  issueDotPath,
  issueRootKey,
  type FieldIssue,
} from '@/lib/draft/field-labels'
import { isInlineFieldPath } from '../section-keys'

export interface DraftErrors {
  /** dot-path → motivo ("Obligatorio"), para el mensaje junto al input. */
  byPath: Record<string, string>
  /** key raíz → mensajes sin campo propio, para debajo de la sección. */
  sectionMessages: Record<string, string[]>
  /** Cambios sin guardar que el organizador tiene que resolver. */
  count: number
  /** Una línea para el header ("2 campos por corregir · Premio 1 · descripción: obligatorio"). */
  summary: string | null
}

export function useDraftErrors(): DraftErrors {
  const invalidChanges = useDraftStore((s) => s.invalidChanges)
  const pendingChanges = useDraftStore((s) => s.pendingChanges)
  const baseIssues = useDraftStore((s) => s.baseIssues)

  return useMemo(() => {
    const byPath: Record<string, string> = {}
    const sectionMessages: Record<string, string[]> = {}
    const all: string[] = []
    const note = (message: string) => {
      if (!all.includes(message)) all.push(message)
    }
    const toSection = (key: string, message: string) => {
      const list = (sectionMessages[key] ??= [])
      if (!list.includes(message)) list.push(message)
      note(message)
    }
    const fromIssue = (issue: FieldIssue) => {
      const dotPath = issueDotPath(issue)
      if (isInlineFieldPath(dotPath)) {
        byPath[dotPath] ??= capitalizeFirst(describeIssueReason(issue))
        note(describeIssue(issue))
      } else {
        toSection(issueRootKey(issue), describeIssue(issue))
      }
    }

    // La config del server ya viene inválida (base): se muestra desde el
    // principio donde vive cada issue, no recién cuando algo queda bloqueado.
    for (const issue of baseIssues) fromIssue(issue)
    for (const i of invalidChanges) {
      if (i.issues && i.issues.length > 0) i.issues.forEach(fromIssue)
      else for (const key of Object.keys(i.partial)) toSection(key, i.message)
    }
    for (const c of pendingChanges) {
      if (c.rejected) for (const key of Object.keys(c.partial)) toSection(key, c.rejected)
      // Bloqueado por una base inválida: el problema se muestra donde vive
      // (las keys de la base), no debajo del cambio inocente.
      if (c.blocked) for (const key of c.blocked.keys) toSection(key, c.blocked.message)
    }

    const count = invalidChanges.length + pendingChanges.filter((c) => c.rejected || c.blocked).length
    const summary =
      all.length === 0
        ? null
        : all.length === 1
          ? all[0]
          : `${all.length} campos por corregir · ${all[0]}`
    return { byPath, sectionMessages, count, summary }
  }, [invalidChanges, pendingChanges, baseIssues])
}
