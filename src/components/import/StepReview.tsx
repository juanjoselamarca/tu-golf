'use client'

import { useState, useCallback } from 'react'
import type { ImportRoundData } from '@/lib/import-types'
import type { ResultadoCPI } from '@/golf/stats/cpi'
import type { ImportState } from './ImportWizard'
import ScoreSymbol from '@/components/ScoreSymbol'
import HoleBar from '@/components/HoleBar'
import { CheckCircle, Flag, ChevronDown } from '@/components/icons'

interface StepReviewProps {
  rounds: ImportRoundData[]
  jobId: string | null
  onBack: () => void
  onConfirm: (cpiResult: ResultadoCPI, insights: string[]) => void
  onStateUpdate: (partial: Partial<ImportState>) => void
}

type CardStatus = 'accepted' | 'rejected'
type ConfidenceLevel = 'high' | 'medium' | 'low' | 'incomplete' | 'garmin'

// ── Validation helpers ──
function isComplete(round: ImportRoundData): boolean {
  const holes = round.holes_played || 0
  if (holes !== 9 && holes !== 18) return false
  const filledHoles = Object.values(round.scores).filter(v => typeof v === 'number' && v > 0).length
  return filledHoles === holes
}

function isGarminRound(round: ImportRoundData): boolean {
  return round.import_confidence === 1.0 || round.metadata?.import_source === 'garmin_zip'
}

function getConfidenceLevel(round: ImportRoundData): ConfidenceLevel {
  if (isGarminRound(round)) return 'garmin'
  if (!isComplete(round)) return 'incomplete'
  const conf = round.import_confidence || 0
  const hasAmbiguous = (round.metadata?.ambiguous_holes?.length || 0) > 0
  if (conf >= 0.9 && !hasAmbiguous) return 'high'
  if (conf >= 0.7) return 'medium'
  return 'low'
}

