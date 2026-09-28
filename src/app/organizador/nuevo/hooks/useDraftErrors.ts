'use client'

// src/app/organizador/nuevo/hooks/useDraftErrors.ts
//
// Errores del borrador agrupados por key raíz del config, para mostrarlos
// debajo de la sección que edita esa key. Dos fuentes: partials que no pasaron
// el schema en cliente (`invalidChanges`) y cambios rechazados por el server
// (`pendingChanges[].rejected`).

import { useMemo } from 'react'
import { useDraftStore } from '@/lib/draft/store'
import { describeIssue, issueRootKey } from '@/lib/draft/field-labels'

export interface DraftErrors {
  /** key raíz → mensajes (sin repetir). */
  byKey: Record<string, string[]>
  /** Todos los mensajes, para el resumen del header. */
  summary: string | null
}

export function useDraftErrors(): DraftErrors {
  const invalidChanges = useDraftStore((s) => s.invalidChanges)
  const pendingChanges = useDraftStore((s) => s.pendingChanges)
  const baseIssues = useDraftStore((s) => s.baseIssues)

  return useMemo(() => {
    const byKey: Record<string, string[]> = {}
    const add = (key: string, message: string) => {
      const list = (byKey[key] ??= [])
      if (!list.includes(message)) list.push(message)
    }
    // Se atribuye por `issue.path[0]` (la key raíz del campo con problema); si
    // no hay issues con path, por las keys del partial.
    const keysOf = (partial: object, issues?: Array<{ path: Array<string | number> }>) => {
      const fromIssues = (issues ?? []).map(issueRootKey).filter((k) => k in partial)
      return fromIssues.length > 0 ? Array.from(new Set(fromIssues)) : Object.keys(partial)
    }
    // La config del server ya viene inválida (base): se muestra desde el
    // principio donde vive cada issue, no recién cuando algo queda bloqueado.
    for (const issue of baseIssues) add(issueRootKey(issue), describeIssue(issue))
    for (const i of invalidChanges) {
      for (const key of keysOf(i.partial, i.issues)) add(key, i.message)
    }
    for (const c of pendingChanges) {
      if (c.rejected) {
        for (const key of keysOf(c.partial)) add(key, c.rejected)
      }
      // Bloqueado por una base inválida: el problema se muestra donde vive
      // (las keys de la base), no debajo del cambio inocente.
      if (c.blocked) {
        for (const key of c.blocked.keys) add(key, c.blocked.message)
      }
    }
    const all = Array.from(new Set(Object.values(byKey).flat()))
    return { byKey, summary: all.length > 0 ? all.join('; ') : null }
  }, [invalidChanges, pendingChanges, baseIssues])
}
