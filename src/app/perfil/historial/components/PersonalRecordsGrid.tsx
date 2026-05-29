/**
 * Grid de Personal Records (18h + 9h).
 * Tap-to-scroll a la card de la ronda PR en la lista (inbox e21e2a32).
 */
'use client'

import { Trophy } from '@/components/icons'
import { cardStyle } from '../lib/constants'
import { formatDateShort, formatOv, scoreColor } from '../lib/helpers'
import type { BestRound } from '../lib/types'

interface Props {
  bestRound18: BestRound | null
  bestRound9:  BestRound | null
}

const PR_HIGHLIGHT_MS = 1600

function scrollToRoundCard(roundId: string) {
  const el = document.getElementById(`round-card-${roundId}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('historial-pr-highlight')
  setTimeout(() => el.classList.remove('historial-pr-highlight'), PR_HIGHLIGHT_MS)
}

export function PersonalRecordsGrid({ bestRound18, bestRound9 }: Props) {
  if (!bestRound18 && !bestRound9) return null

  const recs = ([
    { label: 'Personal Record 18 hoyos', data: bestRound18 },
    { label: 'Personal Record 9 hoyos',  data: bestRound9 },
  ] as const).filter(r => r.data !== null)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '10px',
      marginBottom: '16px',
    }}>
      <style>{`
        .historial-pr-highlight {
          animation: historial-pr-pulse 1.6s ease-out;
        }
        @keyframes historial-pr-pulse {
          0%   { background: rgba(196,153,42,0.18); box-shadow: 0 0 0 3px rgba(196,153,42,0.35); }
          100% { background: transparent; box-shadow: 0 0 0 0 rgba(196,153,42,0); }
        }
      `}</style>
      {recs.map(rec => {
        const d = rec.data!
        const canScroll = !!d.roundId
        const handleClick = () => { if (d.roundId) scrollToRoundCard(d.roundId) }
        return (
          <div
            key={rec.label}
            onClick={canScroll ? handleClick : undefined}
            onKeyDown={canScroll ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() }
            } : undefined}
            role={canScroll ? 'button' : undefined}
            tabIndex={canScroll ? 0 : undefined}
            aria-label={canScroll ? `Ir a ${rec.label} en la lista` : undefined}
            style={{
              ...cardStyle,
              padding: '14px 16px',
              cursor: canScroll ? 'pointer' : 'default',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
            onMouseEnter={canScroll ? (e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' } : undefined}
            onMouseLeave={canScroll ? (e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' } : undefined}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', color: '#c4992a' }}>
                <Trophy size={14} strokeWidth={1.75} />
              </span>
              <span style={{
                fontSize: '10px', fontWeight: 600, color: 'var(--text-3)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {rec.label}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{
                fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace',
                fontSize: '28px', fontWeight: 700, color: '#c4992a',
                lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              }}>
                {d.score}
              </span>
              <span style={{
                fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace',
                fontSize: '12px', fontWeight: 600,
                color: scoreColor(d.vsPar),
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatOv(d.vsPar)}
              </span>
            </div>
            <div style={{
              fontSize: '11px', color: 'var(--text-3)',
              marginTop: '4px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {d.course}
            </div>
            <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '2px' }}>
              {formatDateShort(d.date)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
