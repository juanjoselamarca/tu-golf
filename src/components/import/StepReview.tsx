'use client'

import { useState, useCallback } from 'react'
import type { ImportRoundData } from '@/lib/import-types'
import type { ResultadoCPI } from '@/lib/cpi'
import type { ImportState } from './ImportWizard'

type TabKey = 'all' | 'ready' | 'review' | 'excluded'

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
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const readyRounds = rounds.filter(r => r.validation.valid && !excluded.has(r.tempId))
  const reviewRounds = rounds.filter(
    r => !r.validation.valid && !excluded.has(r.tempId),
  )
  const excludedRounds = rounds.filter(r => excluded.has(r.tempId))

  const filteredRounds =
    activeTab === 'ready'
      ? readyRounds
      : activeTab === 'review'
        ? reviewRounds
        : activeTab === 'excluded'
          ? excludedRounds
          : rounds

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'all', label: 'Todas', count: rounds.length },
    { key: 'ready', label: 'Listas', count: readyRounds.length },
    { key: 'review', label: 'Revisar', count: reviewRounds.length },
    { key: 'excluded', label: 'Excluidas', count: excludedRounds.length },
  ]

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

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const validRounds = rounds.filter(
        r => !excluded.has(r.tempId),
      )
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, rounds: validRounds }),
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

  return (
    <div style={{ paddingTop: '16px' }}>
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
            color: '#94a8c0',
            fontSize: '18px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          &larr;
        </button>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#edeae4', margin: 0 }}>
            Revisar rondas
          </h2>
          <p style={{ color: '#94a8c0', fontSize: '13px', margin: 0 }}>
            {readyRounds.length} listas, {reviewRounds.length} para revisar
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          overflowX: 'auto',
          paddingBottom: '4px',
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: activeTab === tab.key ? 600 : 400,
              background:
                activeTab === tab.key ? '#c4992a' : 'rgba(255,255,255,0.05)',
              color: activeTab === tab.key ? '#070d18' : '#94a8c0',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              minHeight: '44px',
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Round cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        {filteredRounds.map(round => {
          const isExcluded = excluded.has(round.tempId)
          return (
            <div
              key={round.tempId}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${
                  isExcluded
                    ? 'rgba(255,60,60,0.2)'
                    : round.validation.valid
                      ? 'rgba(80,200,120,0.2)'
                      : 'rgba(255,180,50,0.2)'
                }`,
                borderRadius: '16px',
                padding: '16px',
                opacity: isExcluded ? 0.5 : 1,
              }}
            >
              {/* Round header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#edeae4' }}>
                    {round.course_name || 'Campo desconocido'}
                  </div>
                  <div style={{ color: '#94a8c0', fontSize: '12px' }}>
                    {round.played_at} &middot; {round.holes_played} hoyos &middot;{' '}
                    {round.total_gross} golpes
                  </div>
                </div>
                <button
                  onClick={() => toggleExclude(round.tempId)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    background: isExcluded
                      ? 'rgba(80,200,120,0.1)'
                      : 'rgba(255,60,60,0.1)',
                    color: isExcluded ? '#50c878' : '#ff6666',
                    border: 'none',
                    cursor: 'pointer',
                    minHeight: '44px',
                    minWidth: '44px',
                  }}
                >
                  {isExcluded ? 'Incluir' : 'Excluir'}
                </button>
              </div>

              {/* Issues */}
              {round.validation.issues.length > 0 && !isExcluded && (
                <div style={{ marginBottom: '12px' }}>
                  {round.validation.issues.map((issue, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 0',
                        fontSize: '12px',
                        color: issue.canFix ? '#f0ad4e' : '#ff6666',
                      }}
                    >
                      <span>{issue.canFix ? '\u26A0\uFE0F' : '\u274C'}</span>
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline score fixing for fixable issues */}
              {!isExcluded &&
                round.validation.issues.some(i => i.canFix && i.holeNumber) && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      padding: '12px',
                      background: 'rgba(255,180,50,0.05)',
                      borderRadius: '10px',
                    }}
                  >
                    {round.validation.issues
                      .filter(i => i.canFix && i.holeNumber)
                      .map(issue => (
                        <div
                          key={issue.holeNumber}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <label
                            style={{ fontSize: '12px', color: '#94a8c0' }}
                          >
                            H{issue.holeNumber}:
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={15}
                            value={
                              round.scores[String(issue.holeNumber)] || ''
                            }
                            onChange={e =>
                              handleScoreChange(
                                round.tempId,
                                String(issue.holeNumber),
                                parseInt(e.target.value) || 0,
                              )
                            }
                            style={{
                              width: '48px',
                              height: '36px',
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,180,50,0.3)',
                              borderRadius: '8px',
                              color: '#edeae4',
                              textAlign: 'center',
                              fontSize: '14px',
                            }}
                          />
                        </div>
                      ))}
                  </div>
                )}

              {/* Confidence */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '8px',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: '3px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '2px',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${round.import_confidence * 100}%`,
                      background:
                        round.import_confidence > 0.8
                          ? '#50c878'
                          : round.import_confidence > 0.5
                            ? '#f0ad4e'
                            : '#ff6666',
                      borderRadius: '2px',
                    }}
                  />
                </div>
                <span style={{ fontSize: '11px', color: '#5a6a7d' }}>
                  {Math.round(round.import_confidence * 100)}% confianza
                </span>
              </div>
            </div>
          )
        })}

        {filteredRounds.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#5a6a7d',
              fontSize: '14px',
            }}
          >
            No hay rondas en esta categoria
          </div>
        )}
      </div>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        disabled={confirming || readyRounds.length === 0}
        style={{
          width: '100%',
          padding: '16px',
          borderRadius: '14px',
          fontSize: '16px',
          fontWeight: 700,
          background:
            confirming || readyRounds.length === 0
              ? 'rgba(196,153,42,0.3)'
              : '#c4992a',
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
        }}
      >
        {confirming
          ? 'Confirmando...'
          : `Importar ${readyRounds.length} ronda${readyRounds.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}
