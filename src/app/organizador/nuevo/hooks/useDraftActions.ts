'use client'

// src/app/organizador/nuevo/hooks/useDraftActions.ts
//
// Acciones del editor sobre el borrador activo:
// - `applyChangeManual`: firma simple (Partial<TournamentConfig>) que esperan
//   las secciones del formulario.
// - `applyAssistantConfig`: el asistente IA ya persistió server-side; el store
//   toma la config resultante.
// - `createTournament`: flushea el autosave y convierte el borrador en torneo.

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { selectRejectionMessage, useDraftStore } from '@/lib/draft/store'
import { createTournamentFromDraft } from '@/lib/data/tournament-drafts'
import type { TournamentConfig, TournamentConfigPartial } from '@/lib/draft/types'

export type ApplyChangeManual = (partial: Partial<TournamentConfig>) => void

export type ApplyAssistantConfig = (
  partial: TournamentConfigPartial,
  nextConfig: TournamentConfig,
  explanation: string,
  needsConfirmation: string[],
  version: number,
) => void

export interface DraftActions {
  applyChangeManual: ApplyChangeManual
  applyAssistantConfig: ApplyAssistantConfig
  createTournament: () => Promise<void>
  /** Salida garantizada del estado inválido/rechazado: vuelve a lo guardado. */
  discardUnsaved: () => Promise<void>
}

export function useDraftActions(): DraftActions {
  const router = useRouter()
  const applyChange = useDraftStore((s) => s.applyChange)
  const applyServerConfig = useDraftStore((s) => s.applyServerConfig)

  const applyChangeManual = useCallback<ApplyChangeManual>(
    (partial) => {
      applyChange(partial, 'manual')
    },
    [applyChange],
  )

  // El server ya merged y devolvió la versión final. El store toma esa config
  // SIN pisar lo que el organizador tenga a medio escribir (cambios pendientes
  // van encima) y la descarta si es más vieja que lo que ya guardó.
  const applyAssistantConfig = useCallback<ApplyAssistantConfig>(
    (_partial, nextConfig, _explanation, _needsConfirmation, version) => {
      applyServerConfig(nextConfig, version)
    },
    [applyServerConfig],
  )

  const createTournament = useCallback(async () => {
    const store = useDraftStore.getState()
    if (!store.draftId) return
    // Asegurar que el último cambio esté flushed antes de crear. Si el autosave
    // no pudo confirmar (sin red, conflicto), el torneo se crearía con la config
    // vieja del server: mejor frenar y decirlo.
    await store.flush()
    const after = useDraftStore.getState()
    if (after.invalidChanges.length > 0) {
      // Hay campos en pantalla que no pasan el schema: no están guardados.
      throw new Error(`Hay campos por corregir: ${after.invalidChanges.map((i) => i.message).join('; ')}`)
    }
    const rejection = selectRejectionMessage(after)
    if (rejection) {
      // El server rechazó un cambio: el motivo es del server, no de la red.
      throw new Error(rejection)
    }
    if (after.pendingChanges.length > 0) {
      throw new Error('No se pudieron guardar los últimos cambios. Revisa tu conexión e intenta de nuevo.')
    }
    const { slug } = await createTournamentFromDraft(store.draftId)
    router.push(`/organizador/${slug}/jugadores`)
  }, [router])

  const discardUnsaved = useCallback(() => useDraftStore.getState().discardUnsaved(), [])

  return { applyChangeManual, applyAssistantConfig, createTournament, discardUnsaved }
}
