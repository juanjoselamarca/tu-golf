'use client'

import { useEffect, useReducer, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { copyToClipboard } from '@/lib/clipboard'
import { setActiveRondaSession } from '@/components/LiveRoundIndicator'
import { getNotifPrefs, setNotifPrefs, isPushSupported, requestPermission } from '@/lib/push-notifications'
import { buildTimelineEvents } from '@/lib/ronda/helpers'
import { computeHighlights } from '@/lib/ronda/round-highlights'
import { compartirLeaderboard } from '@/lib/share-card'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import { buildMatchResult } from '@/lib/ronda/match'
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
import { ShareButtons } from './components/ShareButtons'
import { ShareLeaderboardButton } from './components/ShareLeaderboardButton'
import { AdminInfoBanner, PostRondaLinks, AdminScoringBar, RegistrationBanner } from './components/FooterBars'
import { LiveStyles } from './components/LiveStyles'

const TEAM_FORMATS = ['best_ball', 'scramble', 'foursome']
const SITE_URL = 'https://golfersplus.vercel.app'

function RondaLibrePageContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const codigo = params.codigo as string
  const finishedParam = searchParams.get('finished') === 'true'

  // UI state local.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [, forceRender] = useReducer((x: number) => x + 1, 0)

  // Datos + live engine + GWI + identidad del espectador.
  const gwi = useGWI(codigo)
  const live = useRondaLibreLive(codigo, gwi.refetch)
  const viewer = useViewer(codigo)

  const {
    ronda, parMap, siMap, courseHcpMap, equipos,
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
  const isTeamFormat = TEAM_FORMATS.includes(ronda.formato_juego)

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
  const shareLeaderboard = (finished: boolean) =>
    compartirLeaderboard(buildLeaderboardShareData({
      ronda, leaderboard, equipos, parMap, siMap, courseHcpMap, fechaDisplay, codigo, isFinished: finished,
    }))

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
          <MatchPlayWinner ronda={ronda} mr={mr} courseHcpMap={courseHcpMap} onShare={handleShare} />
        )}

        {/* RoundHighlights — solo para el jugador autenticado */}
        {isFinished && currentUserId && (() => {
          const myPlayer = ronda.ronda_libre_jugadores.find(j => j.user_id === currentUserId)
          if (!myPlayer) return null
          const myScores: Record<number, number> = {}
          if (myPlayer.scores) {
            for (const [k, v] of Object.entries(myPlayer.scores)) {
              const n = typeof v === 'number' ? v : Number(v)
              if (n > 0) myScores[parseInt(k)] = n
            }
          }
          const hData = computeHighlights(myScores, parMap, ronda.holes)
          if (hData.holesPlayed === 0) return null
          return (
            <RoundHighlights data={hData} scores={myScores} parMap={parMap} totalHoles={ronda.holes} />
          )
        })()}

        {isFinished && ronda.formato_juego !== 'match_play' && leaderboard.length > 0 && leaderboard[0].holesPlayed > 0 && (
          <WinnerCelebration ronda={ronda} leaderboard={leaderboard} fechaDisplay={fechaDisplay} onShare={() => shareLeaderboard(true)} />
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
          <MatchPlayCard ronda={ronda} mr={mr} courseHcpMap={courseHcpMap} />
        )}

        <CourseInfoCard ronda={ronda} fechaDisplay={fechaDisplay} />

        {isTeamFormat && (
          <TeamLeaderboards ronda={ronda} equipos={equipos} parMap={parMap} siMap={siMap} />
        )}

        <IndividualLeaderboard
          ronda={ronda}
          leaderboard={leaderboard}
          isNetoMode={isNetoMode}
          hasCourse={hasCourse}
          parMap={parMap}
          siMap={siMap}
          courseHcpMap={courseHcpMap}
          fechaDisplay={fechaDisplay}
          expanded={expanded}
          onToggleExpand={(id) => setExpanded(prev => prev === id ? null : id)}
        />

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

        <ShareButtons onShare={handleShare} onCopy={handleCopy} copied={copied} />

        {!isFinished && leaderboard.length > 0 && leaderboard.some(j => j.holesPlayed > 0) && (
          <ShareLeaderboardButton isFinished={isFinished} onShare={() => shareLeaderboard(isFinished)} />
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
