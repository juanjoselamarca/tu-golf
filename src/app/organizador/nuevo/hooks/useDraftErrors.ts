'use client'

// src/app/organizador/nuevo/hooks/useDraftErrors.ts
//
// Errores del borrador agrupados por key raíz del config, para mostrarlos
// debajo de la sección que edita esa key. Dos fuentes: partials que no pasaron
// el schema en cliente (`invalidChanges`) y cambios rechazados por el server
// (`pendingChanges[].rejected`).

import { useMemo } from 'react'
import { useDraftStore } from '@/lib/draft/store'

export interface DraftErrors {
  /** key raíz → mensajes (sin repetir). */
  byKey: Record<string, string[]>
  /** Todos los mensajes, para el resumen del header. */
  summary: string | null
}

export function useDraftErrors(): DraftErrors {
  const invalidChanges = useDraftStore((s) => s.invalidChanges)
  const pendingChanges = useDraftStore((s) => s.pendingChanges)

  return useMemo(() => {
    const byKey: Record<string, string[]> = {}
    const add = (key: string, message: string) => {
      const list = (byKey[key] ??= [])
      if (!list.includes(message)) list.push(message)
    }
    for (const i of invalidChanges) {
      for (const key of Object.keys(i.partial)) add(key, i.message)
    }
    for (const c of pendingChanges) {
      if (!c.rejected) continue
      for (const key of Object.keys(c.partial)) add(key, c.rejected)
    }
    const all = Array.from(new Set(Object.values(byKey).flat()))
    return { byKey, summary: all.length > 0 ? all.join('; ') : null }
  }, [invalidChanges, pendingChanges])
}
