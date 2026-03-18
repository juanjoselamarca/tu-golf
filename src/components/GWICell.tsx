'use client'

import { GWISparkline } from './GWISparkline'

interface GWICellProps {
  gwi: number
  delta: number
  series: number[]
  level: string
  compact?: boolean  // mobile mode — no sparkline
}

export function GWICell({ gwi, delta, series, level, compact }: GWICellProps) {
  const numberColor = gwi >= 70 ? '#c9a84c' : gwi >= 50 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)'
  const deltaColor = delta > 0 ? '#00e676' : delta < 0 ? '#ff1744' : 'rgba(255,255,255,0.3)'
  const deltaIcon = delta > 0 ? '▲' : delta < 0 ? '▼' : '—'
  const deltaText = delta > 0 ? `+${delta.toFixed(1)}` : delta < 0 ? delta.toFixed(1) : '0.0'

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
        <span style={{ fontFamily: 'var(--font-cormorant), serif', fontSize: '15px', fontWeight: 300, color: numberColor }}>
          {gwi.toFixed(1)}
        </span>
        <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px', color: deltaColor }}>
          {deltaIcon}
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', minWidth: '60px' }}>
      <GWISparkline series={series} delta={delta} />
      <span style={{
        fontFamily: 'var(--font-cormorant), serif',
        fontSize: '18px', fontWeight: 300, color: numberColor,
        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
      }}>
        {gwi.toFixed(1)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
        <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '10px', color: deltaColor }}>
          {deltaIcon} {deltaText}
        </span>
        {delta > 0 && (
          <span style={{
            width: '4px', height: '4px', borderRadius: '50%',
            background: '#00e676',
            animation: 'pulse-dot 1.6s ease-in-out infinite',
          }} />
        )}
      </div>
    </div>
  )
}
