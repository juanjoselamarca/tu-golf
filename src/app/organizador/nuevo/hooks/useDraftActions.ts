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
import { useDraftStore } from '@/lib/draft/store'
import { createTournamentFromDraft } from '@/lib/data/tournament-drafts'
import type { TournamentConfig, TournamentConfigPartial } from '@/lib/draft/types'

export type ApplyChangeManual = (partial: Partial<TournamentConfig>) => void

export type ApplyAssistantConfig = (
  partial: TournamentConfigPartial,
  nextConfig: TournamentConfig,
  explanation: string,
  needsConfirmation: string[],
) => void

export interface DraftActions {
  applyChangeManual: ApplyChangeManual
  applyAssistantConfig: ApplyAssistantConfig
  createTournament: () => Promise<void>
}

export function useDraftActions(): DraftActions {
  const router = useRouter()
  const applyChange = useDraftStore((s) => s.applyChange)
  const init = useDraftStore((s) => s.init)

  const applyChangeManual = useCallback<ApplyChangeManual>(
    (partial) => {
      applyChange(partial, 'manual')
    },
    [applyChange],
  )

  // El server ya merged y aumentó version, así que reusamos `init` para reemplazar
  // el state del store con el config completo y el nuevo version.
  const applyAssistantConfig = useCallback<ApplyAssistantConfig>(
    (_partial, nextConfig) => {
      const state = useDraftStore.getState()
      if (!state.draftId) return
      // Re-init manteniendo collaborators actuales y bumpeando version local.
      // El server ya devolvió la versión final; tomamos nuestra versión + 1
      // como aproximación (el próximo PATCH va a re-sincronizar si quedó atrás).
      init(state.draftId, {
        config: nextConfig,
        version: state.version + 1,
        collaborators: state.collaborators,
      })
    },
    [init],
  )

  const createTournament = useCallback(async () => {
    const store = useDraftStore.getState()
    if (!store.draftId) return
    // Asegurar que el último cambio esté flushed antes de crear.
    await store.flush()
    const { slug } = await createTournamentFromDraft(store.draftId)
    router.push(`/organizador/${slug}/jugadores`)
  }, [router])

  return { applyChangeManual, applyAssistantConfig, createTournament }
}
