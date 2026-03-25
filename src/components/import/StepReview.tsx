'use client'

import { useState, useCallback } from 'react'
import type { ImportRoundData } from '@/lib/import-types'
import type { ResultadoCPI } from '@/lib/cpi'
import type { ImportState } from './ImportWizard'

interface StepReviewProps {
  rounds: ImportRoundData[]
  jobId: string | null
  onBack: () => void
  onConfirm: (cpiResult: ResultadoCPI, insights: string[]) => void
  onStateUpdate: (partial: Partial<ImportState>) => void
}

export default function StepReview({
  rounds: initialRounds,
  jobId,
  onBack,
  onConfirm,
  onStateUpdate,
}: StepReviewProps) {
  const [rounds, setRounds] = useState<ImportRoundData[]>(initialRounds)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const readyRounds = rounds.filter(r => r.validation.valid && !excluded.has(r.tempId))
  const totalNonExcluded = rounds.filter(r => !excluded.has(r.tempId))

  const handleScoreChange = useCallback(
    (tempId: string, hole: string, value: number) => {
      setRounds(prev =>
        prev.map(r => {
          if (r.tempId !== tempId) return r
          const newScores = { ...r.scores, [hole]: value }
          const holeKeys = Object.keys(newScores)
            .map(Number)
            .filter(n => !isNaN(n))
          const sum = holeKeys.reduce((acc, h) => acc + (newScores[String(h)] || 0), 0)
          return {
            ...r,
            scores: newScores,
            total_gross: sum,
          }
        }),
      )
    },
    [],
  )

  const toggleExclude = useCallback((tempId: string) => {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(tempId)) next.delete(tempId)
      else next.add(tempId)
      return next
    })
  }, [])

  const toggleExpanded = useCallback((tempId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(tempId)) next.delete(tempId)
      else next.add(tempId)
      return next
    })
  }, [])

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const validRounds = rounds.filter(r => !excluded.has(r.tempId))
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, rounds: validRounds }),
      })

      if (!res.ok) {
        throw new Error('Error confirmando importacion')
      }

      const data = await res.json()
      onStateUpdate({ rounds: validRounds })
      onConfirm(data.cpiResult, data.insights || [])
    } catch (err) {
      console.error('Confirm error:', err)
      setConfirming(false)
    }
  }

  const getCardStatus = (round: ImportRoundData) => {
    const isExcluded = excluded.has(round.tempId)
    if (isExcluded) return 'excluded'
    const hasDuplicate = round.validation.issues.some(i => i.type === 'incomplete_round' && i.message.toLowerCase().includes('duplicad'))
    if (hasDuplicate) return 'duplicate'
    if (!round.validation.valid) return 'warning'
    return 'ready'
  }

  const statusConfig = {
    ready: {
      icon: '\u2705',
      borderColor: 'rgba(80,200,120,0.25)',
      bgColor: 'rgba(80,200,120,0.03)',
    },
    warning: {
      icon: '\u26A0\uFE0F',
      borderColor: 'rgba(255,180,50,0.25)',
      bgColor: 'rgba(255,180,50,0.03)',
    },
    duplicate: {
      icon: '\uD83D\uDD04',
      borderColor: 'rgba(59,130,246,0.25)',
      bgColor: 'rgba(59,130,246,0.03)',
    },
    excluded: {
      icon: '\u274C',
      borderColor: 'rgba(255,60,60,0.15)',
      bgColor: 'rgba(255,60,60,0.02)',
    },
  }

  return (
    <div style={{ paddingTop: '16px', paddingBottom: '100px' }}>
      <style>{`
        @keyframes reviewCardIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <button
          onClick={onBack}
          style={{
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            color: 'var(--text-2)',
            fontSize: '18px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          &larr;
        </button>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', margin: 0, fontFamily: 'var(--font-playfair)' }}>
            Revisar rondas
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: 0 }}>
            {readyRounds.length} de {totalNonExcluded.length} rondas listas
          </p>
        </div>
      </div>

      {/* Round cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {rounds.map((round, i) => {
          const status = getCardStatus(round)
          const config = statusConfig[status]
          const isExcluded = excluded.has(round.tempId)
          const isExpanded = expandedCards.has(round.tempId)
          const hasFixableIssues = round.validation.issues.some(iss => iss.canFix && iss.holeNumber)

          return (
            <div
              key={round.tempId}
              style={{
                background: config.bgColor,
                border: `1px solid ${config.borderColor}`,
                borderRadius: '16px',
                padding: '16px',
                opacity: isExcluded ? 0.5 : 1,
                transition: 'all 0.25s ease',
                animation: `reviewCardIn 0.4s ease-out ${i * 60}ms both`,
              }}
            >
              {/* Card top: status icon + info */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                {/* Status icon */}
                <span style={{ fontSize: '24px', flexShrink: 0, lineHeight: 1, marginTop: '2px' }}>
                  {config.icon}
                </span>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text)', marginBottom: '2px' }}>
                    {round.course_name || 'Campo desconocido'}
                  </div>
                  <div style={{ color: 'var(--text-2)', fontSize: '13px' }}>
                    {round.played_at} &middot; {round.holes_played} hoyos &middot; {round.total_gross} golpes
                  </div>

                  {/* Issues inline */}
                  {!isExcluded && round.validation.issues.length > 0 && (
                    <div style={{ marginTop: '6px' }}>
                      {round.validation.issues.map((issue, j) => (
                        <div
                          key={j}
                          style={{
                            fontSize: '12px',
                            color: issue.canFix ? '#f0ad4e' : '#ff6666',
                            lineHeight: 1.5,
                          }}
                        >
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Duplicate text */}
                  {status === 'duplicate' && !isExcluded && (
                    <div style={{ fontSize: '12px', color: '#60a5fa', marginTop: '4px' }}>
                      Ya existe en tu historial
                    </div>
                  )}
                </div>
              </div>

              {/* Actions row */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '12px',
                  flexWrap: 'wrap',
                }}
              >
                {/* Corregir button — only if fixable issues */}
                {!isExcluded && hasFixableIssues && (
                  <button
                    onClick={() => toggleExpanded(round.tempId)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: 'rgba(255,180,50,0.1)',
                      color: '#f0ad4e',
                      border: '1px solid rgba(255,180,50,0.2)',
                      cursor: 'pointer',
                      minHeight: '44px',
                      minWidth: '44px',
                    }}
                  >
                    {isExpanded ? 'Cerrar' : 'Corregir'}
                  </button>
                )}

                {/* Duplicate: Importar de todos modos */}
                {status === 'duplicate' && !isExcluded && (
                  <button
                    onClick={() => {/* already included by default */}}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: 'rgba(59,130,246,0.1)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59,130,246,0.2)',
                      cursor: 'pointer',
                      minHeight: '44px',
                      minWidth: '44px',
                    }}
                  >
                    Importar de todos modos
                  </button>
                )}

                {/* Excluir / Incluir */}
                <button
                  onClick={() => toggleExclude(round.tempId)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    background: isExcluded ? 'rgba(80,200,120,0.1)' : 'rgba(255,60,60,0.08)',
                    color: isExcluded ? '#50c878' : '#ff6666',
                    border: `1px solid ${isExcluded ? 'rgba(80,200,120,0.2)' : 'rgba(255,60,60,0.15)'}`,
                    cursor: 'pointer',
                    minHeight: '44px',
                    minWidth: '44px',
                  }}
                >
                  {isExcluded ? 'Incluir' : 'Excluir'}
                </button>
              </div>

              {/* Expandable score correction section */}
              {isExpanded && hasFixableIssues && !isExcluded && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '14px',
                    background: 'rgba(255,180,50,0.05)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,180,50,0.15)',
                  }}
                >
                  <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '10px' }}>
                    Corrige los scores faltantes:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {Array.from({ length: round.holes_played }, (_, idx) => idx + 1).map(holeNum => {
                      const holeKey = String(holeNum)
                      const hasIssue = round.validation.issues.some(
                        iss => iss.canFix && iss.holeNumber === holeNum,
                      )
                      return (
                        <div
                          key={holeNum}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <label
                            style={{
                              fontSize: '12px',
                              color: hasIssue ? '#f0ad4e' : 'var(--text-3, #5a6a7d)',
                              fontWeight: hasIssue ? 600 : 400,
                              minWidth: '28px',
                            }}
                          >
                            H{holeNum}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={15}
                            value={round.scores[holeKey] || ''}
                            onChange={e =>
                              handleScoreChange(
                                round.tempId,
                                holeKey,
                                parseInt(e.target.value) || 0,
                              )
                            }
                            style={{
                              width: '48px',
                              height: '40px',
                              background: hasIssue
                                ? 'rgba(255,180,50,0.1)'
                                : 'rgba(255,255,255,0.06)',
                              border: `1px solid ${
                                hasIssue
                                  ? 'rgba(255,180,50,0.35)'
                                  : 'rgba(255,255,255,0.1)'
                              }`,
                              borderRadius: '8px',
                              color: 'var(--text)',
                              textAlign: 'center',
                              fontSize: '14px',
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {rounds.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: 'var(--text-3, #5a6a7d)',
              fontSize: '14px',
            }}
          >
            No se detectaron rondas para revisar
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)',
          background: 'linear-gradient(to top, var(--bg, #070d18) 80%, transparent)',
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {/* Counter */}
        <span style={{ fontSize: '13px', color: 'var(--text-2)', fontWeight: 500 }}>
          {readyRounds.length} de {totalNonExcluded.length} rondas listas
        </span>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={confirming || readyRounds.length === 0}
          style={{
            width: '100%',
            maxWidth: '600px',
            padding: '16px',
            borderRadius: '14px',
            fontSize: '16px',
            fontWeight: 700,
            background:
              confirming || readyRounds.length === 0
                ? 'rgba(196,153,42,0.3)'
                : 'linear-gradient(135deg, #c4992a, #e8c06a)',
            color:
              confirming || readyRounds.length === 0
                ? 'rgba(255,255,255,0.5)'
                : '#070d18',
            border: 'none',
            cursor:
              confirming || readyRounds.length === 0
                ? 'not-allowed'
                : 'pointer',
            minHeight: '52px',
            transition: 'all 0.2s ease',
          }}
        >
          {confirming
            ? 'Confirmando...'
            : `Importar ${readyRounds.length} ronda${readyRounds.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
