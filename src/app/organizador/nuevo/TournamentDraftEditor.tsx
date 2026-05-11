'use client'

// src/app/organizador/nuevo/TournamentDraftEditor.tsx
//
// Componente raíz del editor de torneos.
// Maneja:
// - Modal inicial "¿Empezar desde cero?" / "Duplicar de torneo existente"
// - Carga del draft (GET /api/torneos/draft/:id) e init del zustand store
// - Layout 2 columnas en desktop, tabs en mobile
// - Wire-up del header/secciones/footer/preview modal/assistant panel

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useDraftStore, type CollaboratorInfo } from '@/lib/draft/store'
import type { TournamentConfig, TournamentConfigPartial } from '@/lib/draft/types'
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

// AssistantPanel todavía no existe (lo crea el agente H en paralelo).
// Import dinámico con ssr:false y placeholder si falla la carga.
const AssistantPanel = dynamic(
  () =>
    import('@/components/tournament-draft/AssistantPanel').then((mod) => mod.default).catch(() => {
      const Fallback = () => (
        <div style={{ padding: 20, fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
          Asistente todavía no disponible.
        </div>
      )
      Fallback.displayName = 'AssistantPanelFallback'
      return Fallback
    }),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 20, fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
        Cargando asistente...
      </div>
    ),
  },
)

export interface CourseOption {
  id: string
  nombre: string
  ciudad: string
}

export interface DraftSummary {
  id: string
  name: string
  updated_at: string
}

export interface TournamentSummary {
  id: string
  name: string
  format: string
  date_start: string
  slug: string
}

export interface TournamentDraftEditorProps {
  userId: string
  courses: CourseOption[]
  existingDrafts: DraftSummary[]
  recentTournaments: TournamentSummary[]
  initialDraftId?: string
}

