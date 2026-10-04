'use client'

import { useCallback, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BrandedLoading } from '@/components/ronda/BrandedLoading'
import { ScorerMessageScreen } from '@/components/ronda/ScorerMessageScreen'
import { SCORER_THEME as theme } from '@/components/ronda/scorer-theme'
import { useRefreshOnResume } from '@/hooks/ronda/useRefreshOnResume'
import { useHoleNavigation } from '@/hooks/ronda/useHoleNavigation'
import { useBeforeUnloadWarning } from '@/hooks/ronda/useBeforeUnloadWarning'
import { getYardajeForTee, type Jugador } from '@/types/ronda'
import { isTeamFormat, isSharedBallFormat } from '@/golf/formats'
import { puedeDescartarRonda } from '@/golf/ronda-libre/permisos'
import { haptic } from '@/lib/ronda/helpers'
import { saveGroupScores } from '@/lib/ronda/score-storage'
import { BestBallTeamCard } from './components/BestBallTeamCard'
import { GrupoScorerHeader } from './components/GrupoScorerHeader'
import { HoleProgressRow } from './components/HoleProgressRow'
import { GrupoHoleInfoRow } from './components/GrupoHoleInfoRow'
import { SharedBallTeamCard } from './components/SharedBallTeamCard'
import { PlayerScoreCard } from './components/PlayerScoreCard'
import { GrupoNavBar } from './components/GrupoNavBar'
import { DiscardRoundModal } from './components/DiscardRoundModal'
import { useRondaGrupoData } from './hooks/useRondaGrupoData'
import { useGrupoScoreSave } from './hooks/useGrupoScoreSave'
import { useTeamScoreSave } from './hooks/useTeamScoreSave'
import { useFinalizeGrupo } from './hooks/useFinalizeGrupo'
import { useMatchPlayState } from '../hooks/useMatchPlayState'
import { useGrupoScoreboard } from './hooks/useGrupoScoreboard'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'

const SIN_JUGADORES: Jugador[] = []

