'use client'

import Link from 'next/link'
import { Calendar, PersonStanding } from '@/components/icons'
import { TaigerIcon } from '@/components/icons/TaigerIcon'

const SESSION_TYPE_LABELS: Record<string, string> = {
  continuous: 'Conversación continua',
  post_round: 'Analisis post-ronda',
  weekly_plan: 'Plan semanal',
  free: 'Consulta libre',
}

const SESSION_TYPE_ICONS: Record<string, React.ReactNode> = {
  continuous: <TaigerIcon size={14} />,
  post_round: <PersonStanding size={14} />,
  weekly_plan: <Calendar size={14} />,
}

interface SessionHeaderProps {
  sessionType: string
  sessionDate: string
}

/**
 * Encabezado: back link + badge de tipo de sesión + fecha (idéntico al
 * original page.tsx:418-446).
 */
export function SessionHeader({ sessionType, sessionDate }: SessionHeaderProps) {
  return (
    <>
      <Link href="/coach" style={{
        color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        marginBottom: '16px', minHeight: '44px',
      }}>
        ← Coach
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{
          background: 'rgba(196,153,42,0.12)',
          border: '1px solid rgba(196,153,42,0.25)',
          borderRadius: 20,
          padding: '4px 14px',
          color: '#8A6A16',
          fontSize: 12,
          fontWeight: 500,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {SESSION_TYPE_ICONS[sessionType || '']}
            {SESSION_TYPE_LABELS[sessionType || ''] || sessionType}
          </span>
        </span>
        <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
          {sessionDate}
        </span>
      </div>
    </>
  )
}
