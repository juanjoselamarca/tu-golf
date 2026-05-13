'use client'

import type { CSSProperties } from 'react'

interface Props {
  score: number
  band: 'low' | 'mid' | 'high'
  delta: number | null
  title: string
  description: string
}

const BAND_COLOR_VAR: Record<Props['band'], string> = {
  low: 'var(--coach-recovery-low)',
  mid: 'var(--coach-recovery-mid)',
  high: 'var(--coach-recovery-high)',
}

export function MentalRecoveryCard({ score, band, delta, title, description }: Props) {
  const color = BAND_COLOR_VAR[band]
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '22px 22px 20px',
    margin: '0 20px 24px',
    position: 'relative',
    overflow: 'hidden',
  }
  const accentStripStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '3px',
    background: color,
  }
  const deltaText = delta == null
    ? null
    : delta > 0
      ? `↑ ${delta} sem`
      : delta < 0
        ? `↓ ${Math.abs(delta)} sem`
        : '= sem'

  return (
    <div style={cardStyle}>
      <div style={accentStripStyle} aria-hidden />
      <div style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color, fontWeight: 700, marginBottom: '12px', fontFamily: '"DM Mono", monospace' }}>
        Mental Index
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '56px', fontWeight: 500, lineHeight: 0.95, color, letterSpacing: '-0.02em' }}>{score}</span>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '16px', color: 'var(--text-3)' }}>/ 100</span>
        {deltaText && (
          <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: '11.5px', color: 'var(--text-2)' }}>
            {deltaText}
          </span>
        )}
      </div>
      <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '18px', fontWeight: 600, lineHeight: 1.25, margin: '4px 0 8px', color: 'var(--text)' }}>
        {title}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '14px' }}>
        {description}
      </div>
      <div style={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', position: 'relative' }} aria-hidden>
        <div style={{ width: '33.33%', background: 'var(--coach-recovery-low)', opacity: band === 'low' ? 1 : 0.4 }} />
        <div style={{ width: '33.33%', background: 'var(--coach-recovery-mid)', opacity: band === 'mid' ? 1 : 0.4 }} />
        <div style={{ width: '33.33%', background: 'var(--coach-recovery-high)', opacity: band === 'high' ? 1 : 0.4 }} />
      </div>
    </div>
  )
}
