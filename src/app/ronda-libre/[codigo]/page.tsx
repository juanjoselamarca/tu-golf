'use client'

import { useEffect, useReducer, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { copyToClipboard } from '@/lib/clipboard'
import { setActiveRondaSession } from '@/components/LiveRoundIndicator'
import { getNotifPrefs, setNotifPrefs, isPushSupported, requestPermission } from '@/lib/push-notifications'
import { buildTimelineEvents } from '@/lib/ronda/helpers'
import { buildMyHighlights } from '@/lib/ronda/round-highlights'
import { compartirLeaderboard } from '@/lib/share-card'
import { captureError } from '@/lib/error-tracking'
import { buildLeaderboard, hasPlayData } from '@/lib/ronda/leaderboard'
import { TEAM_FORMAT_KEYS, isSharedBallFormat } from '@/golf/formats'
import { buildMatchResult } from '@/lib/ronda/match'
import { rankTeams } from '@/lib/ronda/team-ranking'
import { buildLeaderboardShareData, buildShareText } from '@/lib/ronda/share'

import { RoundHighlights } from '@/components/ronda/RoundHighlights'
import { NotifBanner } from '@/components/ronda/NotifBanner'
import { AuthModal } from '@/components/ronda/AuthModal'

import { useRondaLibreLive } from './hooks/useRondaLibreLive'
import { useGWI } from './hooks/useGWI'
import { useViewer } from './hooks/useViewer'

import { LoadingView, FetchErrorView, NotFoundView } from './components/RondaStates'
import { RondaHeader } from './components/RondaHeader'
import { MatchPlayWinner } from './components/MatchPlayWinner'
import { WinnerCelebration } from './components/WinnerCelebration'
import { MatchPlayCard } from './components/MatchPlayCard'
import { CourseInfoCard } from './components/CourseInfoCard'
import { TeamLeaderboards } from './components/TeamLeaderboards'
import { IndividualLeaderboard } from './components/IndividualLeaderboard'
import { GwiPanel } from './components/GwiPanel'
import { RecentTimeline } from './components/RecentTimeline'
import { RefreshStatus } from './components/RefreshStatus'
import { ShareLeaderboardButton } from './components/ShareLeaderboardButton'
import { AdminInfoBanner, PostRondaLinks, AdminScoringBar, RegistrationBanner } from './components/FooterBars'
import { LiveStyles } from './components/LiveStyles'

const SITE_URL = 'https://golfersplus.vercel.app'

function RondaLibrePageContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const codigo = params.codigo as string
  const finishedParam = searchParams.get('finished') === 'true'

  // UI state local.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [, forceRender] = useReducer((x: number) => x + 1, 0)

  // Datos + live engine + GWI + identidad del espectador.
  const gwi = useGWI(codigo)
  const live = useRondaLibreLive(codigo, gwi.refetch)
  const viewer = useViewer(codigo)

  const {
    ronda, parMap, siMap, courseHcpMap, displayHcpMap, equipos,
    loading, notFound, fetchError, role,
    countdown, isRealtimeConnected, timeSinceUpdate, retry,
  } = live
  const {
    isAnonymous, currentUserId, showBanner, dismissBanner,
    showAuthModal, authModalAction, requireAuth, closeAuthModal,
  } = viewer

  // Track de la ronda activa para el indicador live.
  useEffect(() => {
    if (role === 'espectador' && ronda && ronda.estado === 'en_curso' && !isAnonymous) {
      setActiveRondaSession(codigo, ronda.course_name)
    }
  }, [role, ronda, isAnonymous, codigo])

  /* ── Guards ── */
  if (loading) return <LoadingView />
  if (fetchError && !ronda) return <FetchErrorView onRetry={retry} />
  if (notFound || !ronda) return <NotFoundView codigo={codigo} />

  /* ── Derivados (ronda garantizado no-null) ── */
  const fechaDisplay = ronda.fecha
    ? new Date(ronda.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''
  const isEnCurso = ronda.estado === 'en_curso'
  const hasCourse = Object.keys(parMap).length > 0
  const isNetoMode = ronda.modo_juego === 'neto'
  const isFinished = finishedParam || ronda.estado === 'finalizada'
  const timelineEvents = buildTimelineEvents(ronda.ronda_libre_jugadores, ronda.holes, parMap)
  const leaderboard = buildLeaderboard({
    jugadores: ronda.ronda_libre_jugadores,
    holes: ronda.holes,
    parMap, siMap, courseHcpMap,
    modoJuego: ronda.modo_juego,
    formatoJuego: ronda.formato_juego,
  })
  const mr = buildMatchResult(ronda, parMap, siMap, courseHcpMap)

  const isAdmin = ronda.admin_mode && ronda.admin_user_id === currentUserId
  const isAdminRound = !!ronda.admin_mode
  const adminPlayerName = isAdminRound
    ? ronda.ronda_libre_jugadores.find(j => j.user_id === ronda.admin_user_id)?.nombre ?? 'El admin'
    : null
  const isTeamFormat = TEAM_FORMAT_KEYS.includes(ronda.formato_juego)
  // Ranking de equipos (fix 128): el cuadro ganador de modalidades por equipos
  // muestra el equipo ganador, no el jugador top del leaderboard individual.
  const teamRanking = isTeamFormat
    ? rankTeams({
        equipos,
        jugadores: ronda.ronda_libre_jugadores,
        parMap, siMap, courseHcpMap,
        holes: ronda.holes,
        formato: ronda.formato_juego,
        modo: ronda.modo_juego,
      })
    : []
  // Fuente única "¿hay puntajes para mostrar?" — cubre scores individuales
  // (individual/best_ball) y scores de equipo (scramble/foursome). Antes vivía
  // como 3 predicados inconsistentes inline. No depende del orden del leaderboard.
  const hayDatos = hasPlayData(leaderboard, equipos)
  // Highlights del jugador autenticado (null si no jugó o no está en la ronda).
  const myHighlights = currentUserId
    ? buildMyHighlights(ronda.ronda_libre_jugadores, currentUserId, parMap, ronda.holes)
    : null

  /* ── Share handlers ── */
  const shareUrl = `${SITE_URL}/ronda-libre/${codigo}`
  const shareText = buildShareText(ronda, parMap, siMap, courseHcpMap)
  const handleCopy = async () => {
    if (await copyToClipboard(shareUrl)) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }
  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Golfers+ — Ronda en vivo', text: shareText, url: shareUrl })
      } catch { /* user cancelled */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, '_blank')
    }
  }
  const shareLeaderboard = async (finished: boolean) => {
    try {
      await compartirLeaderboard(buildLeaderboardShareData({
        ronda, leaderboard, equipos, parMap, siMap, courseHcpMap, fechaDisplay, codigo, isFinished: finished,
      }))
    } catch (err) {
      captureError(err, { context: 'ronda-libre.compartirLeaderboard', meta: { codigo, formato: ronda.formato_juego } })
    }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <RondaHeader
        isFinished={isFinished}
        isEnCurso={isEnCurso}
        courseName={ronda.course_name}
        fechaDisplay={fechaDisplay}
        holes={ronda.holes}
        timeSinceUpdate={timeSinceUpdate}
      />

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px' }}>

        {isAdminRound && !isAdmin && currentUserId && adminPlayerName && (
          <AdminInfoBanner adminPlayerName={adminPlayerName} />
        )}

        {isFinished && ronda.formato_juego === 'match_play' && ronda.ronda_libre_jugadores.length === 2 && mr && (
          <MatchPlayWinner ronda={ronda} mr={mr} onShare={handleShare} />
        )}

        {/* RoundHighlights — solo para el jugador autenticado */}
        {isFinished && myHighlights && (
          <RoundHighlights data={myHighlights.data} scores={myHighlights.scores} parMap={parMap} totalHoles={ronda.holes} />
        )}

        {isFinished && ronda.formato_juego !== 'match_play' &&
          (isTeamFormat ? teamRanking.length > 0 : leaderboard.length > 0) &&
          hayDatos && (
          <WinnerCelebration
            ronda={ronda}
            leaderboard={leaderboard}
            fechaDisplay={fechaDisplay}
            onShare={() => shareLeaderboard(true)}
            teams={isTeamFormat ? teamRanking : undefined}
          />
        )}

        {!isFinished && (
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '10px 16px', borderRadius: '10px', marginBottom: '12px',
            background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.12)',
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: '13px', color: '#c4992a', fontWeight: 600 }}>Descubrir Golfers+</span>
            <span style={{ color: '#c4992a', fontSize: '12px' }}>→</span>
          </Link>
        )}

        {isEnCurso && !getNotifPrefs().spectator && (
          <NotifBanner onEnable={async () => {
            if (requireAuth('Activa alertas en vivo')) return
            if (!isPushSupported()) {
              setNotifPrefs({ spectator: true })
              forceRender()
              return
            }
            try {
              const granted = await requestPermission()
              if (granted) {
                setNotifPrefs({ spectator: true })
                forceRender()
              }
            } catch {
              setNotifPrefs({ spectator: true })
              forceRender()
            }
          }} />
        )}

        {ronda.formato_juego === 'match_play' && leaderboard.length === 2 && mr && (
          <MatchPlayCard ronda={ronda} mr={mr} courseHcpMap={courseHcpMap} displayHcpMap={displayHcpMap} />
        )}

        <CourseInfoCard ronda={ronda} fechaDisplay={fechaDisplay} />

        {isTeamFormat && (
          <TeamLeaderboards
            ronda={ronda}
            equipos={equipos}
            parMap={parMap}
            siMap={siMap}
            courseHcpMap={courseHcpMap}
            displayHcpMap={displayHcpMap}
            fechaDisplay={fechaDisplay}
            expandedTeam={expandedTeam}
            onToggleTeam={(id) => setExpandedTeam(prev => prev === id ? null : id)}
          />
        )}

        {/* En scramble/foursome los scores viven en el equipo: la tabla individual
            mostraría todos en "—/0-18". Se oculta; la clasificación es la de equipos. */}
        {!isSharedBallFormat(ronda.formato_juego) && (
          <IndividualLeaderboard
            ronda={ronda}
            leaderboard={leaderboard}
            isNetoMode={isNetoMode}
            hasCourse={hasCourse}
            parMap={parMap}
            siMap={siMap}
            courseHcpMap={courseHcpMap}
            displayHcpMap={displayHcpMap}
            fechaDisplay={fechaDisplay}
            expanded={expanded}
            onToggleExpand={(id) => setExpanded(prev => prev === id ? null : id)}
          />
        )}

        {ronda.formato_juego !== 'match_play' && !isFinished && gwi.gwiInputs.length >= 2 && gwi.gwiInputs.some(j => j.hoyosCompletados >= 3) && (
          <GwiPanel ronda={ronda} gwiInputs={gwi.gwiInputs} />
        )}

        {timelineEvents.length > 0 && (
          <RecentTimeline
            ronda={ronda}
            timelineEvents={timelineEvents}
            parMap={parMap}
            siMap={siMap}
            courseHcpMap={courseHcpMap}
            isFinished={isFinished}
            timeSinceUpdate={timeSinceUpdate}
          />
        )}

        {!isFinished && <RefreshStatus isRealtimeConnected={isRealtimeConnected} countdown={countdown} />}

        {/* Compartir unificado en ambos estados: UN primario + ghost "Copiar link".
            Finalizada: el primario vive en el cuadro ganador. En curso: el primario
            es "Compartir resultado actual" (dorado). */}
        {!isFinished && hayDatos && (
          <ShareLeaderboardButton isFinished={isFinished} onShare={() => shareLeaderboard(isFinished)} />
        )}

        {hayDatos && (
          <button
            onClick={handleCopy}
            aria-label="Copiar enlace de la ronda"
            style={{
              width: '100%', padding: '12px', marginBottom: '12px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#c4992a', fontWeight: 600, fontSize: '14px', minHeight: '44px',
            }}
          >
            {copied ? '✓ Link copiado' : 'Copiar link'}
          </button>
        )}

        {isFinished && (
          <PostRondaLinks isAnonymous={isAnonymous} onRequireAuth={() => requireAuth('Ve tus estadísticas de golf')} />
        )}
      </div>

      {isAdmin && ronda.estado === 'en_curso' && <AdminScoringBar codigo={codigo} />}

      {showBanner && isAnonymous && (
        <RegistrationBanner codigo={codigo} onDismiss={dismissBanner} />
      )}

      {showAuthModal && (
        <AuthModal action={authModalAction} codigo={codigo} onClose={closeAuthModal} />
      )}

      <LiveStyles />
    </div>
  )
}

export default function RondaLibrePage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontFamily: 'DM Sans, sans-serif' }}>Cargando ronda...</div>}>
      <RondaLibrePageContent />
    </Suspense>
  )
}
