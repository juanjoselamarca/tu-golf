// Cabecera del scorer del organizador (navy broadcast). Pendiente de migrar a
// `TorneoHeader` (tracking "cabecera de torneo canónica") — se mantiene el
// bloque propio porque lleva controles operativos (EN VIVO, Rn/N, guardando,
// deshacer) que la canónica no modela aún; el swap visual es decisión de diseño
// del hilo principal, no de este refactor.

import Link from 'next/link'
import { tournamentStatusBadge, torneoAceptaScores } from '@/golf/tournament-status'
import type { LastAction } from '../hooks/useScoreEntry'

interface ScoringHeaderProps {
  name: string
  slug: string
  /** `tournaments.status`: el badge dice el estado real (antes decía "EN VIVO" siempre, aun sin empezar). */
  status: string | null
  isMultiRound: boolean
  activeRoundNum: number
  totalRounds: number
  saving: boolean
  lastAction: LastAction | null
  onUndo: () => void
}

export function ScoringHeader({
  name,
  slug,
  status,
  isMultiRound,
  activeRoundNum,
  totalRounds,
  saving,
  lastAction,
  onUndo,
}: ScoringHeaderProps) {
  const badge = tournamentStatusBadge(status, 'organizer')
  const enCurso = torneoAceptaScores(status)
  return (
    <div style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border-md)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
      <div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: 'var(--text)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {name}
          <span style={{ fontSize: '12px', fontFamily: 'DM Sans, sans-serif', background: badge.bg, color: badge.fg, border: '1px solid currentColor', padding: '3px 10px', borderRadius: '20px', animation: enCurso ? 'pulse 2s infinite' : undefined }}>
            {enCurso ? '● ' : ''}{badge.label}
          </span>
          {isMultiRound && (
            <span style={{ fontSize: '12px', fontFamily: 'DM Sans, sans-serif', background: 'rgba(196,153,42,0.12)', color: 'var(--brand-on-bg)', border: '1px solid rgba(196,153,42,0.3)', padding: '3px 10px', borderRadius: '20px' }}>
              R{activeRoundNum}/{totalRounds}
            </span>
          )}
          {saving && <span style={{ fontSize: '12px', color: 'var(--text-2)', fontFamily: 'DM Sans, sans-serif' }}>Guardando...</span>}
          {lastAction && !saving && (
            <button
              onClick={onUndo}
              style={{ fontSize: '12px', color: 'var(--brand-on-bg)', background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.3)', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
            >
              Deshacer hoyo {lastAction.holeNumber}
            </button>
          )}
        </h1>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '12px', textDecoration: 'none' }}>← Dashboard</Link>
          <Link href={`/organizador/${slug}/jugadores`} style={{ color: 'var(--text-2)', fontSize: '12px', textDecoration: 'none' }}>Jugadores</Link>
          <Link href={`/organizador/${slug}/salida`} style={{ color: 'var(--text-2)', fontSize: '12px', textDecoration: 'none' }}>Salida</Link>
        </div>
      </div>
      <Link
        href={`/torneo/${slug}`}
        target="_blank"
        style={{ background: 'rgba(196,153,42,0.12)', color: 'var(--brand-on-bg)', border: '1px solid rgba(196,153,42,0.3)', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', textDecoration: 'none', fontWeight: 500 }}
      >
        Ver leaderboard público →
      </Link>
    </div>
  )
}
