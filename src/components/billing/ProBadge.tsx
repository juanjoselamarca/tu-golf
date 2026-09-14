/**
 * ProBadge — tiny inline chip showing PRO or PRO+.
 *
 * 18px height, gold text on subtle gold background.
 */

import type { Tier } from '@/golf/billing/plans'

interface ProBadgeProps {
  tier: Extract<Tier, 'pro' | 'pro_plus'>
  /** Additional CSS class */
  className?: string
}

export function ProBadge({ tier, className }: ProBadgeProps) {
  const label = tier === 'pro_plus' ? 'PRO+' : 'PRO'

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '18px',
        padding: '0 6px',
        borderRadius: '4px',
        background: 'rgba(196,153,42,0.12)',
        border: '1px solid rgba(196,153,42,0.20)',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        lineHeight: 1,
        color: 'var(--brand-on-bg, #c4992a)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
