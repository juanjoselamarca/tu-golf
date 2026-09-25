'use client'

// src/app/organizador/nuevo/hooks/useDraftSession.ts
//
// Ciclo de vida del borrador en el wizard:
// - Modal de arranque (desde cero / plantilla / duplicar / reanudar).
// - Carga del borrador activo al store cuando cambia `activeDraftId`.
// - Aplicación de la plantilla elegida UNA vez que el store quedó inicializado
//   (sin polling: se aplica en el mismo tick del `init`).
// - Limpieza del store al desmontar.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDraftStore } from '@/lib/draft/store'
import {
  createDraft,
  duplicateDraftFromTournament,
  fetchDraft,
  type DraftRecord,
} from '@/lib/data/tournament-drafts'
import { templateToPartial, type TournamentTemplate } from '../tournament-templates'

export interface DraftSession {
  activeDraftId: string | undefined
  loading: boolean
  loadError: string | null
  showStartModal: boolean
  creating: boolean
  startFromScratch: () => Promise<void>
  startFromTemplate: (template: TournamentTemplate) => Promise<void>
  duplicateFromTournament: (tournamentId: string) => Promise<void>
  resumeDraft: (draftId: string) => void
}

interface PendingTemplate {
  draftId: string
  template: TournamentTemplate
}

interface LoadResult {
  draftId: string
  error: string | null
}

export function useDraftSession(initialDraftId?: string): DraftSession {
  const router = useRouter()
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(initialDraftId)
  // Resultado de la última carga: `loading` se deriva de si corresponde al
  // borrador activo (sin setState síncrono dentro del effect).
  const [loaded, setLoaded] = useState<LoadResult | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showStartModal, setShowStartModal] = useState<boolean>(!initialDraftId)
  const [creating, setCreating] = useState<boolean>(false)
  // Plantilla elegida en el modal, atada al id del borrador que la va a recibir.
  const pendingTemplate = useRef<PendingTemplate | null>(null)

  const init = useDraftStore((s) => s.init)
  const reset = useDraftStore((s) => s.reset)

  // Carga del borrador activo (vino por URL o lo acabamos de crear).
  useEffect(() => {
    if (!activeDraftId) return
    let cancelled = false
    fetchDraft(activeDraftId)
      .then((draft) => {
        if (cancelled) return
        init(draft.id, {
          config: draft.config,
          version: draft.version,
          collaborators: draft.collaborators,
        })
        const pending = pendingTemplate.current
        if (pending && pending.draftId === draft.id) {
          pendingTemplate.current = null
          const state = useDraftStore.getState()
          if (state.config) {
            state.applyChange(templateToPartial(pending.template, state.config), 'manual')
          }
        }
        setLoaded({ draftId: activeDraftId, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoaded({
          draftId: activeDraftId,
          error: err instanceof Error ? err.message : 'Error cargando draft',
        })
      })
    return () => {
      cancelled = true
    }
  }, [activeDraftId, init])

  const loadedActive = loaded !== null && loaded.draftId === activeDraftId
  const loading = !!activeDraftId && !loadedActive
  const loadError = loadedActive ? loaded.error : createError

  // Limpieza al desmontar.
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  // Cerrar el modal y activar un borrador: la URL refleja el draft activo.
  const openDraft = useCallback(
    (draftId: string) => {
      setShowStartModal(false)
      router.replace(`/organizador/nuevo?draft=${draftId}`)
      setActiveDraftId(draftId)
    },
    [router],
  )

  const runCreation = useCallback(
    async (create: () => Promise<DraftRecord>, fallbackMessage: string, template?: TournamentTemplate) => {
      setCreating(true)
      setCreateError(null)
      try {
        const draft = await create()
        pendingTemplate.current = template ? { draftId: draft.id, template } : null
        openDraft(draft.id)
      } catch (err: unknown) {
        setCreateError(err instanceof Error ? err.message : fallbackMessage)
      } finally {
        setCreating(false)
      }
    },
    [openDraft],
  )

  const startFromScratch = useCallback(
    () => runCreation(createDraft, 'Error creando draft'),
    [runCreation],
  )

  const startFromTemplate = useCallback(
    (template: TournamentTemplate) => runCreation(createDraft, 'Error creando draft', template),
    [runCreation],
  )

  const duplicateFromTournament = useCallback(
    (tournamentId: string) =>
      runCreation(() => duplicateDraftFromTournament(tournamentId), 'Error duplicando torneo'),
    [runCreation],
  )

  return {
    activeDraftId,
    loading,
    loadError,
    showStartModal,
    creating,
    startFromScratch,
    startFromTemplate,
    duplicateFromTournament,
    resumeDraft: openDraft,
  }
}
