'use client'
import { CSSProperties, ReactNode } from 'react'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface AdminCardProps {
  icon?: ReactNode
  label: string
  value: string | number
  delta?: { value: number; label: string }
  loading?: boolean
  sparkline?: number[]  // last 30 days values for mini chart
  children?: ReactNode
  style?: CSSProperties
}

export function AdminCard({ icon, label, value, delta, loading, sparkline, children, style }: AdminCardProps) {
  return (
    <div style={{ ...adminCard, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, ...style }}>
      {icon && <span style={{ fontSize: '20px', display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {loading ? (
        <div style={{
          height: '32px', width: '80px', borderRadius: '8px',
          background: `linear-gradient(90deg, ${adminColors.border} 25%, ${adminColors.card} 50%, ${adminColors.border} 75%)`,
          backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
        }} />
      ) : (
        <span style={adminFonts.kpi}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      )}
      <span style={adminFonts.label}>{label}</span>
      {delta && !loading && (
        <span style={{
          ...adminFonts.label, fontSize: '11px', textTransform: 'none' as const,
          color: delta.value >= 0 ? adminColors.green : adminColors.red,
          fontWeight: 600,
        }}>
          {delta.value >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(delta.value)} {delta.label}
        </span>
      )}
      {sparkline && sparkline.length > 1 && !loading && (
        <svg viewBox={`0 0 ${sparkline.length - 1} 20`} width="100%" height="24"
          style={{ marginTop: '4px' }} preserveAspectRatio="none">
          <polyline
            fill="none" stroke={adminColors.gold} strokeWidth="1.5"
            points={sparkline.map((v, i) => {
              const max = Math.max(...sparkline)
              const min = Math.min(...sparkline)
              const range = max - min || 1
              const y = 20 - ((v - min) / range) * 18
              return `${i},${y}`
            }).join(' ')}
          />
        </svg>
      )}
      {children}
    </div>
  )
}
