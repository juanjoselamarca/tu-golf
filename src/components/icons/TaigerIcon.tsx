import Image from 'next/image'

/**
 * tAIger+ nav icon — tiger coach face in a gold-bordered circle.
 * Uses the TAIGER DOMINGO image (red polo, black cap).
 */
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
        src="/images/taiger/taiger-domingo.png"
        alt="tAIger+"
        width={size * 2}
        height={size * 2}
        style={{
          objectFit: 'cover',
          objectPosition: '50% 8%',
          width: size,
          height: size,
        }}
      />
    </span>
  )
}
