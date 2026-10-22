'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { BrandedLoading } from '@/components/ronda/BrandedLoading'
import { createClient } from '@/lib/supabase'
import { trackPageView } from '@/lib/analytics'
import { getYardajeForTee } from '@/types/ronda'
import { usePlayerNotification } from '@/hooks/ronda/usePlayerNotification'
import { formatVsPar } from '@/golf/share/vs-par'
import { rachaParOMejor } from '@/golf/ronda-libre/progreso-de-ronda'
import { puedeDescartarRonda } from '@/golf/ronda-libre/permisos'
import { PushPermissionPrompt } from '@/components/ronda/PushPermissionPrompt'
import { NotifConfirmationToast } from '@/components/ronda/NotifConfirmationToast'
import { ShareMenu } from '@/components/ronda/ShareMenu'
import { ScorerMessageScreen } from '@/components/ronda/ScorerMessageScreen'
import { SCORER_THEME as theme } from '@/components/ronda/scorer-theme'
import { useScoreSync } from '@/hooks/useScoreSync'
import { useRefreshOnResume } from '@/hooks/ronda/useRefreshOnResume'
import { useOnlineStatus } from '@/hooks/ronda/useOnlineStatus'
import { useHoleNavigation } from '@/hooks/ronda/useHoleNavigation'
import { useBeforeUnloadWarning } from '@/hooks/ronda/useBeforeUnloadWarning'
import { haptic } from '@/lib/ronda/helpers'
import { useScoreboardCalc } from './hooks/useScoreboardCalc'
import { useRondaScoreData } from './hooks/useRondaScoreData'
import { useScoreSave } from './hooks/useScoreSave'
import { useFinalizeRonda } from './hooks/useFinalizeRonda'
import { useOfflineResync } from './hooks/useOfflineResync'
import { useHoleScoreInput } from './hooks/useHoleScoreInput'
import { useMatchPlayState } from '../hooks/useMatchPlayState'
import { useMiniRanking } from './hooks/useMiniRanking'
import { useGwiLeaderboard } from './hooks/useGwiLeaderboard'
import { useScoreCelebrations } from './hooks/useScoreCelebrations'
import { PlayerSelectorScreen } from './components/PlayerSelectorScreen'
import { FinishedRoundView } from './components/FinishedRoundView'
import { HoleControlBar } from './components/HoleControlBar'
import { MiniScorecardGrid } from './components/MiniScorecardGrid'
import { RankingSheet } from './components/RankingSheet'
import { ScorerHeader } from './components/ScorerHeader'
import { HoleInfoRow } from './components/HoleInfoRow'
import { ScoreDisplay } from './components/ScoreDisplay'
import { MatchPlayHoleCard } from './components/MatchPlayHoleCard'
import { LeaderboardView } from './components/LeaderboardView'
import { scoresAnotadosEnEsteTelefono } from './scores-anotados-aqui'
import { ScorerNavBar } from './components/ScorerNavBar'
import { DiscardRoundButton } from './components/DiscardRoundButton'
import { SaveStatusBadge } from './components/SaveStatusBadge'
import { ScorerCelebrations } from './components/ScorerCelebrations'
import { ScorerViewTabs } from './components/ScorerViewTabs'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'
import { vistaPublica } from '@/lib/data/tournaments/vista-publica'
import { AvisoSoloBruto } from '@/app/torneo/[slug]/components/AvisoSoloBruto'
import type { FormatoJuego } from '@/golf/core/rules'

