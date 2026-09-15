/**
 * FoundingMemberBadge — inline chip for founding members.
 *
 * Gold gradient aesthetic. Optional locked price display.
 * Works on both light and dark backgrounds.
 */

interface FoundingMemberBadgeProps {
  /** Show "$X/mes de por vida" alongside the badge */
  lockedPrice?: string
  /** Additional CSS class */
  className?: string
}

export function FoundingMemberBadge({ lockedPrice, className }: FoundingMemberBadgeProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '6px',
        background: 'linear-gradient(135deg, rgba(245,183,50,0.15) 0%, rgba(196,153,42,0.10) 100%)',
        border: '1px solid rgba(196,153,42,0.25)',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.02em',
        lineHeight: '16px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        background: 'linear-gradient(135deg, #f5b732, #c4992a)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        Socio Fundador
      </span>
      {lockedPrice && (
        <span style={{
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--text-2, #5a6573)',
          opacity: 0.8,
        }}>
          {lockedPrice}
        </span>
      )}
    </span>
  )
}
