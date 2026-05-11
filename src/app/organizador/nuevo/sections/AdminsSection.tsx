'use client'

// src/app/organizador/nuevo/sections/AdminsSection.tsx
//
// Sección "Admins": lista de collaborators del draft.
// El padre pasa los collaborators desde la DB — la sección NO consulta directo.
// Botón "+ Invitar admin" abre placeholder modal por ahora.

import { useState } from 'react'
import type { TournamentConfig } from '@/lib/draft/types'

export interface Collaborator {
  user_id: string
  full_name?: string | null
  email?: string | null
  role: 'owner' | 'admin'
  avatar_url?: string | null
}

export interface AdminsSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
  collaborators: Collaborator[]
}

export function AdminsSection({ collaborators }: AdminsSectionProps) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Admins</h2>
      <p style={helperStyle}>
        Personas que pueden editar este torneo. El dueño no puede eliminarse.
      </p>

      <div style={listStyle}>
        {collaborators.length === 0 && (
          <p style={emptyStyle}>Sin colaboradores aún.</p>
        )}
        {collaborators.map((c) => (
          <div key={c.user_id} style={rowStyle}>
            <div style={avatarStyle}>
              {c.full_name?.[0]?.toUpperCase() ?? c.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div style={infoStyle}>
              <span style={nameStyle}>{c.full_name ?? '(sin nombre)'}</span>
              {c.email && <span style={emailStyle}>{c.email}</span>}
            </div>
            <span style={roleBadgeStyle(c.role)}>
              {c.role === 'owner' ? 'Dueño' : 'Admin'}
            </span>
          </div>
        ))}
      </div>

      <button type="button" style={addBtnStyle} onClick={() => setModalOpen(true)}>
        + Invitar admin
      </button>

      {modalOpen && (
        <div style={modalBackdropStyle} onClick={() => setModalOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={modalTitleStyle}>Invitar admin</h3>
            <p style={modalTextStyle}>
              Próximamente: search de usuario o generar link compartible.
            </p>
            <button
              type="button"
              style={modalCloseStyle}
              onClick={() => setModalOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
  padding: 20,
  fontFamily: '"DM Sans", sans-serif',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text-primary, #111827)',
}

const helperStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--text-secondary, #4b5563)',
}

const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontStyle: 'italic',
  color: 'var(--text-secondary, #4b5563)',
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 10,
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
}

const avatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: 'var(--brand-gold, #c4992a)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 600,
  fontSize: 14,
  flexShrink: 0,
}

const infoStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
}

const nameStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #111827)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const emailStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary, #4b5563)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

function roleBadgeStyle(role: 'owner' | 'admin'): React.CSSProperties {
  return {
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: role === 'owner' ? 'var(--brand-gold, #c4992a)' : 'rgba(196,153,42,0.14)',
    color: role === 'owner' ? '#fff' : 'var(--brand-gold, #c4992a)',
    border: role === 'owner' ? '1px solid var(--brand-gold, #c4992a)' : '1px solid rgba(196,153,42,0.4)',
    whiteSpace: 'nowrap',
  }
}

const addBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px dashed var(--brand-gold, #c4992a)',
  background: 'transparent',
  color: 'var(--brand-gold, #c4992a)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
}

const modalStyle: React.CSSProperties = {
  background: 'var(--card-bg, #ffffff)',
  borderRadius: 14,
  padding: 24,
  maxWidth: 420,
  width: 'calc(100% - 32px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  fontFamily: '"DM Sans", sans-serif',
  border: '1px solid var(--border, #e5e7eb)',
}

const modalTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text-primary, #111827)',
}

const modalTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: 'var(--text-secondary, #4b5563)',
}

const modalCloseStyle: React.CSSProperties = {
  alignSelf: 'flex-end',
  padding: '8px 16px',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #111827)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 13,
  cursor: 'pointer',
}