/* ── Main ── */
export default function ScoreGrupoPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const {
    ronda, loading, loadError, currentHole, setCurrentHole,
    scores, setScores, parMap, holeDataMap, playerHcp, playerDisplayHcp,
    teamEquipos, setTeamEquipos, anotadorNombre, authUserId,
  } = useRondaGrupoData(codigo)

  // Al volver de background (WhatsApp, etc.), forzar re-render para que la UI
  // no se quede frozen por WebSockets muertos (post-mortem 30-ago-2026).
  const [, forceUpdate] = useState(0)
  useRefreshOnResume(useCallback(() => forceUpdate(n => n + 1), []))

  // Hoyos de la ronda en orden de juego (fuente única: hoyosDeLaRonda) + navegación.
  const nav = useHoleNavigation({
    hoyoInicio: ronda?.hoyo_inicio ?? 1,
    totalHoles: ronda?.holes ?? 18,
    currentHole,
    setCurrentHole,
  })
  const { ordenHoyos, currentHoleIdx, isLastHole } = nav

  const { saveStatus, setSaveStatus, hasUnsaved, setHasUnsaved, pendingScoreConfirm, handleScoreChange, saveAllScores } =
    useGrupoScoreSave({ ronda, codigo, currentHole, scores, setScores, parMap })
  const { handleTeamScoreChange, autoFillTeamsWithPar, foursomeInvertido, toggleFoursomeInvertido } =
    useTeamScoreSave({ codigo, parMap, teamEquipos, setTeamEquipos, setSaveStatus, setHasUnsaved })
  // Match play: mismo cálculo que el scorer individual y el historial (`matchDeLaRonda`).
  const { matchResult } = useMatchPlayState({ ronda, scores, holeDataMap, playerHcp })
  const { finalizeRound, finalizing, confirmFinalize, discardRound, discarding, showDiscardConfirm, setShowDiscardConfirm } =
    useFinalizeGrupo({ ronda, codigo, currentHole, hoyos: ordenHoyos, scores, setScores, parMap, teamEquipos, matchResult })
  useBeforeUnloadWarning(hasUnsaved)

  const jugadores = ronda?.ronda_libre_jugadores ?? SIN_JUGADORES
  const board = useGrupoScoreboard({
    ronda, jugadores, scores, parMap, holeDataMap, playerHcp, ordenHoyos, currentHole, isLastHole,
  })
  const {
    totalHoles, par, holeData, modoJuego, formatoJuego, modoLabel, showNetStableford,
    siAllocByHole, getDotHcp, holesWithScores, maxThru, canFinalize, totalMissingScores, getPlayerTotal, maxStrokesOnHole,
  } = board

  const goToNextHole = async () => {
    if (!ronda) return
    haptic(30)
    // Hoyo fuera de la ronda: sólo se mueve al primero de la ronda, sin rellenar ni guardar.
    if (currentHoleIdx < 0) { nav.advanceHole(); return }

    if (isSharedBallFormat(formatoJuego)) {
      // Auto-fill teams without scores with par
      await autoFillTeamsWithPar(currentHole, par)
    } else {
      // Auto-fill ALL players who don't have a score for the current hole with par
      const updatedScores = { ...scores }
      for (const j of jugadores) {
        if (updatedScores[j.id]?.[currentHole] == null) {
          updatedScores[j.id] = { ...(updatedScores[j.id] ?? {}), [currentHole]: par }
        }
      }
      setScores(updatedScores)
      setHasUnsaved(true)
      saveGroupScores(codigo, updatedScores)

      // Save ALL atomically BEFORE advancing
      await saveAllScores(updatedScores)
    }

    // NOW advance
    nav.advanceHole()
  }

  /* ── Render ── */
  if (loading) return <BrandedLoading message="Preparando scorer" variant="dark" />
  if (loadError) return <ScorerMessageScreen message={loadError} codigo={codigo} reload />
  if (!ronda) return <ScorerMessageScreen message="No se pudo cargar la ronda" codigo={codigo} />

  // Admin es quien opera la UI. Si admin es jugador de la ronda, usar su tee.
  // Sino fallback al tee default de la ronda (r.tees).
  const adminPlayer = ronda.ronda_libre_jugadores?.find(p => p.user_id === ronda.admin_user_id)
  const yardaje = getYardajeForTee(holeData, teeDelJugador(adminPlayer, ronda))

  return (
    <div style={{ background: theme.bg, height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      {/* Save indicator */}
      {saveStatus !== 'idle' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20,
          height: '3px', transition: 'opacity 0.3s',
          background: saveStatus === 'saving' ? '#C4992A' : saveStatus === 'saved' ? '#00e676' : '#ff4444',
          opacity: saveStatus === 'saved' ? 0.6 : 1,
          animation: saveStatus === 'saving' ? 'savePulse 1s ease infinite' : 'none',
        }} />
      )}

      <GrupoScorerHeader
        currentHole={currentHole}
        modoLabel={modoLabel}
        courseName={ronda.course_name}
        anotadorNombre={anotadorNombre}
        maxThru={maxThru}
        totalHoles={totalHoles}
        onExit={() => router.push(`/ronda-libre/${codigo}`)}
        theme={theme}
      />

      <HoleProgressRow
        ordenHoyos={ordenHoyos}
        currentHole={currentHole}
        setCurrentHole={setCurrentHole}
        jugadores={jugadores}
        scores={scores}
        showNetStableford={showNetStableford}
        getDotHcp={getDotHcp}
        siAllocByHole={siAllocByHole}
        totalHoles={totalHoles}
        progressRowRef={nav.progressRowRef}
        theme={theme}
      />

      <GrupoHoleInfoRow
        par={par}
        strokeIndex={holeData.stroke_index}
        yardaje={yardaje}
        showNetStableford={showNetStableford}
        maxStrokes={maxStrokesOnHole}
        theme={theme}
      />

      {/* Player columns — scrollable main area */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', minHeight: 0 }}
        {...nav.swipeHandlers}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Label contextual formato equipo */}
          {isSharedBallFormat(formatoJuego) ? (
            <p style={{ fontSize: '13px', color: 'var(--text-2)', textAlign: 'center', marginBottom: '8px', fontStyle: 'italic' }}>
              Ingresa el score del equipo por hoyo
            </p>
          ) : isTeamFormat(formatoJuego) ? (
            <p style={{ fontSize: '13px', color: 'var(--text-2)', textAlign: 'center', marginBottom: '8px', fontStyle: 'italic' }}>
              Ingresa el score de cada jugador
            </p>
          ) : null}

          {/* Best Ball — 1 score por jugador, agrupados por equipo */}
          {formatoJuego === 'best_ball' && teamEquipos.length > 0 && (() => {
            // Pre-compute dot HCPs y SI por hoyo (consumidos por el componente y sus helpers)
            const playerDotHcps: Record<string, number> = {}
            for (const j of jugadores) playerDotHcps[j.id] = getDotHcp(j.id)
            const strokeIndexByHole: Record<number, number> = {}
            for (const h of ordenHoyos) strokeIndexByHole[h] = holeDataMap[h]?.stroke_index ?? h
            return teamEquipos.map((equipo) => (
              <BestBallTeamCard
                key={equipo.id}
                equipo={equipo}
                jugadores={jugadores}
                scores={scores}
                playerHcp={playerHcp}
                playerDisplayHcp={playerDisplayHcp}
                playerDotHcps={playerDotHcps}
                modoJuego={modoJuego}
                currentHole={currentHole}
                par={par}
                strokeIndex={holeData.stroke_index}
                parMap={parMap}
                strokeIndexByHole={strokeIndexByHole}
                totalHoles={totalHoles}
                hoyos={ordenHoyos}
                onIncrement={(jid) => handleScoreChange(jid, currentHole, 1)}
                onDecrement={(jid) => handleScoreChange(jid, currentHole, -1)}
                theme={theme}
              />
            ))
          })()}

          {/* Team scoring for Scramble/Foursome */}
          {isSharedBallFormat(formatoJuego) && teamEquipos.length > 0 && teamEquipos.map(equipo => (
            <SharedBallTeamCard
              key={equipo.id}
              equipo={equipo}
              formatoJuego={formatoJuego}
              currentHole={currentHole}
              par={par}
              ordenHoyos={ordenHoyos}
              parMap={parMap}
              holeDataMap={holeDataMap}
              siAllocByHole={siAllocByHole}
              totalHoles={totalHoles}
              foursomeInvertido={foursomeInvertido[equipo.id] ?? false}
              onToggleInvertido={() => toggleFoursomeInvertido(equipo.id)}
              onChange={(delta) => handleTeamScoreChange(equipo.id, currentHole, delta)}
              theme={theme}
            />
          ))}

          {/* Individual scoring (hidden for team scoring formats: scramble, foursome, best_ball) */}
          {!isTeamFormat(formatoJuego) && jugadores.map(j => (
            <PlayerScoreCard
              key={j.id}
              jugador={j}
              playerScores={scores[j.id]}
              currentHole={currentHole}
              par={par}
              holeData={holeData}
              totals={getPlayerTotal(j.id)}
              played={holesWithScores(j.id)}
              hcp={playerHcp[j.id] ?? 0}
              displayHcp={playerDisplayHcp[j.id]}
              dotHcp={getDotHcp(j.id)}
              siAllocByHole={siAllocByHole}
              ordenHoyos={ordenHoyos}
              holeDataMap={holeDataMap}
              totalHoles={totalHoles}
              modoJuego={modoJuego}
              formatoJuego={formatoJuego}
              showNetStableford={showNetStableford}
              pending={pendingScoreConfirm?.jugadorId === j.id && pendingScoreConfirm?.hole === currentHole}
              onChange={(delta) => handleScoreChange(j.id, currentHole, delta)}
              theme={theme}
            />
          ))}
        </div>
      </div>

      <GrupoNavBar
        currentHoleIdx={currentHoleIdx}
        isLastHole={isLastHole}
        canFinalize={canFinalize}
        confirmFinalize={confirmFinalize}
        finalizing={finalizing}
        totalMissingScores={totalMissingScores}
        maxThru={maxThru}
        totalHoles={totalHoles}
        onPrev={nav.goToPrevHole}
        onNext={goToNextHole}
        onFinalize={finalizeRound}
        theme={theme}
      />

      {/* Sólo el creador puede descartar (el RPC rechaza al resto con P0003): a los demás no se les ofrece. */}
      {puedeDescartarRonda(ronda, authUserId) && (
        <DiscardRoundModal
          showConfirm={showDiscardConfirm}
          setShowConfirm={setShowDiscardConfirm}
          discarding={discarding}
          onDiscard={discardRound}
        />
      )}

      {/* Animations */}
      <style>{`
        @keyframes savePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
