'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
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
}

type SwipeDir = 'left' | 'right' | null
type CardDecision = 'accepted' | 'rejected'

// ── Validation: only 9 or 18 complete holes ──
function isComplete(round: ImportRoundData): boolean {
  const holes = round.holes_played || 0
  if (holes !== 9 && holes !== 18) return false
  const filledHoles = Object.values(round.scores).filter(v => typeof v === 'number' && v > 0).length
  return filledHoles === holes
}

function getConfidenceLevel(round: ImportRoundData): 'high' | 'medium' | 'low' | 'incomplete' {
  if (!isComplete(round)) return 'incomplete'
  const conf = round.import_confidence || 0
  const hasAmbiguous = (round.metadata?.ambiguous_holes?.length || 0) > 0
  if (conf >= 0.9 && !hasAmbiguous) return 'high'
  if (conf >= 0.7) return 'medium'
  return 'low'
}

export default function StepReview({
  rounds: initialRounds,
  jobId,
  onBack,
  onConfirm,
  onStateUpdate,
}: StepReviewProps) {
  const [rounds, setRounds] = useState<ImportRoundData[]>(initialRounds)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [decisions, setDecisions] = useState<Record<string, CardDecision>>({})
  const [swipeDir, setSwipeDir] = useState<SwipeDir>(null)
  const [showScorecard, setShowScorecard] = useState(false)
  const [phase, setPhase] = useState<'swipe' | 'summary' | 'confirming'>('swipe')
  const [editingHole, setEditingHole] = useState<{ tempId: string; hole: number } | null>(null)
  const [editValue, setEditValue] = useState('')

  const touchStart = useRef({ x: 0, y: 0 })
  const cardRef = useRef<HTMLDivElement>(null)
  const [dragX, setDragX] = useState(0)

  const currentRound = rounds[currentIdx] || null
  const totalCards = rounds.length
  const progress = totalCards > 0 ? ((currentIdx) / totalCards) * 100 : 0

  const accepted = Object.values(decisions).filter(d => d === 'accepted').length
  const rejected = Object.values(decisions).filter(d => d === 'rejected').length

  // Swipe handler
  const handleDecision = useCallback((dir: 'left' | 'right') => {
    if (!currentRound) return
    setSwipeDir(dir)
    setDecisions(prev => ({
      ...prev,
      [currentRound.tempId]: dir === 'right' ? 'accepted' : 'rejected',
    }))

    setTimeout(() => {
      setSwipeDir(null)
      setDragX(0)
      setShowScorecard(false)
      if (currentIdx + 1 >= totalCards) {
        setPhase('summary')
      } else {
        setCurrentIdx(prev => prev + 1)
      }
    }, 300)
  }, [currentRound, currentIdx, totalCards])

  // Touch events for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStart.current.x
    setDragX(dx)
  }
  const handleTouchEnd = () => {
    if (Math.abs(dragX) > 80) {
      handleDecision(dragX > 0 ? 'right' : 'left')
    } else {
      setDragX(0)
    }
  }

  // Score edit
  const handleScoreChange = useCallback((tempId: string, hole: string, value: number) => {
    setRounds(prev => prev.map(r => {
      if (r.tempId !== tempId) return r
      const newScores = { ...r.scores, [hole]: value }
      const sum = Object.values(newScores).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)
      return { ...r, scores: newScores, total_gross: sum }
    }))
    setEditingHole(null)
  }, [])

  // Confirm import
  const handleConfirm = async () => {
    setPhase('confirming')
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
      setPhase('summary')
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== 'swipe') return
      if (e.key === 'ArrowRight') handleDecision('right')
      else if (e.key === 'ArrowLeft') handleDecision('left')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleDecision])

  const confLevel = currentRound ? getConfidenceLevel(currentRound) : 'low'
  const parPerHole = (currentRound as unknown as { par_per_hole?: Record<string, number> })?.par_per_hole
  const getPar = (h: number) => parPerHole?.[String(h)] ?? 4

  // ── SWIPE PHASE ──
  if (phase === 'swipe' && currentRound) {
    const cardRotation = dragX * 0.05
    const cardOpacity = 1 - Math.abs(dragX) / 400
    const showAccept = dragX > 40
    const showReject = dragX < -40

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#070d18',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'DM Sans', sans-serif",
        overflow: 'hidden',
      }}>
        <style>{`
          @keyframes swipeRight { to { transform: translateX(120vw) rotate(20deg); opacity: 0; } }
          @keyframes swipeLeft { to { transform: translateX(-120vw) rotate(-20deg); opacity: 0; } }
          @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 20px rgba(196,153,42,0.3); } 50% { box-shadow: 0 0 40px rgba(196,153,42,0.6); } }
          @keyframes cardEnter { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        `}</style>

        {/* Top bar: exit + progress */}
        <div style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
          paddingTop: 'calc(12px + env(safe-area-inset-top))',
        }}>
          <button onClick={onBack} style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)', border: 'none',
            color: '#edeae4', fontSize: '18px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{'\u2715'}</button>
          <div style={{ flex: 1 }}>
            <div style={{
              height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
            }}>
              <div style={{
                width: `${progress}%`, height: '100%', borderRadius: '2px',
                background: 'linear-gradient(90deg, #c4992a, #e8c06a)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
          <span style={{ fontSize: '13px', color: '#94a8c0', fontWeight: 600, minWidth: '50px', textAlign: 'right' }}>
            {currentIdx + 1}/{totalCards}
          </span>
        </div>

        {/* Stats bar */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '24px',
          padding: '4px 16px 12px', fontSize: '13px',
        }}>
          <span style={{ color: '#50c878' }}>{'\u2705'} {accepted}</span>
          <span style={{ color: '#ff6666' }}>{'\u274C'} {rejected}</span>
        </div>

        {/* Swipe card area */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 20px', position: 'relative',
        }}>
          {/* Accept/reject indicators */}
          {showAccept && (
            <div style={{
              position: 'absolute', top: '50%', left: '20px', transform: 'translateY(-50%)',
              fontSize: '48px', opacity: Math.min(1, Math.abs(dragX) / 120),
            }}>{'\u2705'}</div>
          )}
          {showReject && (
            <div style={{
              position: 'absolute', top: '50%', right: '20px', transform: 'translateY(-50%)',
              fontSize: '48px', opacity: Math.min(1, Math.abs(dragX) / 120),
            }}>{'\u274C'}</div>
          )}

          {/* THE CARD */}
          <div
            ref={cardRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              width: '100%', maxWidth: '380px',
              background: '#0e1c2f',
              border: confLevel === 'high'
                ? '2px solid rgba(196,153,42,0.5)'
                : confLevel === 'incomplete'
                  ? '2px solid rgba(239,68,68,0.4)'
                  : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '24px',
              padding: '24px',
              transform: swipeDir === 'right'
                ? 'translateX(120vw) rotate(20deg)'
                : swipeDir === 'left'
                  ? 'translateX(-120vw) rotate(-20deg)'
                  : `translateX(${dragX}px) rotate(${cardRotation}deg)`,
              opacity: swipeDir ? 0 : cardOpacity,
              transition: swipeDir ? 'transform 0.3s ease, opacity 0.3s ease' : 'none',
              animation: !swipeDir ? 'cardEnter 0.25s ease-out' : 'none',
              boxShadow: confLevel === 'high' ? '0 0 30px rgba(196,153,42,0.2)' : '0 8px 32px rgba(0,0,0,0.4)',
              userSelect: 'none',
            }}
          >
            {/* Confidence badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              {confLevel === 'high' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(196,153,42,0.15)', padding: '6px 14px', borderRadius: '20px',
                  animation: 'pulseGlow 2s ease-in-out infinite',
                }}>
                  <span style={{ fontSize: '18px' }}>{'\u2705'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#c4992a', letterSpacing: '0.05em' }}>VERIFICADA</span>
                </div>
              )}
              {confLevel === 'medium' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(245,158,11,0.12)', padding: '6px 14px', borderRadius: '20px',
                }}>
                  <span style={{ fontSize: '16px' }}>{'\u26A0\uFE0F'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b' }}>REVISA LOS SCORES</span>
                </div>
              )}
              {confLevel === 'low' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(245,158,11,0.08)', padding: '6px 14px', borderRadius: '20px',
                }}>
                  <span style={{ fontSize: '16px' }}>{'\uD83D\uDD0D'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b' }}>BAJA CONFIANZA</span>
                </div>
              )}
              {confLevel === 'incomplete' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(239,68,68,0.12)', padding: '6px 14px', borderRadius: '20px',
                }}>
                  <span style={{ fontSize: '16px' }}>{'\u274C'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444' }}>INCOMPLETA</span>
                </div>
              )}

              <span style={{ fontSize: '12px', color: '#94a8c0' }}>
                {Math.round((currentRound.import_confidence || 0) * 100)}%
              </span>
            </div>

            {/* Club name — big */}
            <div style={{ marginBottom: '4px' }}>
              <h2 style={{
                fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 700,
                color: '#edeae4', margin: 0, lineHeight: 1.2,
              }}>
                {'\u26F3'} {currentRound.course_name || 'Campo desconocido'}
              </h2>
            </div>

            {/* Date + holes */}
            <div style={{ fontSize: '14px', color: '#94a8c0', marginBottom: '20px' }}>
              {currentRound.played_at} {'\u00B7'} {currentRound.holes_played} hoyos
            </div>

            {/* Score total — big PGA style */}
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: '8px',
              marginBottom: '20px',
            }}>
              <span style={{
                fontFamily: "'Playfair Display', serif", fontSize: '56px', fontWeight: 700,
                color: '#c4992a', lineHeight: 1,
              }}>
                {currentRound.total_gross}
              </span>
              <span style={{ fontSize: '20px', color: '#94a8c0', fontWeight: 600 }}>
                golpes
              </span>
            </div>

            {/* Mini scorecard — always visible */}
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '14px',
              padding: '12px', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {[0, 9].map(startIdx => {
                const endIdx = Math.min(startIdx + 9, currentRound.holes_played)
                if (startIdx >= currentRound.holes_played) return null
                let rowTotal = 0

                return (
                  <div key={startIdx} style={{ marginBottom: startIdx === 0 && currentRound.holes_played > 9 ? '8px' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, display: 'flex' }}>
                        {Array.from({ length: endIdx - startIdx }, (_, j) => {
                          const h = startIdx + j + 1
                          const score = currentRound.scores[String(h)]
                          const par = getPar(h)
                          const isAmb = currentRound.metadata?.ambiguous_holes?.includes(h)
                          if (typeof score === 'number') rowTotal += score

                          return (
                            <div key={h} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                              <div style={{ fontSize: '8px', color: '#5a7494', marginBottom: '2px' }}>{h}</div>
                              <div
                                style={{
                                  minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', position: 'relative',
                                }}
                                onClick={() => {
                                  setEditingHole({ tempId: currentRound.tempId, hole: h })
                                  setEditValue(score != null ? String(score) : '')
                                }}
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
              })}

              {currentRound.metadata?.ambiguous_holes && currentRound.metadata.ambiguous_holes.length > 0 && (
                <div style={{ fontSize: '10px', color: '#60a5fa', marginTop: '6px', textAlign: 'center' }}>
                  Hoyos con punto azul fueron estimados — toca para corregir
                </div>
              )}
            </div>

            {/* Incomplete warning */}
            {confLevel === 'incomplete' && (
              <div style={{
                marginTop: '12px', padding: '10px', borderRadius: '10px',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                fontSize: '13px', color: '#ff6666', textAlign: 'center',
              }}>
                Solo {Object.values(currentRound.scores).filter(v => typeof v === 'number' && v > 0).length} de {currentRound.holes_played} hoyos completados — desliza a la izquierda para descartar
              </div>
            )}
          </div>

          {/* Score edit modal */}
          {editingHole && editingHole.tempId === currentRound.tempId && (
            <div style={{
              position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
              background: '#1a2a3f', borderRadius: '16px', padding: '16px 24px',
              border: '1px solid rgba(196,153,42,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', gap: '12px', zIndex: 10,
            }}>
              <span style={{ fontSize: '13px', color: '#94a8c0' }}>Hoyo {editingHole.hole}:</span>
              <input
                autoFocus
                type="number"
                min={1}
                max={15}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = parseInt(editValue)
                    if (val >= 1 && val <= 15) handleScoreChange(editingHole.tempId, String(editingHole.hole), val)
                  }
                  if (e.key === 'Escape') setEditingHole(null)
                }}
                style={{
                  width: '60px', textAlign: 'center', padding: '8px',
                  fontSize: '18px', fontWeight: 700, borderRadius: '10px',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(196,153,42,0.3)',
                  color: '#edeae4', outline: 'none',
                }}
              />
              <button
                onClick={() => {
                  const val = parseInt(editValue)
                  if (val >= 1 && val <= 15) handleScoreChange(editingHole.tempId, String(editingHole.hole), val)
                }}
                style={{
                  padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  background: '#c4992a', color: '#070d18', border: 'none', cursor: 'pointer',
                }}
              >OK</button>
            </div>
          )}
        </div>

        {/* Bottom: swipe buttons */}
        <div style={{
          padding: '16px 24px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          display: 'flex', justifyContent: 'center', gap: '32px', alignItems: 'center',
        }}>
          <button
            onClick={() => handleDecision('left')}
            style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.3)',
              color: '#ef4444', fontSize: '28px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.15s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          >{'\u2715'}</button>

          <button
            onClick={() => handleDecision('right')}
            style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.3)',
              color: '#22c55e', fontSize: '28px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.15s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          >{'\u2714'}</button>
        </div>
      </div>
    )
  }

  // ── SUMMARY PHASE ──
  if (phase === 'summary' || phase === 'confirming') {
    const acceptedRounds = rounds.filter(r => decisions[r.tempId] === 'accepted')
    const rejectedRounds = rounds.filter(r => decisions[r.tempId] === 'rejected')

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#070d18',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", padding: '24px',
        paddingTop: 'calc(24px + env(safe-area-inset-top))',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{'\u26F3'}</div>
        <h2 style={{
          fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 700,
          color: '#edeae4', margin: '0 0 8px', textAlign: 'center',
        }}>
          Revision completa
        </h2>
        <p style={{ color: '#94a8c0', fontSize: '15px', marginBottom: '32px', textAlign: 'center' }}>
          {acceptedRounds.length} tarjetas aceptadas, {rejectedRounds.length} descartadas
        </p>

        {/* Summary cards */}
        <div style={{ width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          {acceptedRounds.length > 0 && (
            <div style={{
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: '14px', padding: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '20px' }}>{'\u2705'}</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#50c878' }}>
                  {acceptedRounds.length} rondas para importar
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#94a8c0', lineHeight: 1.6 }}>
                {acceptedRounds.slice(0, 3).map(r => (
                  <div key={r.tempId}>{r.course_name} — {r.total_gross} ({r.played_at})</div>
                ))}
                {acceptedRounds.length > 3 && (
                  <div style={{ color: '#5a7494' }}>y {acceptedRounds.length - 3} mas...</div>
                )}
              </div>
            </div>
          )}

          {rejectedRounds.length > 0 && (
            <div style={{
              background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: '14px', padding: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>{'\u274C'}</span>
                <span style={{ fontSize: '13px', color: '#ff6666' }}>
                  {rejectedRounds.length} descartadas
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {acceptedRounds.length > 0 && (
            <button
              onClick={handleConfirm}
              disabled={phase === 'confirming'}
              style={{
                width: '100%', padding: '16px', borderRadius: '14px',
                background: phase === 'confirming' ? 'rgba(196,153,42,0.4)' : 'linear-gradient(135deg, #c4992a, #e8c06a)',
                color: '#070d18', fontSize: '16px', fontWeight: 700,
                border: 'none', cursor: phase === 'confirming' ? 'wait' : 'pointer',
                minHeight: '52px',
              }}
            >
              {phase === 'confirming' ? 'Importando...' : `Importar ${acceptedRounds.length} rondas`}
            </button>
          )}

          <button
            onClick={onBack}
            style={{
              width: '100%', padding: '14px', borderRadius: '14px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a8c0', fontSize: '14px', cursor: 'pointer',
              minHeight: '48px',
            }}
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  // Fallback
  return null
}
