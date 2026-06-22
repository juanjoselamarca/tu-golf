'use client'

import type { MessageVote } from '@/lib/data/taiger'

interface MessageFeedbackProps {
  vote: MessageVote | undefined
  onVote: (clicked: MessageVote) => void
}

/**
 * 👍/👎 por respuesta del coach (PR2, D9). Iconos de línea fina en oro (regla de
 * diseño: nada de emoji infantil en UI premium). Touch targets de 48px (D8) para
 * uso con guante/apuro, aunque el ícono visible sea chico.
 */
export function MessageFeedback({ vote, onVote }: MessageFeedbackProps) {
  return (
    <div
      style={{ display: 'flex', gap: 4, marginTop: 6, marginLeft: 40 }}
      role="group"
      aria-label="¿Te sirvió esta respuesta?"
    >
      <ThumbButton
        active={vote === 1}
        direction="up"
        label="Me sirvió"
        onClick={() => onVote(1)}
      />
      <ThumbButton
        active={vote === -1}
        direction="down"
        label="No me sirvió"
        onClick={() => onVote(-1)}
      />
    </div>
  )
}

function ThumbButton({
  active,
  direction,
  label,
  onClick,
}: {
  active: boolean
  direction: 'up' | 'down'
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      style={{
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'rgba(196,153,42,0.14)' : 'transparent',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        padding: 0,
        transition: 'background 0.15s, color 0.15s',
        color: active ? '#c4992a' : 'var(--text-2)',
      }}
    >
      <ThumbIcon direction={direction} filled={active} />
    </button>
  )
}

/** Pulgar de línea fina (stroke = currentColor). `filled` añade un leve relleno al votar. */
function ThumbIcon({ direction, filled }: { direction: 'up' | 'down'; filled: boolean }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill={filled ? 'rgba(196,153,42,0.18)' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: direction === 'down' ? 'rotate(180deg)' : undefined }}
      aria-hidden="true"
    >
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
      <path d="M7 11l4-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 18.8 20H7" />
    </svg>
  )
}
