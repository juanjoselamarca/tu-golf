'use client'

// Scorer del organizador — orquestador delgado (regla "el que toca, ordena").
//   - Datos:   src/lib/data/tournaments/scoring.ts (cero supabase.from acá)
//   - Lógica:  hooks/ (useScoringData, useScoreEntry, useResumenBoard, useHcpEditor)
//   - Vista:   components/
// El tab Resumen consume el MISMO motor que el board público
// (`buildLeaderboardFromLegacy`), no recalcula nada por su cuenta.

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Flag, PersonStanding } from '@/components/icons'
import { useScoringData } from './hooks/useScoringData'
import { useScoreEntry } from './hooks/useScoreEntry'
import { useResumenBoard } from './hooks/useResumenBoard'
import { useHcpEditor } from './hooks/useHcpEditor'
import { ScoringHeader } from './components/ScoringHeader'
import { MultiRoundControls } from './components/MultiRoundControls'
import { ResumenTab } from './components/ResumenTab'
import { PlayerCards } from './components/PlayerCards'
import { ScorecardPanel } from './components/ScorecardPanel'

function CenteredScreen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  )
}

export default function ScoringPage() {
  const { slug } = useParams() as { slug: string }
  const [activeTab, setActiveTab] = useState<'scoring' | 'resumen'>('scoring')

  const data = useScoringData(slug)
  const {
    tournament, players, courseHoles, parTotal, courseTees, loading, loadError, retryLoad,
    holeCount, isMultiRound, totalRounds, activeRoundNum,
  } = data

  const entry = useScoreEntry({
    tournament,
    players,
    courseHoles,
    courseTees,
    holeCount,
    getActiveRound: data.getActiveRound,
    applyRoundTotals: data.applyRoundTotals,
    reloadRoster: data.reloadRoster,
  })

  const resumen = useResumenBoard({
    tournament,
    courseHoles,
    parTotal,
    active: activeTab === 'resumen',
  })

  const hcpEditor = useHcpEditor({
    onSaved: (playerId, value) => {
      data.setPlayerHandicap(playerId, value)
      // El board reparte golpes con este número: se rearma con el motor.
      resumen.reload()
    },
  })

  if (loading) {
    return <CenteredScreen><div style={{ color: 'var(--text-2)' }}>Cargando torneo...</div></CenteredScreen>
  }

  if (loadError) {
    return (
      <CenteredScreen>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--status-closed-fg)', marginBottom: '16px' }}>No pudimos cargar el torneo.</div>
          <button
            onClick={retryLoad}
            style={{ background: 'rgba(196,153,42,0.12)', color: '#c4992a', border: '1px solid rgba(196,153,42,0.3)', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
          >
            Reintentar
          </button>
        </div>
      </CenteredScreen>
    )
  }

  if (!tournament) {
    return <CenteredScreen><div style={{ color: 'var(--status-closed-fg)' }}>Torneo no encontrado.</div></CenteredScreen>
  }

  if (players.length === 0) {
    return (
      <CenteredScreen>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}><PersonStanding size={56} strokeWidth={1.5} /></div>
          <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '10px' }}>
            Sin jugadores inscritos
          </h3>
          <p style={{ color: 'var(--text-2)', marginBottom: '24px', fontSize: '15px' }}>
            Inscribe jugadores antes de ingresar scores
          </p>
          <button
            onClick={() => (window.location.href = `/organizador/${slug}/jugadores`)}
            style={{ background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700, fontSize: '15px', padding: '12px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
          >
            Inscribir jugadores →
          </button>
        </div>
      </CenteredScreen>
    )
  }

  return (
    <div style={{ background: 'var(--bg-surface)', minHeight: '100vh' }}>
      <ScoringHeader
        name={tournament.name}
        slug={tournament.slug}
        isMultiRound={isMultiRound}
        activeRoundNum={activeRoundNum}
        totalRounds={totalRounds}
        saving={entry.saving}
        lastAction={entry.lastAction}
        onUndo={entry.undoLast}
      />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '28px 20px' }}>
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface-soft)', borderRadius: '10px', padding: '4px', border: '1px solid var(--surface-border)' }}>
          {(['scoring', 'resumen'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: activeTab === tab ? 'var(--status-open-bg)' : 'transparent',
                border: activeTab === tab ? '1px solid rgba(196,153,42,0.4)' : '1px solid transparent',
                borderRadius: '8px',
                color: activeTab === tab ? 'var(--brand-on-bg)' : 'var(--text-2)',
                fontSize: '14px',
                fontWeight: activeTab === tab ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 180ms',
              }}
            >
              {tab === 'scoring' ? 'Scoring' : 'Resumen'}
            </button>
          ))}
        </div>

        {isMultiRound && (
          <MultiRoundControls
            totalRounds={totalRounds}
            activeRoundNum={activeRoundNum}
            players={players}
            canStartNextRound={data.canStartNextRound}
            startingNextRound={data.startingNextRound}
            onSelectRound={(rn) => {
              data.selectRound(rn)
              entry.clearSelection()
            }}
            onStartNextRound={async () => {
              const ok = await data.startNextRound()
              if (ok) entry.clearSelection()
            }}
          />
        )}

        {activeTab === 'resumen' && (
          <ResumenTab board={resumen} roster={players} hcpEditor={hcpEditor} />
        )}

        {activeTab === 'scoring' && (
          <>
            <PlayerCards
              players={players}
              selectedId={entry.selectedId}
              holeCount={holeCount}
              filledCount={entry.filledCount}
              getActiveRound={data.getActiveRound}
              hasScoresLoaded={Object.keys(entry.currentScores).length > 0}
              roundHoleCounts={data.roundHoleCounts}
              onSelect={entry.selectPlayer}
            />

            {entry.selectedPlayer ? (
              <ScorecardPanel
                tournament={tournament}
                courseHoles={courseHoles}
                holeCount={holeCount}
                entry={entry}
              />
            ) : (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '14px', padding: '48px', textAlign: 'center', color: 'var(--text-2)' }}>
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Flag size={36} strokeWidth={1.5} /></div>
                <div style={{ fontSize: '16px', color: 'var(--text)', marginBottom: '6px' }}>Selecciona un jugador arriba</div>
                <div style={{ fontSize: '13px' }}>Luego ingresa los scores hoyo a hoyo.</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
