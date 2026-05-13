'use client'

import type { CSSProperties } from 'react'

interface Props {
  label: string
  count: { current: number; total: number }
  children: React.ReactNode
}

export function HighlightsCarousel({ label, count, children }: Props) {
  const labelStyle: CSSProperties = {
    padding: '0 20px',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '10.5px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
    fontWeight: 600,
    fontFamily: '"DM Mono", monospace',
  }
  const trackStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    padding: '0 20px 12px',
    WebkitOverflowScrolling: 'touch',
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={labelStyle}>
        <span>{label}</span>
        <span style={{ fontFamily: '"DM Mono", monospace', letterSpacing: 0, textTransform: 'none', fontWeight: 500, color: 'var(--text-3)' }}>
          {count.current}/{count.total}
        </span>
      </div>
      <div style={trackStyle} className="hide-scrollbar">
        {children}
      </div>
    </div>
  )
}
