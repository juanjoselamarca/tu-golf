/**
 * ProBadge — inline chip showing PRO or PRO+.
 *
 * Two visual variants:
 * - `subtle` (default): 20px chip with translucent gold bg, used in profile/listing contexts.
 * - `filled`: solid gold badge, dark text, DM Mono — for gate overlays and locked chips.
 *   Designed for visibility under sunlight with gloves.
 *
 * Piso tipográfico: 12 px (caption de DESIGN.md §4). `size` no baja de ahí aunque el
 * consumidor pida menos: el ancho se ajusta con padding, nunca achicando la letra.
 */

import type { Tier } from '@/golf/billing/plans'

/** Caption de DESIGN.md §4: ningún texto de la app baja de 12 px. */
const FONT_SIZE_MIN = 12

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
  /** Font size for the filled variant (default 12px; values below 12 are raised to 12). */
  size?: number
}

export function ProBadge({ tier, className, variant = 'subtle', size = FONT_SIZE_MIN }: ProBadgeProps) {
  const label = tier === 'pro_plus' ? 'PRO+' : 'PRO'
  const fontSize = Math.max(size, FONT_SIZE_MIN)

  if (variant === 'filled') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-block',
          background: 'var(--brand)',
          color: 'var(--brand-dark)',
          fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace',
          fontSize: `${fontSize}px`,
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
        height: '20px',
        padding: '0 6px',
        borderRadius: '4px',
        background: 'rgba(196,153,42,0.12)',
        border: '1px solid rgba(196,153,42,0.20)',
        fontSize: `${FONT_SIZE_MIN}px`,
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
