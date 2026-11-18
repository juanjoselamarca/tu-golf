// Carrusel horizontal de jugadores del scorer (selección de tarjeta).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoringPlayer, ScoringRound } from '@/lib/data/tournaments/scoring'
import { isClosedRoundStatus } from '../hooks/useScoringData'
import { resolveLegacyPlayerName } from '@/golf/leaderboard/board-rules'
import { casoSinTarjeta, type CasoSinTarjeta } from './AvisoJugadorSinTarjeta'

const SIN_TARJETA: Record<CasoSinTarjeta, string> = { crear: 'Sin tarjeta', no_juega: 'No juega', no_jugo: 'No jugó' }

/**
 * Progreso de la tarjeta del jugador en la ronda vista. Sin tarjeta no hay "0/18" (decía que juega y no lleva
 * nada): dice lo mismo que el panel (`casoSinTarjeta`, Fable #833) — "Sin tarjeta" si se puede crear,
 * "No juega" (WD/DQ/pendiente en la ronda vigente), "No jugó" (ronda pasada o torneo cerrado).
 */
export function progresoDeTarjeta(args: {
  round: ScoringRound | undefined; status: string | null | undefined; hoyosConScore: number; holeCount: number
  rondaVigente: boolean; admiteTarjetas: boolean
}): string {
  if (!args.round) return SIN_TARJETA[casoSinTarjeta(args.status, args.rondaVigente, args.admiteTarjetas)]
  if (isClosedRoundStatus(args.round.status)) return '✓ Completo'
  return `${args.hoyosConScore}/${args.holeCount}`
}

/** Ancho del degradado de cada borde del carrusel (indica que hay más jugadores). */
const ANCHO_DEGRADADO = 32

/**
 * `scrollLeft` que deja la tarjeta [x, x+ancho] entera y fuera del degradado de cada borde; null si ya se ve.
 * `x` relativo al contenido del carrusel (el carrusel es el `offsetParent` de las tarjetas).
 */
export function scrollHorizontalParaVer(scrollLeft: number, visible: number, x: number, ancho: number, margen: number): number | null {
  if (x - margen < scrollLeft) return Math.max(0, x - margen)
  if (x + ancho + margen > scrollLeft + visible) return x + ancho + margen - visible
  return null
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

interface PlayerCardsProps {
  players: ScoringPlayer[]
  selectedId: string | null
  holeCount: number
  /** filledCount del jugador SELECCIONADO (real-time del scorer). */
  filledCount: number
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  hasScoresLoaded: boolean
  /** Conteos batch de hoyos por round_id (para progreso de TODOS los jugadores). */
  roundHoleCounts: Map<string, number>
  /** La ronda vista es la vigente (`useScoringData.esRondaVigente`). */
  rondaVigente: boolean
  /** El torneo recibe golpes (no está cerrado ni publicado). */
  admiteTarjetas: boolean
  onSelect: (playerId: string) => void
}

export function PlayerCards({
  players,
  selectedId,
  holeCount,
  filledCount,
  getActiveRound,
  hasScoresLoaded,
  roundHoleCounts,
  rondaVigente,
  admiteTarjetas,
  onSelect,
}: PlayerCardsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollIndicators()
    el.addEventListener('scroll', updateScrollIndicators, { passive: true })
    const ro = new ResizeObserver(updateScrollIndicators)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollIndicators)
      ro.disconnect()
    }
  }, [updateScrollIndicators, players.length])

  // La tarjeta elegida se ve entera: a 390 px la 3ª quedaba cortada bajo el degradado del borde ("No jugó"
  // ilegible, Fable #833 v2). Scroll SÓLO horizontal del carrusel: `scrollIntoView` movía también la página
  // (v3). Sólo al cambiar la elegida: no al llegar más jugadores con el roster.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !selectedId) return
    const card = Array.from(el.querySelectorAll<HTMLElement>('[data-player-card]')).find((c) => c.dataset.playerCard === selectedId)
    if (!card) return
    const left = scrollHorizontalParaVer(el.scrollLeft, el.clientWidth, card.offsetLeft, card.offsetWidth, ANCHO_DEGRADADO)
    if (left !== null) el.scrollTo?.({ left, behavior: 'smooth' })
  }, [selectedId])

  return (
    <div style={{ position: 'relative', marginBottom: '28px' }}>
      {/* Gradiente izquierdo */}
      {canScrollLeft && (
        <div
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: ANCHO_DEGRADADO,
            background: 'linear-gradient(to right, var(--bg-surface), transparent)',
            zIndex: 1, pointerEvents: 'none', borderRadius: '10px 0 0 10px',
          }}
        />
      )}
      {/* Gradiente derecho */}
      {canScrollRight && (
        <div
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: ANCHO_DEGRADADO,
            background: 'linear-gradient(to left, var(--bg-surface), transparent)',
            zIndex: 1, pointerEvents: 'none', borderRadius: '0 10px 10px 0',
          }}
        />
      )}
      <div ref={scrollRef} style={{ position: 'relative', overflowX: 'auto', scrollbarWidth: 'none' }}>
      <div style={{ display: 'flex', gap: '12px', padding: '4px 0' }}>
        {players.map((p) => {
          const round = getActiveRound(p)
          const isSelected = p.id === selectedId
          const isDone = isClosedRoundStatus(round?.status)
          return (
            <button
              key={p.id}
              data-player-card={p.id}
              aria-pressed={isSelected}
              onClick={() => onSelect(p.id)}
              style={{
                minWidth: '120px',
                padding: '14px 16px',
                background: isSelected ? 'var(--status-open-bg)' : 'var(--surface-soft)',
                border: isSelected ? '2px solid var(--brand-on-bg)' : '1px solid var(--surface-border)',
                borderRadius: '10px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 180ms',
                flexShrink: 0,
              }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSelected ? 'var(--brand-on-bg)' : 'var(--surface-border-strong)', color: isSelected ? 'var(--brand-dark)' : 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', margin: '0 auto 8px' }}>
                {getInitials(resolveLegacyPlayerName(p))}
              </div>
              <div style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 500, lineHeight: 1.2, marginBottom: '4px' }}>
                {resolveLegacyPlayerName(p).split(' ')[0]}
              </div>
              <div style={{ fontSize: '12px', color: isDone ? 'var(--status-live-fg)' : 'var(--text-2)' }}>
                {progresoDeTarjeta({
                  round, status: p.status, holeCount, rondaVigente, admiteTarjetas,
                  hoyosConScore: isSelected && hasScoresLoaded ? filledCount : (round ? (roundHoleCounts.get(round.id) ?? 0) : 0),
                })}
              </div>
            </button>
          )
        })}
      </div>
      </div>
    </div>
  )
}
