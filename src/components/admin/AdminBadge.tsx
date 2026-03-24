'use client'
import { adminColors } from './admin-tokens'

type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral' | 'gold'

const variantStyles: Record<BadgeVariant, { bg: string; color: string }> = {
  success: { bg: adminColors.greenDim, color: adminColors.green },
  warning: { bg: adminColors.yellowDim, color: adminColors.yellow },
  error: { bg: adminColors.redDim, color: adminColors.red },
  neutral: { bg: 'rgba(148,168,192,0.12)', color: adminColors.gray },
  gold: { bg: adminColors.goldDim, color: adminColors.gold },
}

export function AdminBadge({ text, variant = 'neutral', dot }: {
  text: string
  variant?: BadgeVariant
  dot?: boolean
}) {
  const s = variantStyles[variant]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: s.bg, color: s.color,
      fontSize: '11px', fontWeight: 600, padding: '3px 10px',
      borderRadius: '20px', whiteSpace: 'nowrap',
    }}>
      {dot && <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: s.color, flexShrink: 0,
      }} />}
      {text}
    </span>
  )
}
