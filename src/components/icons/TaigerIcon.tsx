/**
 * tAIger+ nav icon — tiger face crop in a circle.
 * Uses the real tiger-coach image, cropped via CSS.
 * For nav/sidebar at 18-24px. For larger uses, use TaigerHero.
 */
import Image from 'next/image'

export function TaigerIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        border: '1.5px solid rgba(196,153,42,0.4)',
        position: 'relative',
      }}
    >
      <Image
        src="/images/taiger/tiger-coaches.png"
        alt="tAIger+"
        width={size}
        height={size}
        style={{
          objectFit: 'cover',
          objectPosition: '12% 12%',
        }}
      />
    </span>
  )
}
