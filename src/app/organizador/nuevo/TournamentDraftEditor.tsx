'use client'

// src/app/organizador/nuevo/TournamentDraftEditor.tsx
//
// Componente raíz del editor de torneos. Solo cablea:
// - Ciclo de vida del borrador (`useDraftSession`): modal de arranque, carga, reset.
// - Acciones sobre el borrador (`useDraftActions`): cambios manuales, IA, crear torneo.
// - Header / hero IA / secciones / footer / preview modal.
//
// La lógica vive en `hooks/`, la vista en `components/`, los datos en
// `@/lib/data/tournament-drafts` y el estado en `@/lib/draft/store`.

import { useCallback, useMemo, useState } from 'react'
import { useDraftStore, type CollaboratorInfo } from '@/lib/draft/store'
import { pageStyle } from './styles'
import type { CourseOption, DraftSummary, TournamentSummary } from './types'
import { useDraftSession } from './hooks/useDraftSession'
import { useDraftActions } from './hooks/useDraftActions'
import { StartModal } from './components/StartModal'
import { AssistantHero } from './components/AssistantHero'
import { DraftEditorStyles } from './components/DraftEditorStyles'
import { DraftHeader } from './DraftHeader'
import { DraftFooter } from './DraftFooter'
import { DraftPreviewModal } from './DraftPreviewModal'
import { QueTorneoSection } from './sections/QueTorneoSection'
import { ComoJueganSection } from './sections/ComoJueganSection'
import { EquiposSection } from './sections/EquiposSection'
import { MatchPlaySection } from './sections/MatchPlaySection'
import { StablefordSection } from './sections/StablefordSection'
import { CategoriasSection } from './sections/CategoriasSection'
import { RondasSection } from './sections/RondasSection'
import { TeesSection } from './sections/TeesSection'
import { InscripcionSection } from './sections/InscripcionSection'
import { PremiosSection } from './sections/PremiosSection'
import { AdminsSection, type Collaborator as AdminCollaborator } from './sections/AdminsSection'

export type { CourseOption, DraftSummary, TournamentSummary } from './types'

export interface TournamentDraftEditorProps {
  userId: string
  courses: CourseOption[]
  existingDrafts: DraftSummary[]
  recentTournaments: TournamentSummary[]
  initialDraftId?: string
}

// Mapper entre Collaborator del store y el shape esperado por AdminsSection.
function toAdminCollaborator(c: CollaboratorInfo): AdminCollaborator {
  return {
    user_id: c.user_id,
    full_name: c.name ?? null,
    email: null,
    role: c.role === 'owner' ? 'owner' : 'admin',
    avatar_url: null,
  }
}

export default function TournamentDraftEditor({
  userId: _userId,
  courses,
  existingDrafts,
  recentTournaments,
  initialDraftId,
}: TournamentDraftEditorProps) {
  const session = useDraftSession(initialDraftId)
  const { applyChangeManual, applyAssistantConfig, createTournament } = useDraftActions()
  const [previewOpen, setPreviewOpen] = useState(false)

  const draftId = useDraftStore((s) => s.draftId)
  const config = useDraftStore((s) => s.config)
  const collaborators = useDraftStore((s) => s.collaborators)
  const syncStatus = useDraftStore((s) => s.syncStatus)
  const pendingChanges = useDraftStore((s) => s.pendingChanges)

  const handlePreview = useCallback(() => setPreviewOpen(true), [])
  const handlePreviewClose = useCallback(() => setPreviewOpen(false), [])

  const adminCollaborators = useMemo(
    () => collaborators.map(toAdminCollaborator),
    [collaborators],
  )

  if (session.showStartModal) {
    return (
      <StartModal
        recentTournaments={recentTournaments}
        existingDrafts={existingDrafts}
        onStartFromScratch={session.startFromScratch}
        onStartFromTemplate={session.startFromTemplate}
        onDuplicateFromTournament={session.duplicateFromTournament}
        onResumeDraft={session.resumeDraft}
        creating={session.creating}
        errorMsg={session.loadError}
      />
    )
  }

  if (session.loading || !config || !draftId) {
    return (
      <div style={pageStyle}>
        <div style={loadingPanelStyle}>
          <p>{session.loadError ?? 'Cargando borrador...'}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <DraftEditorStyles />

      <div className="draft-editor-page" style={pageInnerStyle}>
        {/* Header del borrador (nombre, autosave, colaboradores) */}
        <DraftHeader
          draftId={draftId}
          config={config}
          applyChange={applyChangeManual}
          syncStatus={syncStatus}
          pendingCount={pendingChanges.length}
          collaborators={collaborators}
        />

        <AssistantHero draftId={draftId} onChangeApplied={applyAssistantConfig} />

        {/* Secciones del formulario — fuente de verdad editable manualmente */}
        <div className="draft-editor-form" style={formStackStyle}>
          <QueTorneoSection config={config} applyChange={applyChangeManual} courses={courses} draftId={draftId} />
          <ComoJueganSection config={config} applyChange={applyChangeManual} />
          <EquiposSection config={config} applyChange={applyChangeManual} />
          <MatchPlaySection config={config} applyChange={applyChangeManual} />
          <StablefordSection config={config} applyChange={applyChangeManual} />
          <CategoriasSection config={config} applyChange={applyChangeManual} />
          <RondasSection config={config} applyChange={applyChangeManual} courses={courses} />
          <TeesSection config={config} applyChange={applyChangeManual} />
          <InscripcionSection config={config} applyChange={applyChangeManual} />
          <PremiosSection config={config} applyChange={applyChangeManual} />
          <AdminsSection
            config={config}
            applyChange={applyChangeManual}
            collaborators={adminCollaborators}
            draftId={draftId}
          />

          <DraftFooter
            draftId={draftId}
            config={config}
            courses={courses}
            onPreview={handlePreview}
            onCreate={createTournament}
          />
        </div>
      </div>

      <DraftPreviewModal draftId={draftId} open={previewOpen} onClose={handlePreviewClose} />
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────

const pageInnerStyle: React.CSSProperties = {
  maxWidth: 880,
  margin: '0 auto',
  padding: '16px 16px 96px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const formStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  minWidth: 0,
}

const loadingPanelStyle: React.CSSProperties = {
  padding: 32,
  maxWidth: 600,
  margin: '40px auto',
  textAlign: 'center',
  color: 'var(--text-secondary)',
}
