'use client'

import { useState, useCallback } from 'react'
import type { ImportRoundData } from '@/lib/import-types'
import type { ResultadoCPI } from '@/golf/stats/cpi'
import type { ImportState } from './ImportWizard'
import ScoreSymbol from '@/components/ScoreSymbol'

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
      const acceptedRounds = rounds.filter(r => decisions[r.tempId] === 'accepted')
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
                          fontSize: '13px', fontWeight: 700, color: '#edeae4',
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
      background: '#070d18',
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
            color: '#edeae4', fontSize: '18px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>{'←'}</button>
          <div style={{ flex: 1 }}>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '20px', fontWeight: 700, color: '#edeae4',
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

            return (
              <div
                key={round.tempId}
                style={{
                  background: isRejected ? 'rgba(255,255,255,0.02)' : '#0e1c2f',
                  border: isRejected ? '1px solid rgba(255,255,255,0.06)' : getCardBorder(level, status),
                  borderRadius: '16px',
                  padding: '20px',
                  opacity: isRejected ? 0.5 : 1,
                  transition: 'all 0.3s ease',
                  boxShadow: getCardShadow(level, status),
                  animation: `reviewCardEnter 0.4s ease-out ${idx * 0.05}s both`,
                }}
              >
                {/* Status row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: isRejected ? 'rgba(255,255,255,0.03)' : statusLabel.bg,
                    padding: '4px 10px', borderRadius: '10px',
                  }}>
                    {!isRejected && isGarmin && <span style={{ fontSize: '12px' }}>{'��'}</span>}
                    {!isRejected && level === 'high' && <span style={{ fontSize: '12px' }}>{'✅'}</span>}
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      color: isRejected ? '#5a7494' : statusLabel.color,
                      letterSpacing: '0.05em',
                    }}>
                      {isRejected ? 'DESCARTADA' : statusLabel.text}
                    </span>
                  </div>
                  {!isGarmin && (
                    <span style={{ fontSize: '11px', color: '#3d5570' }}>
                      {Math.round((round.import_confidence || 0) * 100)}%
                    </span>
                  )}
                </div>

                {/* Club name */}
                <h3 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '18px', fontWeight: 700,
                  color: isRejected ? '#5a7494' : '#edeae4',
                  margin: '0 0 4px', lineHeight: 1.2,
                }}>
                  {'⛳'} {round.course_name || 'Campo desconocido'}
                </h3>

                {/* Date + holes */}
                <div style={{ fontSize: '13px', color: '#94a8c0', marginBottom: '16px' }}>
                  {round.played_at} {'·'} {round.holes_played} hoyos
                </div>

                {/* Score total */}
                {!isRejected && (
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: '6px',
                    marginBottom: '16px',
                  }}>
                    <span style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: '32px', fontWeight: 700,
                      color: isRejected ? '#5a7494' : '#c4992a',
                      lineHeight: 1,
                    }}>
                      {round.total_gross}
                    </span>
                    <span style={{ fontSize: '14px', color: '#94a8c0', fontWeight: 500 }}>
                      golpes
                    </span>
                  </div>
                )}

                {/* Expand button for scorecard */}
                {!isRejected && (
                  <button
                    onClick={() => toggleExpand(round.tempId)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#94a8c0', fontSize: '13px', fontWeight: 500,
                      padding: '6px 0', marginBottom: isExpanded ? '12px' : '16px',
                      minHeight: '44px',
                    }}
                  >
                    {isExpanded ? 'Ocultar scorecard' : 'Ver scorecard'}
                    <span style={{
                      display: 'inline-block',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      fontSize: '10px',
                    }}>{'▼'}</span>
                  </button>
                )}

                {/* Expanded scorecard */}
                {!isRejected && isExpanded && (
                  <div style={{
                    background: '#111827',
                    borderRadius: '12px',
                    padding: '14px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    marginBottom: '16px',
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
                        color: '#94a8c0',
                        textAlign: 'center',
                        fontWeight: 500,
                      }}>
                        {garminStats}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons — clean text links */}
                {!isRejected && (
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
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

                {/* Rejected — restore button */}
                {isRejected && (
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
          background: 'linear-gradient(to top, #070d18 60%, transparent)',
        }}>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            style={{
              width: '100%', padding: '16px', borderRadius: '14px',
              background: confirming ? 'rgba(196,153,42,0.4)' : 'linear-gradient(135deg, #c4992a, #e8c06a)',
              color: '#070d18', fontSize: '16px', fontWeight: 700,
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
