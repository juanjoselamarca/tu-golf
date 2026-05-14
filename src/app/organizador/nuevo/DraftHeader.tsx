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

export interface DraftHeaderProps {
  draftId: string
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
  syncStatus: SyncStatus
  pendingCount: number
  collaborators: CollaboratorInfo[]
}

export function DraftHeader({
  config,
  applyChange,
  syncStatus,
  pendingCount,
  collaborators,
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
                ? 'var(--text-primary, #111827)'
                : 'var(--text-secondary, #9ca3af)',
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
    </header>
  )
}

function SyncChip({ status, pendingCount }: { status: SyncStatus; pendingCount: number }) {
  let label = 'Sincronizado'
  let bg = 'rgba(34, 197, 94, 0.12)'
  let fg = '#15803d'
  let dot = '#22c55e'

  if (status === 'syncing') {
    label = 'Sincronizando...'
    bg = 'rgba(234, 179, 8, 0.14)'
    fg = '#854d0e'
    dot = '#eab308'
  } else if (status === 'offline') {
    label = `Sin conexión · ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`
    bg = 'rgba(239, 68, 68, 0.12)'
    fg = '#b91c1c'
    dot = '#ef4444'
  } else if (status === 'conflict') {
    label = 'Reconciliando...'
    bg = 'rgba(234, 179, 8, 0.14)'
    fg = '#854d0e'
    dot = '#eab308'
  } else if (status === 'saved') {
    label = 'Guardado'
    bg = 'rgba(34, 197, 94, 0.12)'
    fg = '#15803d'
    dot = '#22c55e'
  } else if (status === 'idle') {
    label = 'Sincronizado'
  }

  return (
    <div style={{ ...chipStyle, background: bg, color: fg }}>
      <span style={{ ...chipDotStyle, background: dot }} aria-hidden="true" />
      {label}
    </div>
  )
}

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
            background: c.role === 'owner' ? 'var(--brand-dark, #0a1419)' : '#4b5563',
          }}
          title={`${c.name ?? c.user_id} · ${c.role === 'owner' ? 'Dueño' : 'Colaborador'}`}
        >
          {(c.name ?? '?').charAt(0).toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div style={{ ...avatarStyle, marginLeft: -8, background: '#9ca3af', fontSize: 11 }}>
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
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
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
  color: 'var(--brand-gold, #c4992a)',
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
  border: '1px solid var(--brand-gold, #c4992a)',
  borderRadius: 8,
  background: '#fff',
  color: 'var(--text-primary, #111827)',
  outline: 'none',
  minWidth: 200,
  flex: '1 1 auto',
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
}

const chipDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
}

const avatarsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
}

const avatarStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: '#4b5563',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '2px solid var(--card-bg, #f9fafb)',
}
