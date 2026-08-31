'use client'

// src/app/organizador/nuevo/sections/AdminsSection.tsx
//
// Sección "Admins": lista de collaborators del draft.
// El padre pasa los collaborators desde la DB — la sección NO consulta directo.
// Botón "+ Invitar admin" abre modal con búsqueda de usuario y llamada a la API.

import { useEffect, useState } from 'react'
import type { TournamentConfig } from '@/lib/draft/types'
import { useProfileSearch, type Profile } from '@/app/organizador/[slug]/jugadores/hooks/useProfileSearch'
import { captureError } from '@/lib/error-tracking'

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
  draftId: string
}

export function AdminsSection({ collaborators, draftId }: AdminsSectionProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const { search, setSearch, results, searching, reset: resetSearch } = useProfileSearch()
  const [inviting, setInviting] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  // Optimistic list of users just invited in this session
  const [locallyAdded, setLocallyAdded] = useState<Collaborator[]>([])

  const allCollaborators = [...collaborators, ...locallyAdded.filter(
    (l) => !collaborators.some((c) => c.user_id === l.user_id)
  )]

  const alreadyIn = new Set(allCollaborators.map((c) => c.user_id))

  // Cerrar modal con Escape
  useEffect(() => {
    if (!modalOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  function closeModal() {
    setModalOpen(false)
    resetSearch()
    setFeedback(null)
    setInviting(null)
  }

  async function handleInvite(user: Profile) {
    if (!draftId) return
    setInviting(user.id)
    setFeedback(null)
    try {
      const res = await fetch(`/api/torneos/draft/${draftId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id_to_add: user.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: 'err', msg: data.error ?? 'No se pudo invitar al usuario.' })
      } else {
        setLocallyAdded((prev) => [
          ...prev,
          { user_id: user.id, full_name: user.name, email: user.email, role: 'admin' },
        ])
        setFeedback({ type: 'ok', msg: `${user.name ?? user.email ?? 'Usuario'} agregado como admin.` })
        resetSearch()
      }
    } catch (err) {
      captureError(err, { context: 'AdminsSection.invite', meta: { draftId, userId: user.id } })
      setFeedback({ type: 'err', msg: 'Error de conexión. Intenta de nuevo.' })
    } finally {
      setInviting(null)
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Admins</h2>
      <p style={helperStyle}>
        Personas que pueden editar este torneo. El dueño no puede eliminarse.
      </p>

      <div style={listStyle}>
        {allCollaborators.length === 0 && (
          <p style={emptyStyle}>Sin colaboradores aún.</p>
        )}
        {allCollaborators.map((c) => (
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
        <div style={modalBackdropStyle} onClick={closeModal}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={modalTitleStyle}>Invitar administrador</h3>
            <p style={modalSubStyle}>
              Busca por nombre o email. Solo usuarios con cuenta en Golfers+.
            </p>

            <input
              type="text"
              placeholder="Nombre o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInputStyle}
              autoFocus
            />

            {searching && (
              <p style={hintStyle}>Buscando…</p>
            )}

            {!searching && search.trim().length >= 2 && results.length === 0 && (
              <p style={hintStyle}>Sin resultados para &ldquo;{search}&rdquo;.</p>
            )}

            {results.length > 0 && (
              <div style={resultsListStyle}>
                {results.map((r) => {
                  const isIn = alreadyIn.has(r.id)
                  const isInviting = inviting === r.id
                  return (
                    <div key={r.id} style={resultRowStyle}>
                      <div style={avatarStyle}>
                        {r.name?.[0]?.toUpperCase() ?? r.email?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div style={infoStyle}>
                        <span style={nameStyle}>{r.name ?? '(sin nombre)'}</span>
                        {r.email && <span style={emailStyle}>{r.email}</span>}
                      </div>
                      <button
                        type="button"
                        disabled={isIn || isInviting}
                        onClick={() => handleInvite(r)}
                        style={inviteBtnStyle(isIn)}
                      >
                        {isInviting ? '…' : isIn ? 'Ya está' : 'Invitar'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {feedback && (
              <p style={feedbackStyle(feedback.type)}>{feedback.msg}</p>
            )}

            <button
              type="button"
              style={modalCloseStyle}
              onClick={closeModal}
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
  maxWidth: 440,
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

const modalSubStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--text-secondary, #4b5563)',
}

const searchInputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #111827)',
  fontSize: 14,
  fontFamily: '"DM Sans", sans-serif',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--text-secondary, #4b5563)',
  fontStyle: 'italic',
}

const resultsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxHeight: 240,
  overflowY: 'auto',
}

const resultRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
}

function inviteBtnStyle(isIn: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: 8,
    border: isIn ? '1px solid var(--border, #e5e7eb)' : '1px solid var(--brand-gold, #c4992a)',
    background: 'transparent',
    color: isIn ? 'var(--text-secondary, #4b5563)' : 'var(--brand-gold, #c4992a)',
    fontFamily: '"DM Sans", sans-serif',
    fontSize: 12,
    fontWeight: 500,
    cursor: isIn ? 'default' : 'pointer',
    flexShrink: 0,
  }
}

function feedbackStyle(type: 'ok' | 'err'): React.CSSProperties {
  return {
    margin: 0,
    fontSize: 13,
    fontWeight: 500,
    color: type === 'ok' ? '#16a34a' : '#dc2626',
    padding: '8px 12px',
    borderRadius: 8,
    background: type === 'ok' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
  }
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
