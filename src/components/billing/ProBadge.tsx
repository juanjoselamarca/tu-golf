/**
 * ProBadge — inline chip showing PRO or PRO+.
 *
 * Two visual variants:
 * - `subtle` (default): 18px chip with translucent gold bg, used in profile/listing contexts.
 * - `filled`: solid gold badge, dark text, DM Mono — for gate overlays and locked chips.
 *   Designed for visibility under sunlight with gloves.
 */

import type { Tier } from '@/golf/billing/plans'

interface ProBadgeProps {
  tier: Extract<Tier, 'pro' | 'pro_plus'>
  /** Additional CSS class */
  className?: string
  /**
   * Visual style:
   * - `subtle` (default): translucent gold chip for inline/listing use.
   * - `filled`: solid gold, dark text, DM Mono — for gate overlays.
   */
  variant?: 'subtle' | 'filled'
  /** Font size override for filled variant (default 11px). */
  size?: number
}

export function ProBadge({ tier, className, variant = 'subtle', size = 11 }: ProBadgeProps) {
  const label = tier === 'pro_plus' ? 'PRO+' : 'PRO'

  if (variant === 'filled') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-block',
          background: '#C4992A',
          color: '#070d18',
          fontFamily: '"DM Mono", monospace',
          fontSize: `${size}px`,
          fontWeight: 600,
          letterSpacing: '0.06em',
          padding: '3px 10px',
          borderRadius: '4px',
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>
    )
  }

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
