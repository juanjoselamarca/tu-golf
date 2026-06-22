/**
 * RoundCard — una tarjeta de ronda en el historial.
 *
 * Encapsula: score + course + date + tee dot + HoleBar + menú "..." +
 * expanded scorecard + inline edit + excluded badge + ConfirmDeleteSheet.
 *
 * Local state propio para menuOpen y confirmDeleteOpen (no se lifta al parent).
 *
 * Refactor 'el que toca, ordena' — extraído del page.tsx monolítico.
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatLabel } from '@/golf/core/rules'
import { parPerHoleArray } from '@/golf/core/compare'
import Scorecard, { type ScorecardHole, type ScorecardProps } from '@/components/Scorecard'
import HoleBar from '@/components/HoleBar'
import { ChevronDown, MoreVertical } from '@/components/icons'
import { RoundMenu, ConfirmDeleteSheet } from './RoundMenu'
import { InlineEditScores } from './InlineEditScores'
import { TEE_COLORS } from '../lib/constants'
import { computeStats, formatDateShort, formatOv, scoreColor } from '../lib/helpers'
import type { HistoricalRound } from '../lib/types'

interface Props {
  round:           HistoricalRound
  isExpanded:      boolean
  isEditing:       boolean
  isLast:          boolean
  deleting:        boolean
  savingEdit:      boolean
  courseParCache?: Record<number, number>
  onToggleExpand:  () => void
  onStartEdit:     () => void
  onCancelEdit:    () => void
  onSaveEdit:      (scores: (number | null)[]) => Promise<void>
  onToggleExcluded: () => void
  onDeleteRound:   () => void
}

export function RoundCard({
  round: r,
  isExpanded: isOpen,
  isEditing,
  isLast,
  deleting,
  savingEdit,
  courseParCache: cp,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleExcluded,
  onDeleteRound,
}: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const holePars = parPerHoleArray(r.par_per_hole, r.scores?.length ?? 0)
  const stats    = computeStats(r.scores, holePars)
  const dateStr  = formatDateShort(r.played_at)
  const holes    = r.holes_played ?? r.scores?.filter(Boolean).length ?? 18
  const par      = stats?.holePars ? stats.holePars.reduce((a: number, b: number) => a + b, 0) : (holes <= 9 ? 36 : 72)

  // Match Play no se mide por strokes vs par
  const isMatchPlay = r.formato_juego === 'match_play'
  // vsPar solo es válido sobre rondas COMPLETAS
  const playedScores = r.scores?.filter((s: number | null) => s != null).length ?? 0
  const isComplete   = playedScores >= holes && playedScores > 0
  const ov           = (r.total_gross != null && !isMatchPlay && isComplete) ? r.total_gross - par : null
  const teeHex       = r.tee_color ? TEE_COLORS[r.tee_color] || '#9ca3af' : null

  return (
    <div
      id={`round-card-${r.id}`}
      className="card-animate"
      onClick={() => router.push(`/perfil/historial/${r.id}`)}
      style={{
        borderBottom: !isLast ? '1px solid #f0f0f0' : 'none',
        cursor: 'pointer',
      }}
    >
      {/* Row */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Score — colored by vsPar */}
        <div style={{ flexShrink: 0, textAlign: 'center', width: '50px' }}>
          <div style={{
            fontSize: '26px', fontWeight: 700, lineHeight: 1,
            color: scoreColor(ov),
            fontVariantNumeric: 'tabular-nums',
          }}>
            {r.total_gross ?? '—'}
          </div>
          {ov != null && (
            <div style={{
              fontSize: '11px', fontWeight: 600, marginTop: '3px',
              color: scoreColor(ov),
            }}>
              {formatOv(ov)}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '36px', background: 'var(--border)', flexShrink: 0 }} />

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.course_name}
            </span>
            {r.formato_juego && r.formato_juego !== 'stroke_play' && (
              <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(196,153,42,0.12)',
                color: '#92400e',
                fontSize: '10px',
                fontWeight: 600,
                fontFamily: '"DM Mono", monospace',
                letterSpacing: '0.02em',
                marginLeft: '6px',
                flexShrink: 0,
              }}>
                {formatLabel(r.formato_juego, r.modo_juego)}
              </span>
            )}
            {r.modo_juego === 'neto' && r.formato_juego !== 'stableford' && r.formato_juego !== 'match_play' && (
              <span style={{
                display: 'inline-block',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(196,153,42,0.08)',
                color: '#92400e',
                border: '1px solid rgba(196,153,42,0.25)',
                fontSize: '10px',
                fontWeight: 600,
                fontFamily: '"DM Mono", monospace',
                letterSpacing: '0.02em',
                marginLeft: '4px',
                flexShrink: 0,
              }}>
                NETO
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{dateStr}</span>
            {teeHex && (
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: teeHex,
                border: teeHex === '#ffffff' ? '1px solid #d1d5db' : 'none',
                display: 'inline-block', flexShrink: 0,
              }} />
            )}
          </div>
        </div>

        {/* Right side — menú "..." + chevron */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            aria-label="Opciones de la tarjeta"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', padding: '6px',
              minWidth: '32px', minHeight: '32px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '8px',
            }}
          >
            <MoreVertical size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
            aria-label={isOpen ? 'Colapsar scorecard' : 'Expandir scorecard'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px', minWidth: '32px', minHeight: '32px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#d1d5db',
              transition: 'transform 0.2s',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            }}
          >
            <ChevronDown size={14} strokeWidth={2} />
          </button>

          <RoundMenu
            open={menuOpen}
            isExcluded={!!r.excluded_from_handicap}
            deleting={deleting}
            onClose={() => setMenuOpen(false)}
            // Editar inline (expande la tarjeta + InlineEditScores), igual que el
            // botón "Editar" del scorecard expandido. Antes navegaba a
            // /perfil/historial/{id}?edit=1, pero ese detalle es SOLO-LECTURA e
            // ignora ?edit=1 → el botón "no hacía nada" (bug inbox 37348220).
            onEdit={onStartEdit}
            onToggleExcluded={onToggleExcluded}
            onRequestDelete={() => setConfirmDeleteOpen(true)}
          />
        </div>
      </div>

      {/* Garmin activity bar */}
      {r.scores && r.scores.some(Boolean) && (
        <div style={{ padding: '0 16px 8px' }}>
          <HoleBar
            scores={r.scores ?? []}
            pars={r.par_per_hole ?? (r.course_id && cp ? cp : undefined) ?? {}}
            totalHoles={r.holes_played ?? 18}
            height={5}
            gap={1.5}
          />
        </div>
      )}

      {/* Badge "Excluida del índice" */}
      {r.excluded_from_handicap && (
        <div style={{ padding: '0 16px 10px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '6px',
            background: 'rgba(148,168,192,0.12)',
            color: 'var(--text-3)',
            fontFamily: '"DM Mono", monospace',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            <span aria-hidden>&#8709;</span> no cuenta para el índice
          </span>
        </div>
      )}

      {/* Expanded scorecard */}
      {isOpen && (() => {
        const parPerHoleRaw = r.par_per_hole ?? {}
        const coursePars: Record<number, number> = cp ?? {}
        const getParFor = (n: number): number => {
          const fromRound = parPerHoleRaw[String(n)] ?? (parPerHoleRaw as Record<number, number>)[n]
          if (typeof fromRound === 'number') return fromRound
          return coursePars[n] ?? 4
        }
        const totalHoles = r.holes_played ?? 18
        const scorecardHoles: ScorecardHole[] = Array.from({ length: totalHoles }, (_, i) => ({
          numero: i + 1,
          par: getParFor(i + 1),
          stroke_index: i + 1,
        }))
        const scorecardScores: Record<string, number> = Object.fromEntries(
          (r.scores ?? [])
            .map((s: number | null, i: number) => [String(i + 1), s] as [string, number | null])
            .filter((pair): pair is [string, number] => pair[1] != null)
        )

        return (
          <div style={{ padding: '0 0 14px' }} onClick={(e) => e.stopPropagation()}>
            <Scorecard
              holes={scorecardHoles}
              scores={scorecardScores}
              courseHandicap={0}
              modo="gross"
              formato={(r.formato_juego as ScorecardProps['formato']) ?? 'stroke_play'}
              playerName={undefined}
              courseName={r.course_name}
              date={dateStr}
            />

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', padding: '0 10px' }}>
              {!isEditing && (
                <button
                  onClick={(e) => { e.stopPropagation(); onStartEdit() }}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: '8px',
                    padding: '6px 14px', fontSize: '12px', color: '#c4992a', fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Editar
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteOpen(true) }}
                disabled={deleting}
                style={{
                  background: 'none', border: '1px solid #fecaca', borderRadius: '8px',
                  padding: '6px 14px', fontSize: '12px', color: '#dc2626', fontWeight: 500,
                  cursor: 'pointer', opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>

            {/* Edit mode */}
            {isEditing && (
              <InlineEditScores
                initialScores={r.scores}
                saving={savingEdit}
                onSave={(scores) => void onSaveEdit(scores)}
                onCancel={onCancelEdit}
              />
            )}
          </div>
        )
      })()}

      {/* ConfirmDeleteSheet — modal inline, reemplaza window.confirm */}
      <ConfirmDeleteSheet
        open={confirmDeleteOpen}
        courseLabel={r.course_name || 'esa cancha'}
        dateLabel={r.played_at ? formatDateShort(r.played_at) : 'esta ronda'}
        deleting={deleting}
        onConfirm={() => {
          onDeleteRound()
          setConfirmDeleteOpen(false)
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  )
}
