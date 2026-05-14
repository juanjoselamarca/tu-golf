'use client'

// src/app/torneo/[slug]/en-vivo/formats/MatchPlayHeadToHead.tsx
// Lista vertical de matches 1v1 activos / pendientes / cerrados.

import type { LiveMatch } from '../types'

export interface MatchPlayHeadToHeadProps {
  matches: LiveMatch[]
}

function statusInfo(m: LiveMatch): { label: string; tone: 'live' | 'done' | 'pending' } {
  if (m.status === 'completed') {
    return { label: m.result ?? 'Cerrado', tone: 'done' }
  }
  if (m.status === 'in_progress') {
    if (m.result) return { label: m.result, tone: 'live' }
    if (typeof m.current_hole === 'number') return { label: `H${m.current_hole}`, tone: 'live' }
    return { label: 'En curso', tone: 'live' }
  }
  return { label: 'Pendiente', tone: 'pending' }
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
  color: 'var(--text-primary, #111827)',
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '14px 16px',
  borderRadius: '12px',
  background: 'var(--card-bg, #f9fafb)',
  border: '1px solid var(--border, #e5e7eb)',
}

const placeholderStyle: React.CSSProperties = {
  padding: '32px 16px',
  textAlign: 'center',
  color: 'var(--text-secondary, #6b7280)',
  fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
  fontSize: '14px',
  background: 'var(--card-bg, #f9fafb)',
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: '12px',
}

function StatusPill({ tone, label }: { tone: 'live' | 'done' | 'pending'; label: string }) {
  let bg = 'rgba(107, 114, 128, 0.14)'
  let fg = 'var(--text-secondary, #6b7280)'
  if (tone === 'live') {
    bg = 'rgba(196, 153, 42, 0.16)'
    fg = 'var(--brand-gold, #c4992a)'
  } else if (tone === 'done') {
    bg = 'rgba(34, 197, 94, 0.14)'
    fg = '#16a34a'
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

export default function MatchPlayHeadToHead({ matches }: MatchPlayHeadToHeadProps) {
  if (!matches || matches.length === 0) {
    return <div style={placeholderStyle}>Aún no hay matches programados.</div>
  }

  return (
    <div style={containerStyle}>
      {matches.map((m) => {
        const info = statusInfo(m)
        return (
          <div key={m.id} style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-primary, #111827)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.player_a.name} <span style={{ color: 'var(--text-secondary, #6b7280)', fontWeight: 400 }}>vs</span>{' '}
                {m.player_b.name}
              </div>
              {typeof m.current_hole === 'number' && m.status === 'in_progress' && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary, #6b7280)' }}>
                  Hoyo {m.current_hole}
                </div>
              )}
            </div>
            <StatusPill tone={info.tone} label={info.label} />
          </div>
        )
      })}
    </div>
  )
}
