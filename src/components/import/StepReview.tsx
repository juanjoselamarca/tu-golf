'use client'

import { useState, useCallback, useRef } from 'react'
import type { ImportRoundData } from '@/lib/import-types'
import type { ResultadoCPI } from '@/lib/cpi'
import type { ImportState } from './ImportWizard'
import ScoreSymbol from '@/components/ScoreSymbol'

interface StepReviewProps {
  rounds: ImportRoundData[]
  jobId: string | null
  onBack: () => void
  onConfirm: (cpiResult: ResultadoCPI, insights: string[]) => void
  onStateUpdate: (partial: Partial<ImportState>) => void
  isAssisted?: boolean
}

type CardStatus = 'accepted' | 'rejected'
type ConfidenceLevel = 'high' | 'medium' | 'low' | 'incomplete'

// ── Validation helpers ──
function isComplete(round: ImportRoundData): boolean {
  const holes = round.holes_played || 0
  if (holes !== 9 && holes !== 18) return false
  const filledHoles = Object.values(round.scores).filter(v => typeof v === 'number' && v > 0).length
  return filledHoles === holes
}

function getConfidenceLevel(round: ImportRoundData): ConfidenceLevel {
  if (!isComplete(round)) return 'incomplete'
  const conf = round.import_confidence || 0
  const hasAmbiguous = (round.metadata?.ambiguous_holes?.length || 0) > 0
  if (conf >= 0.9 && !hasAmbiguous) return 'high'
  if (conf >= 0.7) return 'medium'
  return 'low'
}