function getStatusLabel(level: ConfidenceLevel): { text: string; color: string; bg: string } {
  switch (level) {
    case 'garmin': return { text: 'DATOS DE GARMIN', color: '#22c55e', bg: 'rgba(34,197,94,0.10)' }
    case 'high': return { text: 'VERIFICADA', color: '#c4992a', bg: 'rgba(196,153,42,0.10)' }
    case 'medium': return { text: 'REVISAR', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' }
    case 'low': return { text: 'REVISAR', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' }
    case 'incomplete': return { text: 'INCOMPLETA', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' }
  }
}

function getCardBorder(level: ConfidenceLevel, status: CardStatus | undefined): string {
  if (status === 'rejected') return '1px solid rgba(255,255,255,0.06)'
  switch (level) {
    case 'garmin': return '1px solid rgba(34,197,94,0.3)'
    case 'high': return '1px solid rgba(196,153,42,0.25)'
    case 'medium': return '1px solid rgba(245,158,11,0.2)'
    case 'low': return '1px solid rgba(245,158,11,0.15)'
    case 'incomplete': return '1px solid rgba(239,68,68,0.2)'
  }
}

function getCardShadow(level: ConfidenceLevel, status: CardStatus | undefined): string {
  if (status === 'rejected') return 'none'
  if (level === 'garmin') return '0 0 16px rgba(34,197,94,0.06)'
  if (level === 'high') return '0 0 16px rgba(196,153,42,0.08)'
  return 'none'
}

export default function StepReview({
  rounds: initialRounds,
  jobId,
  onBack,
  onConfirm,
  onStateUpdate,
}: StepReviewProps) {
  const [rounds, setRounds] = useState<ImportRoundData[]>(initialRounds)
  const [decisions, setDecisions] = useState<Record<string, CardStatus>>(() => {
    const initial: Record<string, CardStatus> = {}
    initialRounds.forEach(r => {
      initial[r.tempId] = 'accepted'
    })
    return initial
  })
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState(false)
  // Formato/modo aplicados a todas las rondas de este import.
  // Default: stroke_play + gross (compatible con flujo previo).
  type Formato = 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'
  type Modo = 'gross' | 'neto'
  const [formato, setFormato] = useState<Formato>('stroke_play')
  const [modo, setModo] = useState<Modo>('gross')
  // Stableford y Match Play fuerzan neto (regla R&A/USGA).
  const modoForced = formato === 'stableford' || formato === 'match_play'
  const effectiveModo: Modo = modoForced ? 'neto' : modo

  const getPar = (round: ImportRoundData, h: number) => round.par_per_hole?.[String(h)] ?? 4
  const hasPars = (round: ImportRoundData) => round.par_per_hole != null && Object.keys(round.par_per_hole).length > 0

  // Count stats
  const acceptedCount = Object.values(decisions).filter(d => d === 'accepted').length
  const rejectedCount = Object.values(decisions).filter(d => d === 'rejected').length

  // Summary pill counts
  const garminCount = rounds.filter(r => {
    const level = getConfidenceLevel(r)
    return level === 'garmin' && decisions[r.tempId] === 'accepted'
  }).length
  const verifiedCount = rounds.filter(r => {
    const level = getConfidenceLevel(r)
    return (level === 'high') && decisions[r.tempId] === 'accepted'
  }).length
  const reviewCount = rounds.filter(r => {
    const level = getConfidenceLevel(r)
    return (level === 'medium' || level === 'low') && decisions[r.tempId] !== 'rejected'
  }).length
  const incompleteCount = rounds.filter(r => {
    const level = getConfidenceLevel(r)
    return level === 'incomplete' && decisions[r.tempId] !== 'rejected'
  }).length

  const toggleExpand = useCallback((tempId: string) => {
    setExpandedCards(prev => ({ ...prev, [tempId]: !prev[tempId] }))
  }, [])

  const handleDecision = useCallback((tempId: string, status: CardStatus) => {
    setDecisions(prev => ({ ...prev, [tempId]: status }))
    if (status === 'rejected') {
      setExpandedCards(prev => ({ ...prev, [tempId]: false }))
    }
  }, [])

  // Score edit (standard mode)
  const handleScoreEdit = useCallback((tempId: string, hole: number, currentScore: number | undefined) => {
    const input = prompt(`Hoyo ${hole} — score:`, currentScore != null ? String(currentScore) : '')
    if (input === null) return
    const val = parseInt(input)
    if (isNaN(val) || val < 1 || val > 15) return
    setRounds(prev => prev.map(r => {
      if (r.tempId !== tempId) return r
      const newScores = { ...r.scores, [String(hole)]: val }
      const sum = Object.values(newScores).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)
      return { ...r, scores: newScores, total_gross: sum }
    }))
  }, [])

  // Confirm import
  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const acceptedRounds = rounds
        .filter(r => decisions[r.tempId] === 'accepted')
        .map(r => ({ ...r, formato_juego: formato, modo_juego: effectiveModo }))
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, rounds: acceptedRounds }),
      })
      if (!res.ok) throw new Error('Error confirmando')
      const data = await res.json()
      onStateUpdate({ rounds: acceptedRounds })
      onConfirm(data.cpiResult, data.insights || [])
    } catch (err) {
      console.error('Confirm error:', err)
      setConfirming(false)
    }
  }

  // ── Render scorecard row (OUT or IN) ──
  const renderScorecardRow = (round: ImportRoundData, startIdx: number) => {
    const endIdx = Math.min(startIdx + 9, round.holes_played)
    if (startIdx >= round.holes_played) return null
    let rowTotal = 0
    let parTotal = 0

    return (
      <div key={startIdx} style={{ marginBottom: startIdx === 0 && round.holes_played > 9 ? '12px' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, display: 'flex' }}>
            {Array.from({ length: endIdx - startIdx }, (_, j) => {
              const h = startIdx + j + 1
              const score = round.scores[String(h)]
              const par = getPar(round, h)
              const isAmb = round.metadata?.ambiguous_holes?.includes(h)
              if (typeof score === 'number') rowTotal += score
              parTotal += par

              return (
                <div key={h} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                  {/* Hole number */}
                  <div style={{ fontSize: '10px', color: '#5a7494', marginBottom: '1px', fontWeight: 500 }}>{h}</div>
                  {/* Par label — only show if we have real pars */}
                  {hasPars(round) && (
                    <div style={{ fontSize: '8px', color: '#3d5570', marginBottom: '3px', letterSpacing: '0.02em' }}>P{par}</div>
                  )}
                  {/* Score */}
                  <div
                    style={{
                      minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', position: 'relative',
                    }}
                    onClick={() => handleScoreEdit(round.tempId, h, typeof score === 'number' ? score : undefined)}
                  >
                    {score != null ? (
                      hasPars(round) ? (
                        <ScoreSymbol score={score} par={par} size="sm" theme="dark" />
                      ) : (
                        <div style={{
                          width: '22px', height: '22px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: 700, color: 'var(--text)',
                        }}>{score}</div>
                      )
                    ) : (
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '4px',
                        border: '1px dashed rgba(255,255,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '9px', color: '#5a7494',
                      }}>?</div>
                    )}
                    {isAmb && (
                      <div style={{
                        position: 'absolute', top: -1, right: 0,
                        width: '5px', height: '5px', borderRadius: '50%', background: '#60a5fa',
                      }} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{
            minWidth: '36px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)',
            paddingLeft: '8px', marginLeft: '6px',
          }}>
            <div style={{ fontSize: '10px', color: '#5a7494', marginBottom: '1px', fontWeight: 600 }}>{startIdx === 0 ? 'OUT' : 'IN'}</div>
            <div style={{ fontSize: '8px', color: '#3d5570', marginBottom: '3px' }}>P{parTotal}</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#c4992a' }}>{rowTotal}</div>
          </div>
        </div>
      </div>
    )
  }

  // Build garmin stats line
  const getGarminStatsLine = (round: ImportRoundData): string | null => {
    const parts: string[] = []
    if (round.metadata?.putts != null) parts.push(`Putts: ${round.metadata.putts}`)
    if (round.metadata?.fairways != null) parts.push(`Fairways: ${round.metadata.fairways}`)
    if (round.metadata?.penalties != null) parts.push(`Penalties: ${round.metadata.penalties}`)
    return parts.length > 0 ? parts.join(' | ') : null
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @keyframes reviewFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes reviewCardEnter {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        padding: '12px 16px',
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <button onClick={onBack} style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)', border: 'none',
            color: 'var(--text)', fontSize: '18px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>{'←'}</button>
          <div style={{ flex: 1 }}>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '20px', fontWeight: 700, color: 'var(--text)',
              margin: 0, lineHeight: 1.2,
            }}>
              {`Revisar ${rounds.length} rondas`}
            </h2>
          </div>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {garminCount > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(34,197,94,0.10)', color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.15)',
            }}>
              {garminCount} Garmin
            </span>
          )}
          {verifiedCount > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(34,197,94,0.10)', color: '#50c878',
              border: '1px solid rgba(34,197,94,0.15)',
            }}>
              {verifiedCount} {verifiedCount === 1 ? 'lista' : 'listas'}
            </span>
          )}
          {reviewCount > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.15)',
            }}>
              {reviewCount} revisar
            </span>
          )}
          {incompleteCount > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(239,68,68,0.08)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.15)',
            }}>
              {incompleteCount} {incompleteCount === 1 ? 'incompleta' : 'incompletas'}
            </span>
          )}
          {rejectedCount > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(255,255,255,0.03)', color: '#5a7494',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {rejectedCount} descartadas
            </span>
          )}
        </div>
      </div>

      {/* ── Card list (scrollable) ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '100px' }}>
          {rounds.map((round, idx) => {
            const level = getConfidenceLevel(round)
            const status = decisions[round.tempId]
            const isRejected = status === 'rejected'
            const isExpanded = expandedCards[round.tempId] || false
            const statusLabel = getStatusLabel(level)
            const isGarmin = level === 'garmin'
            const garminStats = getGarminStatsLine(round)

            // vsPar del score importado — null si no hay pars suficientes para calcular.
            // Replicar la convención de /perfil/historial: gris si null, rojo si over, dorado si <=par.
            const importedPars: Record<string, number> | undefined = round.par_per_hole
            const totalPar = importedPars
              ? Object.entries(importedPars)
                  .filter(([h]) => Number(h) <= (round.holes_played ?? 18))
                  .reduce((a, [, p]) => a + (Number(p) || 0), 0)
              : null
            const vsParImport = (round.total_gross != null && totalPar != null && totalPar > 0)
              ? round.total_gross - totalPar
              : null
            const formatOv = (v: number): string => v === 0 ? 'E' : v > 0 ? `+${v}` : String(v)
            const scoreColorImport = vsParImport == null ? 'var(--text)' : vsParImport <= 0 ? '#c4992a' : vsParImport <= 3 ? 'var(--text)' : '#ef4444'

            return (
              <div
                key={round.tempId}
                style={{
                  background: isRejected ? 'rgba(255,255,255,0.02)' : 'var(--bg-surface)',
                  border: isRejected ? '1px solid rgba(255,255,255,0.06)' : getCardBorder(level, status),
                  borderRadius: '16px',
                  overflow: 'hidden',
                  opacity: isRejected ? 0.5 : 1,
                  transition: 'all 0.3s ease',
                  boxShadow: getCardShadow(level, status),
                  animation: `reviewCardEnter 0.4s ease-out ${idx * 0.05}s both`,
                }}
              >
                {/* Row layout horizontal — replica /perfil/historial card.
                    Score grande izq · club + fecha centro · status pill + chevron derecha. */}
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {/* Score column — coloreado por vsPar (cuando hay pars) */}
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: '50px' }}>
                    {!isRejected ? (
                      <>
                        <div style={{
                          fontFamily: "'Playfair Display', serif",
                          fontSize: '28px', fontWeight: 700,
                          color: isRejected ? '#5a7494' : scoreColorImport,
                          lineHeight: 1,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {round.total_gross ?? '—'}
                        </div>
                        {vsParImport != null && (
                          <div style={{
                            fontSize: '11px',
                            color: 'var(--text-3)',
                            marginTop: '2px',
                            fontFamily: '"DM Mono", monospace',
                            letterSpacing: '0.04em',
                          }}>
                            {formatOv(vsParImport)}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: '24px', color: '#5a7494' }}>—</div>
                    )}
                  </div>

                  {/* Center — club name + date + status pill */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: '16px', fontWeight: 700,
                      color: isRejected ? '#5a7494' : 'var(--text)',
                      marginBottom: '2px',
                      lineHeight: 1.2,
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      <Flag size={12} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, opacity: 0.6 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {round.course_name || 'Campo desconocido'}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '12px', color: 'var(--text-3)',
                      display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                    }}>
                      <span>{round.played_at}</span>
                      <span aria-hidden>·</span>
                      <span>{round.holes_played}h</span>
                      <span
                        style={{
                          padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600,
                          background: isRejected ? 'rgba(255,255,255,0.03)' : statusLabel.bg,
                          color: isRejected ? '#5a7494' : statusLabel.color,
                          letterSpacing: '0.04em',
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                        }}
                      >
                        {!isRejected && isGarmin && <CheckCircle size={10} strokeWidth={2} aria-hidden />}
                        {!isRejected && level === 'high' && <CheckCircle size={10} strokeWidth={2} aria-hidden />}
                        {isRejected ? 'DESCARTADA' : statusLabel.text}
                      </span>
                    </div>
                  </div>

                  {/* Right side — chevron expand */}
                  {!isRejected && (
                    <button
                      onClick={() => toggleExpand(round.tempId)}
                      aria-label={isExpanded ? 'Ocultar scorecard' : 'Ver scorecard'}
                      aria-expanded={isExpanded}
                      style={{
                        flexShrink: 0,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-3)', padding: '6px',
                        minWidth: '32px', minHeight: '32px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '8px',
                        transition: 'transform 0.2s ease, color 0.15s ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <ChevronDown size={16} strokeWidth={2} />
                    </button>
                  )}
                </div>

                {/* HoleBar — barra Garmin de colores por hoyo. Visible siempre (no requiere expand),
                    igual que en /perfil/historial. Le da feedback inmediato del scan al usuario.
                    scores en wizard es Record<string,number>; HoleBar acepta ese tipo directamente. */}
                {!isRejected && round.scores && Object.values(round.scores).some(s => typeof s === 'number' && s > 0) && (
                  <div style={{ padding: '0 16px 12px' }}>
                    <HoleBar
                      scores={round.scores}
                      pars={importedPars ?? {}}
                      totalHoles={round.holes_played ?? 18}
                      height={5}
                      gap={1.5}
                    />
                  </div>
                )}

                {/* Expanded scorecard — wrapper con padding lateral para alinear con la row de arriba */}
                {!isRejected && isExpanded && (
                  <div style={{ padding: '0 16px 16px' }}>
                  <div style={{
                    background: '#111827',
                    borderRadius: '12px',
                    padding: '14px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                  }}>
                    {[0, 9].map(startIdx => renderScorecardRow(round, startIdx))}
                    {round.metadata?.ambiguous_holes && round.metadata.ambiguous_holes.length > 0 && (
                      <div style={{ fontSize: '10px', color: '#60a5fa', marginTop: '8px', textAlign: 'center' }}>
                        Hoyos con punto azul fueron estimados — toca para corregir
                      </div>
                    )}
                    {/* Garmin stats line below scorecard */}
                    {garminStats && (
                      <div style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        fontSize: '12px',
                        color: 'var(--text-2)',
                        textAlign: 'center',
                        fontWeight: 500,
                      }}>
                        {garminStats}
                      </div>
                    )}
                  </div>
                  </div>
                )}

                {/* Action buttons — clean text links. Padding lateral + border-top sutil para
                    separarlo del HoleBar/expanded scorecard sin chrome adicional. */}
                {!isRejected && (
                  <div style={{
                    padding: '8px 16px 14px',
                    display: 'flex', gap: '16px', alignItems: 'center',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                  }}>{/* keep gap layout below */}
                    {decisions[round.tempId] === 'accepted' ? (
                      <>
                        <span style={{
                          flex: 1, display: 'flex', alignItems: 'center',
                          gap: '6px',
                          color: '#50c878', fontSize: '14px', fontWeight: 600,
                          minHeight: '44px',
                        }}>
                          {'✔'} Aceptada
                        </span>
                        <button
                          onClick={() => handleDecision(round.tempId, 'rejected')}
                          style={{
                            padding: '8px 0', borderRadius: '8px',
                            background: 'transparent',
                            border: 'none',
                            color: '#ef4444', fontSize: '13px', fontWeight: 600,
                            cursor: 'pointer', minHeight: '44px',
                          }}
                        >
                          Descartar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleDecision(round.tempId, 'accepted')}
                        style={{
                          flex: 1, padding: '10px',
                          background: 'transparent',
                          border: 'none',
                          color: '#50c878', fontSize: '14px', fontWeight: 600,
                          cursor: 'pointer', minHeight: '44px',
                          textAlign: 'left',
                        }}
                      >
                        {'✔'} Aceptar
                      </button>
                    )}
                  </div>
                )}

                {/* Rejected — restore button (con padding lateral del card) */}
                {isRejected && (
                  <div style={{ padding: '0 16px 14px' }}>
                    <button
                      onClick={() => handleDecision(round.tempId, 'accepted')}
                      style={{
                        width: '100%', padding: '10px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#5a7494', fontSize: '13px', fontWeight: 500,
                        cursor: 'pointer', minHeight: '44px',
                      }}
                    >
                      Restaurar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Sticky bottom bar ── */}
      {acceptedCount > 0 && (
        <div style={{
          position: 'sticky', bottom: 0, left: 0, right: 0,
          padding: '16px',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, var(--bg) 60%, transparent)',
        }}>
          {/* Format + mode selectors — se aplican a todas las rondas aceptadas */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
            marginBottom: '12px',
            background: 'rgba(14,28,47,0.95)',
            border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '10px', padding: '10px 12px',
          }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-2)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Formato</span>
              <select
                value={formato}
                onChange={e => setFormato(e.target.value as Formato)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.25)',
                  color: 'var(--text)', fontSize: '13px', padding: '8px 10px',
                  borderRadius: '8px', outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="stroke_play">Stroke Play</option>
                <option value="stableford">Stableford</option>
                <option value="match_play">Match Play</option>
                <option value="best_ball">Best Ball</option>
                <option value="scramble">Scramble</option>
                <option value="foursome">Foursome</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-2)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Modo</span>
              <select
                value={effectiveModo}
                onChange={e => setModo(e.target.value as Modo)}
                disabled={modoForced}
                title={modoForced ? 'Stableford y Match Play usan neto por regla R&A/USGA' : undefined}
                style={{
                  background: modoForced ? 'rgba(14,28,47,0.5)' : 'var(--bg-surface)',
                  border: '1px solid rgba(196,153,42,0.25)',
                  color: modoForced ? 'var(--text-2)' : 'var(--text)', fontSize: '13px', padding: '8px 10px',
                  borderRadius: '8px', outline: 'none', cursor: modoForced ? 'not-allowed' : 'pointer',
                }}
              >
                <option value="gross">Gross</option>
                <option value="neto">Neto</option>
              </select>
            </label>
          </div>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            style={{
              width: '100%', padding: '16px', borderRadius: '14px',
              background: confirming ? 'rgba(196,153,42,0.4)' : 'linear-gradient(135deg, #c4992a, #e8c06a)',
              color: 'var(--brand-dark)', fontSize: '16px', fontWeight: 700,
              border: 'none',
              cursor: confirming ? 'wait' : 'pointer',
              minHeight: '52px',
              transition: 'all 0.2s ease',
            }}
          >
            {confirming ? 'Importando...' : `Importar ${acceptedCount} ${acceptedCount === 1 ? 'ronda' : 'rondas'} →`}
          </button>
        </div>
      )}
    </div>
  )
}