interface DraftApiResponse {
  ok: true
  draft: {
    id: string
    config: TournamentConfig
    version: number
    tournament_draft_collaborators?: Array<{
      user_id: string
      role: 'owner' | 'collaborator'
      name?: string | null
    }>
  }
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
  const router = useRouter()
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(initialDraftId)
  const [loading, setLoading] = useState<boolean>(!!initialDraftId)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showStartModal, setShowStartModal] = useState<boolean>(!initialDraftId)
  const [creating, setCreating] = useState<boolean>(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'config' | 'assistant'>('config')

  const draftId = useDraftStore((s) => s.draftId)
  const config = useDraftStore((s) => s.config)
  const collaborators = useDraftStore((s) => s.collaborators)
  const syncStatus = useDraftStore((s) => s.syncStatus)
  const pendingChanges = useDraftStore((s) => s.pendingChanges)
  const applyChange = useDraftStore((s) => s.applyChange)
  const init = useDraftStore((s) => s.init)
  const reset = useDraftStore((s) => s.reset)

  // Carga inicial de draft si vino por URL.
  useEffect(() => {
    if (!activeDraftId) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetch(`/api/torneos/draft/${activeDraftId}`, { method: 'GET' })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          let msg = `Error ${res.status}`
          try {
            const j = (await res.json()) as { error?: string }
            if (j.error) msg = j.error
          } catch {
            /* sin body */
          }
          throw new Error(msg)
        }
        const data = (await res.json()) as DraftApiResponse
        const collaboratorList: CollaboratorInfo[] = (
          data.draft.tournament_draft_collaborators ?? []
        ).map((c) => ({
          user_id: c.user_id,
          role: c.role,
          name: c.name ?? undefined,
        }))
        init(data.draft.id, {
          config: data.draft.config,
          version: data.draft.version,
          collaborators: collaboratorList,
        })
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Error cargando draft')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeDraftId, init])

  // Limpieza al desmontar.
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  // Crear draft nuevo desde cero
  const handleStartFromScratch = useCallback(async () => {
    setCreating(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/torneos/draft', { method: 'POST' })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `Error ${res.status}`)
      }
      const data = (await res.json()) as DraftApiResponse
      setShowStartModal(false)
      // URL refleja el draft activo
      router.replace(`/organizador/nuevo?draft=${data.draft.id}`)
      setActiveDraftId(data.draft.id)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error creando draft')
    } finally {
      setCreating(false)
    }
  }, [router])

  // Duplicar desde torneo existente
  const handleDuplicateFromTournament = useCallback(
    async (tournamentId: string) => {
      setCreating(true)
      setLoadError(null)
      try {
        const res = await fetch(`/api/torneos/draft/duplicate-from/${tournamentId}`, {
          method: 'POST',
        })
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(j.error || `Error ${res.status}`)
        }
        const data = (await res.json()) as DraftApiResponse
        setShowStartModal(false)
        router.replace(`/organizador/nuevo?draft=${data.draft.id}`)
        setActiveDraftId(data.draft.id)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Error duplicando torneo')
      } finally {
        setCreating(false)
      }
    },
    [router],
  )

  // Reanudar un draft previo
  const handleResumeDraft = useCallback(
    (id: string) => {
      setShowStartModal(false)
      router.replace(`/organizador/nuevo?draft=${id}`)
      setActiveDraftId(id)
    },
    [router],
  )

  const handlePreview = useCallback(() => setPreviewOpen(true), [])
  const handlePreviewClose = useCallback(() => setPreviewOpen(false), [])

  // Crear torneo desde el draft
  const handleCreate = useCallback(async () => {
    if (!draftId) return
    // Asegurar que el último cambio esté flushed antes de crear.
    await useDraftStore.getState().flush()
    const res = await fetch(`/api/torneos/draft/${draftId}/create-tournament`, {
      method: 'POST',
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        details?: Array<{ message?: string }>
      }
      const detailMsg =
        Array.isArray(j.details) && j.details.length > 0
          ? j.details
              .map((d) => d.message)
              .filter(Boolean)
              .join('; ')
          : ''
      const msg = [j.error, detailMsg].filter(Boolean).join(' · ') || `Error ${res.status}`
      throw new Error(msg)
    }
    const data = (await res.json()) as { ok: true; tournament_id: string; slug: string }
    router.push(`/organizador/${data.slug}/jugadores`)
  }, [draftId, router])

  // Wrapper de applyChange que matchea la signature simple (Partial<TournamentConfig>) que esperan las sections.
  const applyChangeManual = useCallback(
    (partial: Partial<TournamentConfig>) => {
      applyChange(partial, 'manual')
    },
    [applyChange],
  )

  // Callback que recibe el AssistantPanel cuando el server aplica un cambio.
  // El server ya merged y aumentó version, así que reusamos `init` para reemplazar
  // el state del store con el config completo y el nuevo version.
  const handleAssistantChange = useCallback(
    (
      _partial: TournamentConfigPartial,
      nextConfig: TournamentConfig,
      _explanation: string,
      _needsConfirmation: string[],
    ) => {
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

  const adminCollaborators = useMemo(
    () => collaborators.map(toAdminCollaborator),
    [collaborators],
  )

  if (showStartModal) {
    return (
      <StartModal
        recentTournaments={recentTournaments}
        existingDrafts={existingDrafts}
        onStartFromScratch={handleStartFromScratch}
        onDuplicateFromTournament={handleDuplicateFromTournament}
        onResumeDraft={handleResumeDraft}
        creating={creating}
        errorMsg={loadError}
      />
    )
  }

  if (loading || !config || !draftId) {
    return (
      <div style={pageStyle}>
        <div style={loadingPanelStyle}>
          <p>{loadError ?? 'Cargando borrador...'}</p>
        </div>
      </div>
    )
  }

  const configPanel = (
    <div style={configPanelStyle}>
      <DraftHeader
        draftId={draftId}
        config={config}
        applyChange={applyChangeManual}
        syncStatus={syncStatus}
        pendingCount={pendingChanges.length}
        collaborators={collaborators}
      />

      <QueTorneoSection config={config} applyChange={applyChangeManual} courses={courses} />
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
      />

      <DraftFooter
        draftId={draftId}
        config={config}
        onPreview={handlePreview}
        onCreate={handleCreate}
      />
    </div>
  )

  const assistantPanel = (
    <div style={assistantPanelStyle}>
      <AssistantPanel draftId={draftId} onChangeApplied={handleAssistantChange} />
    </div>
  )

  return (
    <div style={pageStyle}>
      <ResponsiveStyles />
      {/* Mobile: tabs (ocultos en desktop vía CSS) */}
      <div className="draft-editor-tabs" style={mobileTabsStyle}>
        <button
          type="button"
          style={tabButtonStyle(activeTab === 'config')}
          onClick={() => setActiveTab('config')}
        >
          Configuración
        </button>
        <button
          type="button"
          style={tabButtonStyle(activeTab === 'assistant')}
          onClick={() => setActiveTab('assistant')}
        >
          Asistente
        </button>
      </div>

      <div className="draft-editor-layout" style={layoutStyle}>
        <div
          className={`draft-editor-config-col ${activeTab === 'config' ? 'is-active' : ''}`}
          style={configColumnStyle(activeTab === 'config')}
        >
          {configPanel}
        </div>
        <div
          className={`draft-editor-assistant-col ${activeTab === 'assistant' ? 'is-active' : ''}`}
          style={assistantColumnStyle(activeTab === 'assistant')}
        >
          {assistantPanel}
        </div>
      </div>

      <DraftPreviewModal draftId={draftId} open={previewOpen} onClose={handlePreviewClose} />
    </div>
  )
}

// CSS responsive injectado vía <style>. En desktop (>= 1024px) mostramos
// ambas columnas en grid 60/40 y ocultamos los tabs de mobile.
function ResponsiveStyles() {
  const css = `
    @media (min-width: 1024px) {
      .draft-editor-tabs { display: none !important; }
      .draft-editor-layout {
        grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      }
      .draft-editor-config-col,
      .draft-editor-assistant-col {
        display: block !important;
      }
    }
  `
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

// ── StartModal ────────────────────────────────────────────────────────

interface StartModalProps {
  recentTournaments: TournamentSummary[]
  existingDrafts: DraftSummary[]
  onStartFromScratch: () => void
  onDuplicateFromTournament: (id: string) => void
  onResumeDraft: (id: string) => void
  creating: boolean
  errorMsg: string | null
}

function StartModal({
  recentTournaments,
  existingDrafts,
  onStartFromScratch,
  onDuplicateFromTournament,
  onResumeDraft,
  creating,
  errorMsg,
}: StartModalProps) {
  return (
    <div style={pageStyle}>
      <div style={startModalContainerStyle}>
        <h1 style={startTitleStyle}>Nuevo torneo</h1>
        <p style={startSubtitleStyle}>¿Por dónde empezamos?</p>

        {errorMsg && (
          <div style={startErrorStyle} role="alert">
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          style={startPrimaryButtonStyle(creating)}
          onClick={onStartFromScratch}
          disabled={creating}
        >
          {creating ? 'Creando...' : '+ Empezar desde cero'}
        </button>

        {existingDrafts.length > 0 && (
          <section style={startSectionStyle}>
            <h2 style={startSectionTitleStyle}>Continuar un borrador</h2>
            <ul style={startListStyle}>
              {existingDrafts.map((d) => (
                <li key={d.id} style={startListItemStyle}>
                  <button
                    type="button"
                    style={startListButtonStyle}
                    onClick={() => onResumeDraft(d.id)}
                    disabled={creating}
                  >
                    <span style={{ fontWeight: 600 }}>{d.name?.trim() || 'Sin nombre'}</span>
                    <span style={startListMetaStyle}>
                      {formatRelativeDate(d.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recentTournaments.length > 0 && (
          <section style={startSectionStyle}>
            <h2 style={startSectionTitleStyle}>Duplicar desde un torneo previo</h2>
            <ul style={startListStyle}>
              {recentTournaments.slice(0, 5).map((t) => (
                <li key={t.id} style={startListItemStyle}>
                  <button
                    type="button"
                    style={startListButtonStyle}
                    onClick={() => onDuplicateFromTournament(t.id)}
                    disabled={creating}
                  >
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                    <span style={startListMetaStyle}>
                      {t.format} · {formatDate(t.date_start)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function formatDate(iso?: string | null): string {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatRelativeDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const delta = now - d.getTime()
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days} d`
  return formatDate(iso)
}

// ── Styles ────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--page-bg, #ffffff)',
  fontFamily: '"DM Sans", sans-serif',
  color: 'var(--text-primary, #111827)',
}

const layoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 16,
  padding: 16,
  maxWidth: 1400,
  margin: '0 auto',
}

const configColumnStyle = (active: boolean): React.CSSProperties => ({
  display: active ? 'block' : 'none',
  minWidth: 0,
})

const assistantColumnStyle = (active: boolean): React.CSSProperties => ({
  display: active ? 'block' : 'none',
  minWidth: 0,
})

// Desktop overrides via media queries inline no se pueden con React style,
// pero usamos CSS vars y truco con className global. Para mantenerlo simple,
// usamos un container style + media query inyectado vía <style>.
//
// (Tailwind no está disponible directamente acá fuera de className; las secciones
// existentes ya usan inline styles. Mantenemos el mismo enfoque.)

const mobileTabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '12px 16px 0',
  maxWidth: 1400,
  margin: '0 auto',
}

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  appearance: 'none',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 14px',
  borderRadius: 999,
  border: '1px solid var(--border, #e5e7eb)',
  background: active ? 'var(--brand-dark, #0a1419)' : '#ffffff',
  color: active ? '#ffffff' : 'var(--text-secondary, #6b7280)',
  cursor: 'pointer',
})

const configPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  minWidth: 0,
}

const assistantPanelStyle: React.CSSProperties = {
  position: 'sticky',
  top: 16,
  alignSelf: 'flex-start',
  borderRadius: 14,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
  overflow: 'hidden',
  maxHeight: 'calc(100vh - 32px)',
  minWidth: 0,
}

const loadingPanelStyle: React.CSSProperties = {
  padding: 32,
  maxWidth: 600,
  margin: '40px auto',
  textAlign: 'center',
  color: 'var(--text-secondary, #6b7280)',
}

const startModalContainerStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: '60px auto',
  padding: 24,
  borderRadius: 16,
  background: 'var(--card-bg, #f9fafb)',
  border: '1px solid var(--border, #e5e7eb)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const startTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
}

const startSubtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: 'var(--text-secondary, #6b7280)',
}

const startErrorStyle: React.CSSProperties = {
  background: 'rgba(239, 68, 68, 0.1)',
  color: '#b91c1c',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 13,
  border: '1px solid rgba(239, 68, 68, 0.25)',
}

const startPrimaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  appearance: 'none',
  fontFamily: 'inherit',
  fontWeight: 700,
  fontSize: 15,
  padding: '14px 20px',
  borderRadius: 12,
  border: 'none',
  background: 'var(--brand-gold, #c4992a)',
  color: '#0a1419',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.7 : 1,
})

const startSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const startSectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary, #6b7280)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

const startListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const startListItemStyle: React.CSSProperties = {
  margin: 0,
}

const startListButtonStyle: React.CSSProperties = {
  appearance: 'none',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: '#ffffff',
  fontFamily: 'inherit',
  fontSize: 14,
  color: 'var(--text-primary, #111827)',
  cursor: 'pointer',
  textAlign: 'left',
  gap: 12,
}

const startListMetaStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary, #6b7280)',
}
