'use client'

import type { CSSProperties } from 'react'

interface Props {
  title: string
  description: string
  status: 'active' | 'resolved' | 'expired' | 'superseded' | 'cancelled'
  weekDots: Array<'on' | 'miss'>
  appliedRatio: number
  correlationLine: React.ReactNode
}

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const STATUS_LABEL: Record<Props['status'], string> = {
  active: 'en curso',
  resolved: 'logrado',
  expired: 'expirado',
  superseded: 'reemplazado',
  cancelled: 'cancelado',
}

const STATUS_TONE: Record<Props['status'], { fg: string; bg: string; border: string }> = {
  active: { fg: 'var(--coach-recovery-high)', bg: 'var(--coach-recovery-high-soft)', border: 'var(--coach-recovery-high)' },
  resolved: { fg: 'var(--coach-recovery-high)', bg: 'var(--coach-recovery-high-soft)', border: 'var(--coach-recovery-high)' },
  expired: { fg: 'var(--text-3)', bg: 'var(--bg-surface)', border: 'var(--line)' },
  superseded: { fg: 'var(--text-3)', bg: 'var(--bg-surface)', border: 'var(--line)' },
  cancelled: { fg: 'var(--text-3)', bg: 'var(--bg-surface)', border: 'var(--line)' },
}

export function PlanActiveCard({ title, description, status, weekDots, correlationLine }: Props) {
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '20px 22px 18px',
    margin: '0 20px 24px',
    position: 'relative',
  }
  const accent: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '3px',
    background: 'var(--coach-recovery-high)',
  }
  const tone = STATUS_TONE[status]

  return (
    <div style={cardStyle}>
      <div style={accent} aria-hidden />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
        <div>
          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '17px', fontWeight: 600, lineHeight: 1.25, marginBottom: '3px' }}>{title}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5 }}>{description}</div>
        </div>
        <span style={{
          fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
          padding: '3px 8px', borderRadius: '2px',
          border: `1px solid ${tone.border}`, background: tone.bg, color: tone.fg,
          fontFamily: '"DM Mono", monospace', whiteSpace: 'nowrap' as const,
        }}>{STATUS_LABEL[status]}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 14px' }} role="list" aria-label="Adherencia semanal">
        {weekDots.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }} role="listitem">
            <span style={{ fontSize: '9.5px', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
              {DAY_LABELS[i]}
            </span>
            {d === 'on' ? (
              <span aria-label="aplicado" style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--coach-recovery-high)' }} />
            ) : (
              <span aria-label="no aplicado" style={{ width: '19px', height: '19px', borderRadius: '50%', background: 'var(--bg-surface)', border: '1.5px dashed var(--text-3)' }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-2)', padding: '12px 14px', background: 'var(--bg)', borderRadius: '4px', lineHeight: 1.55 }}>
        {correlationLine}
      </div>
    </div>
  )
}
