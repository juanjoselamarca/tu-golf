'use client'

import type { CSSProperties } from 'react'

export type SparkBar = { height: number; tone?: 'ink' | 'brass' | 'pos' | 'neg' | 'faded' }
export type Tone = 'pos' | 'neg' | 'warn' | 'neutral'

interface Props {
  narrative: React.ReactNode
  spark: SparkBar[]
  pill: { text: string; tone: Tone }
}

const TONE_COLOR: Record<Tone, { fg: string; bg: string; border: string }> = {
  pos: { fg: 'var(--coach-recovery-high)', bg: 'var(--coach-recovery-high-soft)', border: 'var(--coach-recovery-high)' },
  neg: { fg: 'var(--coach-recovery-low)', bg: 'var(--coach-recovery-low-soft)', border: 'var(--coach-recovery-low)' },
  warn: { fg: 'var(--coach-recovery-mid)', bg: 'var(--coach-recovery-mid-soft)', border: 'var(--coach-recovery-mid)' },
  neutral: { fg: 'var(--text-2)', bg: 'var(--bg-surface)', border: 'var(--line)' },
}

const SPARK_COLOR: Record<NonNullable<SparkBar['tone']>, string> = {
  ink: 'var(--text)',
  brass: 'var(--coach-brass)',
  pos: 'var(--coach-recovery-high)',
  neg: 'var(--coach-recovery-low)',
  faded: 'var(--line)',
}

export function HighlightCard({ narrative, spark, pill }: Props) {
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '18px 18px 16px',
    minWidth: '280px',
    maxWidth: '280px',
    scrollSnapAlign: 'start',
    flexShrink: 0,
  }
  const pillC = TONE_COLOR[pill.tone]

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.5, marginBottom: '14px' }}>
        {narrative}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '24px' }} aria-hidden>
          {spark.map((b, i) => (
            <span key={i} style={{ width: '7px', height: `${b.height}%`, background: SPARK_COLOR[b.tone ?? 'ink'] }} />
          ))}
        </div>
        <span style={{
          fontSize: '9.5px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
          padding: '3px 8px',
          borderRadius: '2px',
          border: `1px solid ${pillC.border}`,
          background: pillC.bg,
          color: pillC.fg,
          fontFamily: '"DM Mono", monospace',
        }}>
          {pill.text}
        </span>
      </div>
    </div>
  )
}