function getStatusLabel(level: ConfidenceLevel): { text: string; color: string; bg: string } {
  switch (level) {
    case 'high': return { text: 'VERIFICADA', color: '#c4992a', bg: 'rgba(196,153,42,0.15)' }
    case 'medium': return { text: 'REVISAR', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
    case 'low': return { text: 'REVISAR', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' }
    case 'incomplete': return { text: 'INCOMPLETA', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
  }
}

function getCardBorder(level: ConfidenceLevel, status: CardStatus | undefined): string {
  if (status === 'rejected') return '1px solid rgba(255,255,255,0.06)'
  switch (level) {
    case 'high': return '1px solid rgba(196,153,42,0.3)'
    case 'medium': return '1px solid rgba(245,158,11,0.3)'
    case 'low': return '1px solid rgba(245,158,11,0.2)'
    case 'incomplete': return '1px solid rgba(239,68,68,0.3)'
  }
}

function getCardShadow(level: ConfidenceLevel, status: CardStatus | undefined): string {
  if (status === 'rejected') return 'none'
  if (level === 'high') return '0 0 20px rgba(196,153,42,0.12)'
  return 'none'
}

export default function StepReview({
  rounds: initialRounds,
  jobId,
  onBack,
  onConfirm,
  onStateUpdate,
  isAssisted = false,
}: StepReviewProps) {
  const [rounds, setRounds] = useState<ImportRoundData[]>(initialRounds)
  const [decisions, setDecisions] = useState<Record<string, CardStatus>>(() => {
    // Auto-accept all verified rounds by default
    const initial: Record<string, CardStatus> = {}
    initialRounds.forEach(r => {
      const level = getConfidenceLevel(r)
      if (level === 'high' || level === 'medium' || level === 'low') {
        initial[r.tempId] = 'accepted'
      } else if (isAssisted) {
        // In assisted mode, start all as accepted (user will fill scores)
        initial[r.tempId] = 'accepted'
      } else {
        initial[r.tempId] = 'accepted'
      }
    })
    return initial
  })
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState(false)

  // For assisted mode: track per-round manual scores
  const [assistedScores, setAssistedScores] = useState<Record<string, Record<string, string>>>(() => {
    const initial: Record<string, Record<string, string>> = {}
    if (isAssisted) {
      initialRounds.forEach(r => {
        initial[r.tempId] = {}
      })
    }
    return initial
  })

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const parPerHoleMap = (round: ImportRoundData) =>
    (round as unknown as { par_per_hole?: Record<string, number> })?.par_per_hole
  const getPar = (round: ImportRoundData, h: number) => parPerHoleMap(round)?.[String(h)] ?? 4

  // Count stats
  const acceptedCount = Object.values(decisions).filter(d => d === 'accepted').length
  const rejectedCount = Object.values(decisions).filter(d => d === 'rejected').length

  // Summary pill counts
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
    // Collapse if rejecting
    if (status === 'rejected') {
      setExpandedCards(prev => ({ ...prev, [tempId]: false }))
    }
  }, [])

  // Score edit (standard mode — tap to edit via prompt)
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

  // Assisted mode: handle score input
  const handleAssistedInput = useCallback((tempId: string, hole: number, value: string) => {
    setAssistedScores(prev => ({
      ...prev,
      [tempId]: { ...(prev[tempId] || {}), [String(hole)]: value },
    }))

    // Update actual round scores
    const numVal = parseInt(value)
    if (!isNaN(numVal) && numVal >= 1 && numVal <= 15) {
      setRounds(prev => prev.map(r => {
        if (r.tempId !== tempId) return r
        const newScores = { ...r.scores, [String(hole)]: numVal }
        const sum = Object.values(newScores).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)
        return { ...r, scores: newScores, total_gross: sum }
      }))
    }
  }, [])

  // Auto-advance to next input on valid entry
  const handleAssistedKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    tempId: string,
    hole: number,
    totalHoles: number,
  ) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const nextHole = hole + 1
      if (nextHole <= totalHoles) {
        const nextRef = inputRefs.current[`${tempId}-${nextHole}`]
        nextRef?.focus()
      }
    }
  }, [])

  // Calculate assisted mode total for a round
  const getAssistedTotal = useCallback((round: ImportRoundData): number => {
    let sum = 0
    for (let h = 1; h <= round.holes_played; h++) {
      const val = round.scores[String(h)]
      if (typeof val === 'number') sum += val
    }
    return sum
  }, [])

  const getAssistedFilledCount = useCallback((round: ImportRoundData): number => {
    let count = 0
    for (let h = 1; h <= round.holes_played; h++) {
      const val = round.scores[String(h)]
      if (typeof val === 'number' && val > 0) count++
    }
    return count
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

    return (
      <div key={startIdx} style={{ marginBottom: startIdx === 0 && round.holes_played > 9 ? '8px' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, display: 'flex' }}>
            {Array.from({ length: endIdx - startIdx }, (_, j) => {
              const h = startIdx + j + 1
              const score = round.scores[String(h)]
              const par = getPar(round, h)
              const isAmb = round.metadata?.ambiguous_holes?.includes(h)
              if (typeof score === 'number') rowTotal += score

              return (
                <div key={h} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                  <div style={{ fontSize: '8px', color: '#5a7494', marginBottom: '2px' }}>{h}</div>
                  <div
                    style={{
                      minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', position: 'relative',
                    }}
                    onClick={() => handleScoreEdit(round.tempId, h, typeof score === 'number' ? score : undefined)}
                  >
                    {score != null ? (
                      <ScoreSymbol score={score} par={par} size="sm" theme="dark" />
                    ) : (
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '4px',
                        border: '1px dashed rgba(255,255,255,0.2)',
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
            minWidth: '32px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.08)',
            paddingLeft: '6px', marginLeft: '4px',
          }}>
            <div style={{ fontSize: '8px', color: '#5a7494', marginBottom: '2px' }}>{startIdx === 0 ? 'OUT' : 'IN'}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#c4992a' }}>{rowTotal}</div>
          </div>
        </div>
      </div>
    )
  }

  // ── Render assisted mode scorecard row ──
  const renderAssistedRow = (round: ImportRoundData, startIdx: number) => {
    const endIdx = Math.min(startIdx + 9, round.holes_played)
    if (startIdx >= round.holes_played) return null
    let rowTotal = 0

    return (
      <div key={startIdx} style={{ marginBottom: startIdx === 0 && round.holes_played > 9 ? '10px' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, display: 'flex', gap: '3px' }}>
            {Array.from({ length: endIdx - startIdx }, (_, j) => {
              const h = startIdx + j + 1
              const score = round.scores[String(h)]
              const inputVal = assistedScores[round.tempId]?.[String(h)] ?? (typeof score === 'number' ? String(score) : '')
              if (typeof score === 'number') rowTotal += score

              return (
                <div key={h} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                  <div style={{ fontSize: '8px', color: '#5a7494', marginBottom: '2px' }}>{h}</div>
                  <input
                    ref={el => { inputRefs.current[`${round.tempId}-${h}`] = el }}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={15}
                    value={inputVal}
                    onChange={e => handleAssistedInput(round.tempId, h, e.target.value)}
                    onKeyDown={e => handleAssistedKeyDown(e, round.tempId, h, round.holes_played)}
                    style={{
                      width: '100%',
                      maxWidth: '32px',
                      height: '32px',
                      textAlign: 'center',
                      fontSize: '13px',
                      fontWeight: 700,
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#edeae4',
                      outline: 'none',
                      padding: 0,
                      margin: '0 auto',
                      display: 'block',
                      MozAppearance: 'textfield',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = 'rgba(196,153,42,0.6)'
                      e.currentTarget.style.background = 'rgba(196,153,42,0.08)'
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }}
                  />
                </div>
              )
            })}
          </div>
          <div style={{
            minWidth: '32px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.08)',
            paddingLeft: '6px', marginLeft: '4px',
          }}>
            <div style={{ fontSize: '8px', color: '#5a7494', marginBottom: '2px' }}>{startIdx === 0 ? 'OUT' : 'IN'}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#c4992a' }}>{rowTotal}</div>
          </div>
        </div>
      </div>
    )
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
        /* Hide number input spinners */
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
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
          }}>{'\u2190'}</button>
          <div style={{ flex: 1 }}>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '20px', fontWeight: 700, color: '#edeae4',
              margin: 0, lineHeight: 1.2,
            }}>
              Revisar {rounds.length} rondas
            </h2>
          </div>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {verifiedCount > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(34,197,94,0.12)', color: '#50c878',
              border: '1px solid rgba(34,197,94,0.2)',
            }}>
              {verifiedCount} {verifiedCount === 1 ? 'lista' : 'listas'}
            </span>
          )}
          {(reviewCount > 0 || (isAssisted && incompleteCount > 0)) && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.2)',
            }}>
              {isAssisted ? reviewCount + incompleteCount : reviewCount} revisar
            </span>
          )}
          {!isAssisted && incompleteCount > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(239,68,68,0.12)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              {incompleteCount} {incompleteCount === 1 ? 'incompleta' : 'incompletas'}
            </span>
          )}
          {rejectedCount > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(255,255,255,0.04)', color: '#5a7494',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {rejectedCount} descartadas
            </span>
          )}
        </div>
      </div>

      {/* ── Card list (scrollable) ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 16px',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '100px' }}>
          {rounds.map((round, idx) => {
            const level = isAssisted ? (getAssistedFilledCount(round) === round.holes_played ? 'high' : 'incomplete') : getConfidenceLevel(round)
            const status = decisions[round.tempId]
            const isRejected = status === 'rejected'
            const isExpanded = expandedCards[round.tempId] || false
            const statusLabel = isAssisted
              ? (getAssistedFilledCount(round) === round.holes_played
                ? { text: 'COMPLETA', color: '#50c878', bg: 'rgba(34,197,94,0.12)' }
                : { text: 'PENDIENTE', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' })
              : getStatusLabel(level)

            // For assisted mode — total matching check
            const assistedTotal = isAssisted ? getAssistedTotal(round) : 0
            const detectedTotal = round.total_gross
            const assistedFilled = isAssisted ? getAssistedFilledCount(round) : 0
            // The original detected total (before we override it)
            const originalTotal = initialRounds.find(r => r.tempId === round.tempId)?.total_gross ?? round.total_gross
            const totalMatches = isAssisted && assistedFilled === round.holes_played && assistedTotal === originalTotal

            return (
              <div
                key={round.tempId}
                style={{
                  background: isRejected ? 'rgba(255,255,255,0.02)' : '#0e1c2f',
                  border: isRejected ? '1px solid rgba(255,255,255,0.06)' : getCardBorder(level, status),
                  borderRadius: '16px',
                  padding: '16px',
                  opacity: isRejected ? 0.5 : 1,
                  transition: 'all 0.3s ease',
                  boxShadow: getCardShadow(level, status),
                  animation: `reviewCardEnter 0.4s ease-out ${idx * 0.05}s both`,
                }}
              >
                {/* Status row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: isRejected ? 'rgba(255,255,255,0.04)' : statusLabel.bg,
                    padding: '4px 10px', borderRadius: '10px',
                  }}>
                    {!isRejected && level === 'high' && !isAssisted && <span style={{ fontSize: '13px' }}>{'\u2705'}</span>}
                    {!isRejected && isAssisted && totalMatches && <span style={{ fontSize: '13px' }}>{'\u2705'}</span>}
                    <span style={{
                      fontSize: '11px', fontWeight: 700,
                      color: isRejected ? '#5a7494' : statusLabel.color,
                      letterSpacing: '0.03em',
                    }}>
                      {isRejected ? 'DESCARTADA' : statusLabel.text}
                    </span>
                  </div>
                  {!isAssisted && (
                    <span style={{ fontSize: '12px', color: '#5a7494' }}>
                      {Math.round((round.import_confidence || 0) * 100)}%
                    </span>
                  )}
                  {isAssisted && (
                    <span style={{ fontSize: '12px', color: '#5a7494' }}>
                      {assistedFilled}/{round.holes_played} hoyos
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
                  {'\u26F3'} {round.course_name || 'Campo desconocido'}
                </h3>

                {/* Date + holes */}
                <div style={{ fontSize: '13px', color: '#94a8c0', marginBottom: '12px' }}>
                  {round.played_at} {'\u00B7'} {round.holes_played} hoyos
                </div>

                {/* Score total */}
                {!isRejected && (
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: '6px',
                    marginBottom: '12px',
                  }}>
                    <span style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: '32px', fontWeight: 700,
                      color: isRejected ? '#5a7494' : '#c4992a',
                      lineHeight: 1,
                    }}>
                      {isAssisted ? (assistedFilled > 0 ? assistedTotal : originalTotal) : round.total_gross}
                    </span>
                    <span style={{ fontSize: '14px', color: '#94a8c0', fontWeight: 500 }}>
                      golpes
                    </span>
                    {isAssisted && totalMatches && (
                      <span style={{ fontSize: '16px', marginLeft: '4px' }}>{'\u2705'}</span>
                    )}
                  </div>
                )}

                {/* Assisted mode: total mismatch warning */}
                {isAssisted && !isRejected && assistedFilled === round.holes_played && !totalMatches && (
                  <div style={{
                    padding: '8px 12px', borderRadius: '10px',
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                    fontSize: '12px', color: '#f59e0b', marginBottom: '12px',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    {'\u26A0\uFE0F'} Total no coincide (esperado: {originalTotal}, actual: {assistedTotal})
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
                      padding: '6px 0', marginBottom: isExpanded ? '12px' : '12px',
                      minHeight: '44px',
                    }}
                  >
                    {isExpanded ? 'Ocultar scorecard' : 'Ver scorecard'}
                    <span style={{
                      display: 'inline-block',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      fontSize: '10px',
                    }}>{'\u25BC'}</span>
                  </button>
                )}

                {/* Expanded scorecard */}
                {!isRejected && isExpanded && (
                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '12px',
                    padding: '12px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    marginBottom: '12px',
                    overflow: 'hidden',
                    transition: 'max-height 0.3s ease',
                  }}>
                    {isAssisted ? (
                      <>
                        {[0, 9].map(startIdx => renderAssistedRow(round, startIdx))}
                      </>
                    ) : (
                      <>
                        {[0, 9].map(startIdx => renderScorecardRow(round, startIdx))}
                        {round.metadata?.ambiguous_holes && round.metadata.ambiguous_holes.length > 0 && (
                          <div style={{ fontSize: '10px', color: '#60a5fa', marginTop: '6px', textAlign: 'center' }}>
                            Hoyos con punto azul fueron estimados — toca para corregir
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                {!isRejected && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {decisions[round.tempId] === 'accepted' ? (
                      <>
                        <div style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          gap: '6px', padding: '10px',
                          background: 'rgba(34,197,94,0.08)',
                          border: '1px solid rgba(34,197,94,0.2)',
                          borderRadius: '10px',
                          color: '#50c878', fontSize: '13px', fontWeight: 600,
                          minHeight: '44px',
                        }}>
                          {'\u2714'} Aceptada
                        </div>
                        <button
                          onClick={() => handleDecision(round.tempId, 'rejected')}
                          style={{
                            padding: '10px 16px', borderRadius: '10px',
                            background: 'transparent',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#ef4444', fontSize: '13px', fontWeight: 600,
                            cursor: 'pointer', minHeight: '44px',
                          }}
                        >
                          {'\u2715'} Descartar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleDecision(round.tempId, 'accepted')}
                        style={{
                          flex: 1, padding: '10px',
                          background: 'rgba(34,197,94,0.12)',
                          border: '1px solid rgba(34,197,94,0.3)',
                          borderRadius: '10px',
                          color: '#50c878', fontSize: '13px', fontWeight: 600,
                          cursor: 'pointer', minHeight: '44px',
                        }}
                      >
                        {'\u2714'} Aceptar
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
            {confirming ? 'Importando...' : `Importar ${acceptedCount} ${acceptedCount === 1 ? 'ronda' : 'rondas'} \u2192`}
          </button>
        </div>
      )}
    </div>
  )
}
