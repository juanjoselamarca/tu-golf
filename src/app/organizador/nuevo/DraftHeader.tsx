'use client'

// src/app/organizador/nuevo/DraftHeader.tsx
//
// Header del editor del torneo. Muestra:
// - Nombre del torneo editable inline (click → input → blur dispara applyChange)
// - Badge "Borrador" dorado
// - Chip de sync (verde/amarillo/rojo según syncStatus)
// - Avatares de collaborators

import { useEffect, useRef, useState } from 'react'
import type { TournamentConfig } from '@/lib/draft/types'
import type { SyncStatus, CollaboratorInfo } from '@/lib/draft/store'
import { SessionExpiredRow, SyncChip, SyncProblemRow } from './components/DraftSyncStatus'

export interface DraftHeaderProps {
  draftId: string
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
  syncStatus: SyncStatus
  pendingCount: number
  collaborators: CollaboratorInfo[]
  /** Qué hay que corregir (campos inválidos o rechazados), en humano. */
  statusMessage?: string | null
  /** Cambios sin guardar por resolver (para "Descartar N cambios"). */
  unsavedCount?: number
  /** Salida garantizada: descarta lo no guardado y vuelve a lo del server. */
  onDiscardUnsaved?: () => void
}

export function DraftHeader({
  draftId,
  config,
  applyChange,
  syncStatus,
  pendingCount,
  collaborators,
  statusMessage,
  unsavedCount = 0,
  onDiscardUnsaved,
}: DraftHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(config.name ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Mantener sincronizado el draft local si el config externo cambió y no estamos editando.
  useEffect(() => {
    if (!editing) setDraft(config.name ?? '')
  }, [config.name, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== (config.name ?? '')) {
      applyChange({ name: next })
    }
  }

  return (
    <header style={containerStyle}>
      <div style={leftStyle}>
        <span style={badgeStyle}>Borrador</span>

        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                setDraft(config.name ?? '')
                setEditing(false)
              }
            }}
            placeholder="Sin nombre"
            style={inputStyle}
            maxLength={120}
          />
        ) : (
          <button
            type="button"
            style={{
              ...nameButtonStyle,
              color: config.name
                ? 'var(--text-primary)'
                : 'var(--text-secondary)',
            }}
            onClick={() => setEditing(true)}
            title="Click para editar"
          >
            {config.name?.trim() || 'Sin nombre'}
          </button>
        )}
      </div>

      <div style={rightStyle}>
        <SyncChip status={syncStatus} pendingCount={pendingCount} />
        <CollaboratorAvatars collaborators={collaborators} />
      </div>

      {(syncStatus === 'invalid' || syncStatus === 'rejected') && (
        // Visible siempre (no un title=): en celular no hay hover.
        <SyncProblemRow
          message={statusMessage ?? 'Hay cambios que no se pudieron guardar.'}
          unsavedCount={unsavedCount}
          onDiscard={onDiscardUnsaved}
        />
      )}
      {syncStatus === 'auth' && <SessionExpiredRow draftId={draftId} />}
    </header>
  )
}

/**
 * El dueño va en oro con la inicial en navy, que es el par de marca de toda la
 * app (`--brand` de fondo, `--brand-dark` de texto). Acá estaba al revés —
 * `--brand-dark` de FONDO con el `color: var(--bg)` del estilo base— y en modo
 * oscuro `--bg` vale `#070d18`, el mismo valor que `--brand-dark`: la inicial
 * quedaba a 1:1 de contraste y el avatar se veía como un círculo negro vacío
 * (visto grabando la pieza 3 de RRSS, que se graba en oscuro). El colaborador
 * sí contrasta en los dos temas: `--text-3` de fondo con `--bg` de texto.
 */
export const AVATAR_POR_ROL = {
  owner: { background: 'var(--brand)', color: 'var(--brand-dark)' },
  otro: { background: 'var(--text-3)', color: 'var(--bg)' },
} as const

function CollaboratorAvatars({ collaborators }: { collaborators: CollaboratorInfo[] }) {
  const shown = collaborators.slice(0, 4)
  const extra = Math.max(0, collaborators.length - shown.length)
  return (
    <div style={avatarsStyle} aria-label="Colaboradores">
      {shown.map((c, idx) => (
        <div
          key={c.user_id}
          style={{
            ...avatarStyle,
            marginLeft: idx === 0 ? 0 : -8,
            ...(c.role === 'owner' ? AVATAR_POR_ROL.owner : AVATAR_POR_ROL.otro),
          }}
          title={`${c.name ?? c.user_id} · ${c.role === 'owner' ? 'Dueño' : 'Colaborador'}`}
        >
          {(c.name ?? '?').charAt(0).toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div style={{ ...avatarStyle, marginLeft: -8, ...AVATAR_POR_ROL.otro, fontSize: 11 }}>
          +{extra}
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 20px',
  borderRadius: 14,
  border: '1px solid var(--border)',
  background: 'var(--card-bg)',
  fontFamily: '"DM Sans", sans-serif',
  flexWrap: 'wrap',
}

const leftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flex: '1 1 auto',
  minWidth: 0,
}

const rightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flex: '0 0 auto',
}

const badgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  padding: '4px 8px',
  borderRadius: 999,
  background: 'rgba(196, 153, 42, 0.14)',
  color: 'var(--brand-gold)',
  flexShrink: 0,
}

const nameButtonStyle: React.CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  padding: '4px 6px',
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  borderRadius: 8,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const inputStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  fontFamily: 'inherit',
  padding: '4px 8px',
  border: '1px solid var(--brand-gold)',
  borderRadius: 8,
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  outline: 'none',
  minWidth: 200,
  flex: '1 1 auto',
}



const avatarsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
}

const avatarStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  // El fondo y el color los pone `AVATAR_POR_ROL`: acá no, para no tener dos
  // lugares diciendo de qué color es un avatar.
  fontSize: 12,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '2px solid var(--card-bg)',
}