/* ── Main ────────────────────────────────────────────────────────────── */
function ScorePageContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const codigo = params.codigo as string
  const jugadorParam = searchParams.get('j')

  const { ronda, scores, setScores, parMap, holeDataMap, playerHcp, hcpAMostrar,
          activeJugadorId, setActiveJugadorId, selectedPlayer, setSelectedPlayer,
          currentHole, setCurrentHole, loading, loadError, adminRedirectMsg, authUserId, netoNoDisponible } = useRondaScoreData(codigo, jugadorParam)

  // #511 — Ronda neto sin sesión con jugadores cuyo índice está en su perfil: aquí no
  // se puede leer y su neto (o el match) saldría como gross. Regla canónica
  // `vistaPublica`: TODO lo que se muestra se arma en bruto (`rondaVista`) y se pide
  // iniciar sesión para ver el neto. Los golpes se anotan igual; guardar y cerrar
  // usan la ronda real (`ronda`).
  // La etiqueta del header sale de `rondaVista` (ya en bruto); "Clasificación bruta"
  // lo dice el aviso bajo el header: en el header de 48 px no cabe sin partirse.
  const vistaBruta = useMemo(() => (ronda && netoNoDisponible
    ? vistaPublica({ visorConSesion: false, caminoRondaLibre: true, modoJuego: ronda.modo_juego, formatoJuego: (ronda.formato_juego ?? 'stroke_play') as FormatoJuego })
    : null), [ronda, netoNoDisponible])
  const rondaVista = useMemo(() => (ronda && vistaBruta
    ? { ...ronda, modo_juego: vistaBruta.modo, formato_juego: vistaBruta.formato }
    : ronda), [ronda, vistaBruta])

  const isOnline = useOnlineStatus()
  const [historicalRoundId, setHistoricalRoundId] = useState<string | null>(null)
  const [saveCheckVisible, setSaveCheckVisible] = useState(false) // FIX #8: save feedback toast
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [showRanking, setShowRanking] = useState(false)

  // Offline score sync — guarda localmente ANTES de enviar al servidor
  const scoreSync = useScoreSync(codigo, activeJugadorId)

  // useCallback estabiliza las refs para que useScoreSave no recree saveScores
  // en cada render (rompe el useCallback interno del hook).
  const mostrarCheckGuardado = useCallback((visibleMs: number) => {
    setSaveCheckVisible(true)
    setTimeout(() => setSaveCheckVisible(false), visibleMs)
  }, [])
  const onSaveSuccess = useCallback(() => {
    // 2.5s visible — el usuario ya navegó al siguiente hoyo, necesita tiempo
    // para ver la confirmación de que el score anterior se guardó.
    mostrarCheckGuardado(2500)
    haptic(20)
    // El push a quienes siguen la ronda lo dispara la capa de datos
    // (saveRondaLibreScores) junto con cada guardado — en todos los scorers.
  }, [mostrarCheckGuardado])
  const onRondaFinalized = useCallback(() => {
    router.replace(`/ronda-libre/${codigo}`)
  }, [router, codigo])
  const onDiscardSuccess = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  const { saveScores, saveImmediately, guardarAhora, marcarFinalizando, saveStatus, hasUnsaved, setHasUnsaved } = useScoreSave({
    codigo,
    isOnline,
    scoreSync,
    onSaveSuccess,
    onRondaFinalized,
  })

  const { view, setView, gwi } = useGwiLeaderboard(codigo)
  const { isMatchPlay, matchResult } = useMatchPlayState({ ronda: rondaVista, scores, holeDataMap, playerHcp })
  const {
    finalizeRound, discardRound,
    confirmFinalize, setConfirmFinalize, finalizando,
    confirmDiscard,
    discarding, roundDone, setRoundDone, finalScore,
  } = useFinalizeRonda({
    ronda, activeJugadorId, scores, parMap, holeDataMap, playerHcp, codigo, netoNoDisponible,
    guardarAhora, marcarFinalizando, setScores, setHasUnsaved,
    setHistoricalRoundId,
    onDiscardSuccess,
  })

  // Al volver de background (WhatsApp, etc.), flush scores pendientes a BD.
  // Sin esto, el WebSocket muerto + intervalos congelados causan un freeze
  // de 3-5s al reactivar la app (post-mortem 30-ago-2026). Mientras Finalizar
  // corre no: Finalizar ya guarda la tarjeta y un guardado tardío chocaría con el cierre.
  useRefreshOnResume(useCallback(() => {
    if (hasUnsaved && !finalizando && activeJugadorId && scores[activeJugadorId]) {
      saveScores(activeJugadorId, scores[activeJugadorId])
    }
  }, [hasUnsaved, finalizando, activeJugadorId, scores, saveScores]))

  // Track page view
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      trackPageView(supabase, data.session?.user?.id ?? null, '/score', { codigo })
    })
  }, [codigo])

  // Con el cierre en pantalla tampoco: la tarjeta ya está en el historial y la ronda puede estar cerrada.
  useOfflineResync({ isOnline, activeJugadorId, finalizando: finalizando || roundDone, scoreSync, saveImmediately })
  useBeforeUnloadWarning(hasUnsaved)

  const { scoreAnimating, handleScoreChange, handleConcedeHole } = useHoleScoreInput({
    codigo, activeJugadorId, isMatchPlay, currentHole, parMap, setScores, setHasUnsaved,
    enviar: saveScores, bloqueado: finalizando,
  })

  // Hoyos de la ronda en orden de juego (fuente única: hoyosDeLaRonda) + navegación.
  const totalHoles = ronda?.holes ?? 18
  const hoyoInicio = ronda?.hoyo_inicio ?? 1
  const nav = useHoleNavigation({ hoyoInicio, totalHoles, currentHole, setCurrentHole })
  const { ordenHoyos, currentHoleIdx } = nav
  const celebrations = useScoreCelebrations()
  const ranking = useMiniRanking(ronda, scores, parMap)

  /* ── Pre-render data (null-safe defaults para rules-of-hooks) ── */
  // useScoreboardCalc DEBE llamarse en cada render — no después de early returns.
  // Usar defaults safe cuando ronda aún no cargó; outputs no se usan hasta
  // después de los early returns que filtran loading/null state.
  const jugadores = ronda?.ronda_libre_jugadores ?? []

  const calc = useScoreboardCalc({
    ronda: rondaVista ?? { holes: 18, modo_juego: 'gross', formato_juego: 'stroke_play', hoyo_inicio: 1 },
    activeJugadorId: activeJugadorId ?? '',
    jugadores, scores, parMap, holeDataMap, playerHcp, currentHole,
    currentHoleIdx,
    hoyos: ordenHoyos,
  })
  const {
    mode: { modoJuego, formatoJuego, modoLabel, showNet, showStableford, isStrokePlayNeto },
    current: {
      par, score, holeData, strokesOnHole, strokeAdvantageOnHole,
      currentNetDiff, currentStablefordPts,
      isLastHole,
    },
    totals: { totalGross, totalOverUnder, holesPlayed },
    neto: { totalNet, totalStableford },
    flags: { missingCount, canFinalize, isAboveDoubleBogey, showStrokeIndexWarning },
    display: { displayOverUnder },
    strokeAdvantageOn,
  } = calc

  // ── Persistent player notification (Tipo A) ──
  const vsParStr = formatVsPar(totalOverUnder)
  usePlayerNotification({
    codigo,
    courseName: ronda?.course_name ?? '',
    currentHole,
    currentPar: par,
    roundDone,
    grossScore: totalGross,
    vsPar: vsParStr,
  })

  /* ── Navigate ── */
  const handleExit = () => router.push(`/ronda-libre/${codigo}`)
  const goToNextHole = () => {
    // Con Finalizar en curso no se rellena ni guarda nada: el par auto-llenado saldría tras la lectura de la tarjeta.
    if (!ronda || !activeJugadorId || finalizando) return
    haptic(30)
    // Hoyo fuera de la ronda: sólo se mueve al primero de la ronda, sin rellenar ni
    // guardar (antes podía persistir un hoyo "1" fantasma en un back 9).
    if (currentHoleIdx < 0) { nav.advanceHole(); return }

    // 1. Computar scoresToSave inline (auto-fill par si el hoyo no tiene score).
    //    Necesario: leer del closure de `scores` da estado stale del setScores
    //    recién programado por handleScoreChange. Computamos el objeto final acá.
    const currentPlayerScores = scores[activeJugadorId] ?? {}
    let scoresToSave: Record<number, number> = currentPlayerScores
    if (currentPlayerScores[currentHole] == null) {
      const holePar = parMap[currentHole] ?? 4
      handleScoreChange(currentHole, holePar)  // sync UI
      scoresToSave = { ...currentPlayerScores, [currentHole]: holePar }
    }

    // 2. Capturar valores pre-nav para celebraciones + streak.
    const holeScored = currentHole
    const holeScoredIdx = currentHoleIdx
    const savedScore = scoresToSave[holeScored]
    const holeParScored = parMap[holeScored] ?? 4

    // 3. NAVEGAR PRIMERO — la RPC merge garantiza que el save background no pierde data.
    //    Audit P0 #1 fase 3: el await del save bloqueaba la nav y el siguiente tap iba
    //    al hoyo anterior por timing. Fix: nav inmediata, save fire-and-forget.
    nav.advanceHole()

    // 4. Save en background. `saveScores` maneja sus propios toasts de error/finalize.
    void saveScores(activeJugadorId, scoresToSave)

    // 5. Celebraciones — usar valores capturados pre-nav (NO `currentHole` actual).
    if (savedScore != null) {
      const playerName = ronda.ronda_libre_jugadores.find(j => j.id === activeJugadorId)?.nombre ?? 'Jugador'
      celebrations.celebrarHoyo({ savedScore, holePar: holeParScored, hole: holeScored, playerName, courseName: ronda.course_name })
      // 6. Streak — usar scoresToSave (incluye auto-fill) en vez de closure stale.
      celebrations.mostrarRacha(rachaParOMejor(scoresToSave, ordenHoyos, holeScoredIdx, parMap))
    }
  }

  /* ── Render ── */
  if (adminRedirectMsg) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <div style={{ fontSize: '14px', color: 'var(--text-2)' }}>{adminRedirectMsg}</div>
    </div>
  )
  if (loading) return <BrandedLoading message="Preparando scorer" variant="dark" />
  if (loadError) return <ScorerMessageScreen message={loadError} codigo={codigo} reload />
  if (!ronda || !activeJugadorId) return <ScorerMessageScreen message="No hay jugadores en esta ronda" codigo={codigo} />

  /* ── Player selection screen (multi-player, no auto-match) ── */
  if (!selectedPlayer && jugadores.length > 1) {
    return (
      <PlayerSelectorScreen
        jugadores={jugadores}
        hcpAMostrar={hcpAMostrar}
        scores={scores}
        hoyoInicio={ronda.hoyo_inicio ?? 1}
        holes={ronda.holes}
        onSelect={(jugadorId, firstEmptyHole) => {
          setSelectedPlayer(jugadorId)
          setActiveJugadorId(jugadorId)
          setCurrentHole(firstEmptyHole)
        }}
      />
    )
  }
  const activePlayer = jugadores.find(p => p.id === activeJugadorId)

  return (
    <div style={{ background: theme.bg, height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      {/* ── Push permission prompt (one-time) ── */}
      <PushPermissionPrompt />

      {/* ── Notification confirmation toast (first time per session) ── */}
      {!roundDone && ronda && <NotifConfirmationToast type="player" />}

      {/* ── Share menu modal ── */}
      {showShareMenu && <ShareMenu codigo={codigo} onClose={() => setShowShareMenu(false)} isAdminMode={!!ronda?.admin_mode} />}

      {/* ── Offline banner ── */}
      {!isOnline && (
        <div style={{ background: 'var(--score-bogey-fg)', color: 'var(--ivory)', textAlign: 'center', padding: '4px', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
          Sin conexión — guardado local
        </div>
      )}

      <SaveStatusBadge saveStatus={saveStatus} />

      <ScorerHeader
        currentHole={currentHole}
        modoLabel={modoLabel}
        courseName={ronda.course_name}
        totalHoles={totalHoles}
        holesPlayed={holesPlayed}
        isMatchPlay={isMatchPlay}
        matchResult={matchResult}
        activeIsPlayerA={activeJugadorId === ronda.ronda_libre_jugadores[0]?.id}
        showStableford={showStableford}
        showNet={showNet}
        totalStableford={totalStableford}
        displayOverUnder={displayOverUnder}
        hcpLabel={hcpAMostrar(activeJugadorId)}
        onExit={handleExit}
        theme={theme}
      />

      {vistaBruta && <AvisoSoloBruto volverA={`/ronda-libre/${codigo}/score`} />}

      <MiniScorecardGrid
        totalHoles={totalHoles}
        hoyos={ordenHoyos}
        scores={scores}
        activeJugadorId={activeJugadorId}
        parMap={parMap}
        holeDataMap={holeDataMap}
        currentHole={currentHole}
        setCurrentHole={setCurrentHole}
        modoJuego={modoJuego}
        hasStrokeAdvantage={strokeAdvantageOn}
        totalGross={totalGross}
        totalNet={totalNet}
        showNet={showNet}
        isStrokePlayNeto={isStrokePlayNeto}
        progressRowRef={nav.progressRowRef}
        theme={theme}
      />

      <HoleInfoRow
        par={par}
        strokeIndex={holeData.stroke_index}
        yardaje={getYardajeForTee(holeData, teeDelJugador(activePlayer, ronda))}
        showStrokes={(showNet || showStableford) && !isStrokePlayNeto}
        strokesOnHole={strokesOnHole}
        onShare={() => setShowShareMenu(true)}
        theme={theme}
      />

      {/* ── Toggle Scorecard / Leaderboard + player tabs (multi-player only) ── */}
      {jugadores.length > 1 && (
        <ScorerViewTabs
          view={view}
          setView={setView}
          showPlayerTabs={!selectedPlayer}
          jugadores={jugadores}
          activeJugadorId={activeJugadorId}
          setActiveJugadorId={setActiveJugadorId}
          theme={theme}
        />
      )}

      {/* ── SCORECARD VIEW ── */}
      {view === 'scorecard' && <>
      {/* ── Central area — SCORE (flex:1, centered) ── */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', position: 'relative', minHeight: 0, paddingTop: '16px' }}
        {...nav.swipeHandlers}
      >
        <ScoreDisplay
          score={score}
          par={par}
          scoreAnimating={scoreAnimating}
          saveCheckVisible={saveCheckVisible}
          showStrokeDots={modoJuego !== 'gross' && strokeAdvantageOnHole && !isStrokePlayNeto}
          strokesOnHole={strokesOnHole}
          showNet={showNet}
          showStableford={showStableford}
          isStrokePlayNeto={isStrokePlayNeto}
          currentNetDiff={currentNetDiff}
          currentStablefordPts={currentStablefordPts}
          showStrokeIndexWarning={showStrokeIndexWarning}
          isAboveDoubleBogey={isAboveDoubleBogey}
          theme={theme}
        />

        {/* ── Match Play: head-to-head del hoyo, dormie, conceder ── */}
        {isMatchPlay && matchResult && (
          <MatchPlayHoleCard
            matchResult={matchResult}
            jugadores={ronda.ronda_libre_jugadores}
            currentHole={currentHole}
            activeScoreOnHole={scores[activeJugadorId]?.[currentHole]}
            onConcede={handleConcedeHole}
            mostrarNeto={showNet}
            theme={theme}
          />
        )}
      </div>

      <HoleControlBar
        score={score}
        onDecrement={() => handleScoreChange(currentHole, (score ?? par) - 1)}
        onIncrement={() => handleScoreChange(currentHole, (score ?? par) + 1)}
        decrementBg={theme.buttonBg}
        decrementColor={theme.buttonText}
        decrementBorder={theme.buttonBorder}
        bloqueado={finalizando}
      />
      </>}

      {/* ── LEADERBOARD VIEW ── */}
      {view === 'leaderboard' && jugadores.length > 1 && (
        <LeaderboardView
          codigo={codigo}
          parMap={parMap}
          currentUserId={ronda.ronda_libre_jugadores.find(j => j.id === activeJugadorId)?.user_id ?? null}
          totalHoles={ronda.holes}
          modoJuego={modoJuego}
          formatoJuego={formatoJuego}
          playerHcp={playerHcp}
          holeDataMap={holeDataMap}
          hoyos={ordenHoyos}
          gwi={gwi}
          theme={theme}
          scoresLocales={scoresAnotadosEnEsteTelefono(codigo, jugadores.map(j => j.id), scores)}
        />
      )}

      {/* ── Mini ranking / Match state (collapsible, multi-player only) ── */}
      {ranking.length > 1 && view === 'scorecard' && ronda && (
        <RankingSheet
          ranking={ranking}
          isMatchPlay={isMatchPlay}
          matchResult={matchResult}
          jugadores={ronda.ronda_libre_jugadores}
          activeJugadorId={activeJugadorId}
          showRanking={showRanking}
          setShowRanking={setShowRanking}
        />
      )}

      <ScorerNavBar
        currentHoleIdx={currentHoleIdx}
        isLastHole={isLastHole}
        canFinalize={canFinalize}
        confirmFinalize={confirmFinalize}
        finalizando={finalizando}
        missingCount={missingCount}
        holesPlayed={holesPlayed}
        totalHoles={totalHoles}
        onPrev={nav.goToPrevHole}
        onNext={() => { setConfirmFinalize(false); goToNextHole() }}
        onFinalize={finalizeRound}
        theme={theme}
      />

      {/* Sólo el creador puede descartar (el RPC rechaza al resto con P0003): a los demás no se les ofrece. */}
      {puedeDescartarRonda(ronda, authUserId) && (
        <DiscardRoundButton confirmDiscard={confirmDiscard} discarding={discarding} onClick={discardRound} />
      )}

      {/* ── Post-round celebration modal ── */}
      {roundDone && ronda && (
        <FinishedRoundView
          ronda={rondaVista ?? ronda}
          finalScore={finalScore}
          historicalRoundId={historicalRoundId}
          activeJugadorId={activeJugadorId}
          jugadores={jugadores}
          scores={scores}
          parMap={parMap}
          playerHcp={playerHcp}
          holeDataMap={holeDataMap}
          codigo={codigo}
          showStableford={showStableford}
          totalStableford={totalStableford}
          isMatchPlay={isMatchPlay}
          matchResult={matchResult}
          onContinueScoring={() => { setRoundDone(false); setCurrentHole(ordenHoyos[0]) }}
        />
      )}

      {/* ── CSS animations ── */}
      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: scale(0.8); }
          20% { opacity: 1; transform: scale(1.1); }
          40% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1) translateY(-4px); }
        }
        @keyframes pendingPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>

      <ScorerCelebrations c={celebrations} />
    </div>
  )
}

export default function ScorePage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--bg-surface)', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>Cargando...</div>}>
      <ScorePageContent />
    </Suspense>
  )
}
