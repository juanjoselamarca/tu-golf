// Cabecera del scorer del organizador (navy broadcast). Pendiente de migrar a
// `TorneoHeader` (tracking "cabecera de torneo canónica") — se mantiene el
// bloque propio porque lleva controles operativos (EN VIVO, Rn/N, guardando,
// deshacer) que la canónica no modela aún; el swap visual es decisión de diseño
// del hilo principal, no de este refactor.

import Link from 'next/link'
import type { LastAction } from '../hooks/useScoreEntry'

interface ScoringHeaderProps {
  name: string
  slug: string
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
  isMultiRound,
  activeRoundNum,
  totalRounds,
  saving,
  lastAction,
  onUndo,
}: ScoringHeaderProps) {
  return (
    <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
      <div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: 'var(--text)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {name}
          <span style={{ fontSize: '12px', fontFamily: 'DM Sans, sans-serif', background: 'rgba(22,163,74,0.15)', color: '#4ade80', border: '1px solid rgba(22,163,74,0.4)', padding: '3px 10px', borderRadius: '20px', animation: 'pulse 2s infinite' }}>
            ● EN VIVO
          </span>
          {isMultiRound && (
            <span style={{ fontSize: '12px', fontFamily: 'DM Sans, sans-serif', background: 'rgba(196,153,42,0.12)', color: '#c4992a', border: '1px solid rgba(196,153,42,0.3)', padding: '3px 10px', borderRadius: '20px' }}>
              R{activeRoundNum}/{totalRounds}
            </span>
          )}
          {saving && <span style={{ fontSize: '12px', color: 'var(--text-2)', fontFamily: 'DM Sans, sans-serif' }}>Guardando...</span>}
          {lastAction && !saving && (
            <button
              onClick={onUndo}
              style={{ fontSize: '12px', color: '#c4992a', background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.3)', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
            >
              Deshacer hoyo {lastAction.holeNumber}
            </button>
          )}
        </h1>
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '12px', textDecoration: 'none' }}>← Dashboard</Link>
      </div>
      <Link
        href={`/torneo/${slug}`}
        target="_blank"
        style={{ background: 'rgba(196,153,42,0.12)', color: '#c4992a', border: '1px solid rgba(196,153,42,0.3)', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', textDecoration: 'none', fontWeight: 500 }}
      >
        Ver leaderboard público →
      </Link>
    </div>
  )
}
