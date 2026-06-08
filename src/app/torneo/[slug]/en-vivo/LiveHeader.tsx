'use client'

// src/app/torneo/[slug]/en-vivo/LiveHeader.tsx
// Card horizontal con identidad del torneo + badge de status + ultima actualizacion.

import type { LiveTournament } from './types'

export interface LiveHeaderProps {
  tournament: LiveTournament
  lastUpdate: number
}

const FORMAT_LABEL: Record<LiveTournament['format'], string> = {
  stroke_play: 'Stroke Play',
  stableford: 'Stableford',
  best_ball: 'Best Ball',
  scramble: 'Scramble',
  match_play: 'Match Play',
  foursome: 'Foursome',
}

const MODO_LABEL: Record<LiveTournament['modo'], string> = {
  gross: 'Bruto',
  neto: 'Neto',
}

interface StatusBadge {
  label: string
  bg: string
  fg: string
}

function statusBadge(status: LiveTournament['status']): StatusBadge {
  switch (status) {
    case 'in_progress':
      return { label: 'En curso', bg: 'rgba(34, 197, 94, 0.12)', fg: '#16a34a' }
    case 'draft':
      return { label: 'Borrador', bg: 'rgba(107, 114, 128, 0.14)', fg: '#4b5563' }
    case 'closed':
      return { label: 'Cerrado', bg: 'rgba(220, 38, 38, 0.12)', fg: '#dc2626' }
  }
}

function formatLastUpdate(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (diffSec < 5) return 'recién actualizado'
  if (diffSec < 60) return `actualizado hace ${diffSec}s`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `actualizado hace ${diffMin} min`
  const hh = String(new Date(ts).getHours()).padStart(2, '0')
  const mm = String(new Date(ts).getMinutes()).padStart(2, '0')
  return `actualizado ${hh}:${mm}`
}

export default function LiveHeader({ tournament, lastUpdate }: LiveHeaderProps) {
  const badge = statusBadge(tournament.status)
  const subline = [FORMAT_LABEL[tournament.format], MODO_LABEL[tournament.modo], tournament.course_name]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '20px 24px',
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border, rgba(26,29,36,0.08))',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-card, 0 1px 3px rgba(20,25,35,0.04), 0 4px 12px rgba(20,25,35,0.04))',
        fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <h1
          style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: 700,
            lineHeight: 1.2,
            color: 'var(--text, #1a1d24)',
          }}
        >
          {tournament.name}
        </h1>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 600,
            background: badge.bg,
            color: badge.fg,
          }}
        >
          {badge.label}
        </span>
      </div>
      <div
        style={{
          fontSize: '14px',
          color: 'var(--text-2, #5a6573)',
        }}
      >
        {subline}
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--text-3, #6B7280)',
        }}
      >
        {formatLastUpdate(lastUpdate)}
      </div>
    </section>
  )
}
