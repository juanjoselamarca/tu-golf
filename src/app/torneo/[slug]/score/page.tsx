'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { formatearHandicap } from '@/golf/handicap-index-range'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { TorneoNoEncontrado } from '@/components/torneo/TorneoNoEncontrado'
import { SCORE_STYLES, getScoreResult } from '@/golf/core/colors'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { formatLabel } from '@/golf/core/rules'
import { puntajeDeHoyo, courseHandicapDeScoring } from '@/golf/core/hole-scoring'
import { HCP_PCT_DEFAULT, hcpPctDelTorneo } from '@/golf/core/playing-handicap'
import { isStablefordFormat, resolveFormatoJuego } from '@/golf/formats'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { esTarjetaCerrada } from '@/golf/tournament-rounds'
import { motivoSinScores } from '@/golf/tournament-status'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { useRondaActivaDelJugador } from './hooks/useRondaActivaDelJugador'
import { useGuardadoTorneo } from './hooks/useGuardadoTorneo'
import { elegirJugadorInicial, urlSinJugador } from './hooks/jugador-del-link'
import { useEsperarInicioDelTorneo } from './hooks/useEsperarInicioDelTorneo'
import {
  fetchScoringTournament,
  fetchScoringRoster,
  fetchScoringCourseContext,
  type ScoringPlayer,
  type ScoringTournament,
} from '@/lib/data/tournaments/scoring'
import { getGuestId, getGuestToken } from '@/lib/guest-session'
import { fetchMiJugadorInvitado } from '@/lib/data/tournaments/guest-player'

import type { CourseHole } from '@/golf/leaderboard/types'
import { registerUrl } from '@/lib/auth/login-url'
import { Portal, Z_OVERLAY } from '@/components/ui/Portal'
import { AvisoNoMolestar } from '@/components/ronda/AvisoNoMolestar'
import { claveAvisoTorneo } from '@/hooks/ronda/useAvisoNoMolestar'

type Player = ScoringPlayer
type Tournament = ScoringTournament

/** Nombre visible del jugador: registrado usa profiles.name, invitado usa player_name.
 *  `nombresServidor`: el relleno de `/api/torneos/[slug]/nombres` para el visor SIN
 *  sesión — la policy SELECT de `profiles` es `TO authenticated`, así que el embed
 *  llega null y el selector "¿Quién eres?" quedaba con N filas que decían "Jugador". */
function playerDisplayName(p: Player, nombresServidor: Record<string, string> = {}): string {
  // El del servidor va ANTES de `player_name`: ya es el resultado de
  // `resolveLegacyPlayerName` (perfil → player_name → 'Jugador'), así que nunca
  // es peor. Al revés, un inscrito con cuenta Y `player_name` tipeado por el
  // organizador salía "juanito" acá y "Juan Pérez" en el board: dos etiquetas
  // para la misma tarjeta, justo la confusión que este arreglo vino a cerrar.
  // `||` y no `??`: un nombre en blanco no es un nombre.
  return p.profiles?.name?.trim() || nombresServidor[p.id]?.trim() || p.player_name?.trim() || 'Jugador'
}

/** ¿Falta el nombre de algún inscrito CON cuenta? (visor sin sesión). MISMO
 *  predicado que `nombresFaltantes` de la capa de datos: lo que decide es tener
 *  `user_id` sin nombre de perfil, no si además hay `player_name`. */
function faltanNombres(roster: readonly Player[]): boolean {
  return roster.some((p) => !p.profiles?.name?.trim() && !!p.user_id)
}

export default function PlayerScoringPage() {
  const { slug } = useParams() as { slug: string }
  const router = useRouter()
  const [tournament,    setTournament]    = useState<Tournament | null>(null)
  const [players,       setPlayers]       = useState<Player[]>([])
  /** `players.id` → nombre, servido por `/api/torneos/[slug]/nombres`. Sólo se
   *  pide cuando el roster llegó sin nombres (visor sin sesión). */
  const [nombresServidor, setNombresServidor] = useState<Record<string, string>>({})
  const [courseHoles,   setCourseHoles]   = useState<CourseHole[]>([])
  // Catálogo de tees de la cancha: sin él, el gate WHS no puede resolver el
  // slope/CR del jugador y caería al camino seguro (índice crudo).
  const [courseTees,    setCourseTees]    = useState<CourseTeeRow[]>([])
  const [selectedId,    setSelectedId]    = useState<string>('')
  const [loading,       setLoading]       = useState(true)
  // Falló la carga (red, no "torneo inexistente"). `loadNonce` re-dispara el
  // efecto sin recargar la página: en cancha, recargar es perder el teclado
  // abierto y varios segundos.
  const [loadError,     setLoadError]     = useState(false)
  const [loadNonce,     setLoadNonce]     = useState(0)
  // Modal de registro post-ronda para invitados
  const [showRegisterModal, setShowRegisterModal] = useState(false)

  // Guest session info (read once on mount)
  const guestId = useMemo(() => getGuestId(), [])
  const guestTokenValue = useMemo(() => getGuestToken(), [])
  const isGuest = !!guestId && !!guestTokenValue

  const selectedPlayerEarly = players.find(p => p.id === selectedId)
  // La ronda ACTIVA del jugador y la cancha en que SE JUEGA (multi-ronda: la
  // ronda 2 puede ser otra cancha). Nunca `rounds[0]` ni la cancha de la ronda 1.
  const base = useMemo(() => ({ holes: courseHoles, tees: courseTees }), [courseHoles, courseTees])
  const ronda = useRondaActivaDelJugador({ slug, tournament, player: selectedPlayerEarly, base })
  const rondaCtx = ronda.ctx
  const hoyosRonda = useMemo(() => rondaCtx?.courseHoles ?? [], [rondaCtx])
  const holeCountRonda = rondaCtx?.holeCount ?? (tournament?.hole_count || 18)
  const roundIdForSync = ronda.round?.id ?? null
  // Tarjeta cerrada (fuente única `esTarjetaCerrada`): sólo lectura. El
  // organizador cerró la ronda o el torneo; al abrir la siguiente, el roster
  // recargado trae la tarjeta nueva y el scorer vuelve a escribir.
  const rondaCerrada = esTarjetaCerrada(ronda.round?.status)

  /** Recarga sólo el roster (tarjetas/status), sin la pantalla de "Cargando". */
  const reloadRoster = useCallback(async () => {
    if (!tournament) return
    try {
      setPlayers(await fetchScoringRoster(createClient(), tournament.id))
    } catch (e) {
      void captureError(e, { context: 'torneo.score.reloadRoster', meta: { slug } })
    }
  }, [tournament, slug])

  // Con la tarjeta cerrada, el jugador suele estar esperando que el organizador
  // abra la ronda siguiente: se refresca el roster cada 30 s para no quedar
  // escribiendo (o mirando) la ronda 1.
  // Sólo si QUEDA una ronda por abrir (en la última, o en un torneo de una
  // ronda, no hay nada que esperar) y sólo con la pestaña visible.
  const hayRondaSiguiente = (ronda.round?.round_number ?? 1) < (tournament?.total_rounds ?? 1)
  useEffect(() => {
    if (!rondaCerrada || !hayRondaSiguiente) return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void reloadRoster()
    }, 30_000)
    return () => clearInterval(id)
  }, [rondaCerrada, hayRondaSiguiente, reloadRoster])

  /**
   * El handicap con el que se REPARTEN los golpes en este torneo.
   *
   * Gate por torneo (`hcp_calc_mode`, decisión 28-may-2026): 'whs' → course
   * handicap WHS resuelto por el tee del jugador; cualquier otro → índice crudo.
   * Es el MISMO gate que usan el scorer del organizador y el board público. Los
   * tres tienen que repartir idéntico: esta pantalla PERSISTE `net_score` y
   * `points`, así que un handicap propio acá no era una discrepancia de display
   * — dejaba el número equivocado guardado en la base.
   *
   * El par que entra es el de los hoyos JUGADOS, no el de la cancha: con el CR
   * de 9 hoyos contra un par de 18, la fórmula WHS devuelve handicaps negativos.
   */
  const courseHcpDe = useCallback((player: Player): number => {
    if (!tournament || !rondaCtx) return 0
    return courseHandicapDeScoring({
      mode: tournament.hcp_calc_mode,
      player,
      // La cancha de LA RONDA: ratings, tees y hoyos de donde se juega.
      tournament: rondaCtx.tournament,
      courseTees: rondaCtx.courseTees,
      courseHoles: rondaCtx.courseHoles,
      holeCount: rondaCtx.holeCount,
      hcpPct: hcpPctDelTorneo(tournament),
    })
  }, [tournament, rondaCtx])

  // Guardado de la tarjeta: carga, envío por hoyo, cola local y reenvío (401/403 con aviso y salida).
  const {
    currentScores, savedHoles, isOnline, saveStatus, saveError, limpiarSaveError,
    sinAcceso, torneoInactivo, guardarHoyo, hoyosEnCola,
  } = useGuardadoTorneo({
    slug, tournament, player: selectedPlayerEarly, roundId: roundIdForSync, contextoListo: !!rondaCtx,
    hoyosRonda, holeCount: holeCountRonda, courseHcpDe,
    bloqueado: rondaCerrada || (!!tournament && !!motivoSinScores(tournament.status)),
    guestId, guestToken: guestTokenValue,
    onRondaCerrada: () => { void reloadRoster() },
    onInvitadoCompleto: () => setShowRegisterModal(true),
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        const supabase = createClient()
        const t = await fetchScoringTournament(supabase, slug)
        if (cancelled) return
        if (!t) { setLoading(false); return }
        // Demo torneos son spectator-only — redirigir al leaderboard público.
        if (t.es_demo) {
          router.replace(`/torneo/${slug}`)
          return
        }
        setTournament(t)

        const [roster, courseCtx] = await Promise.all([
          fetchScoringRoster(supabase, t.id),
          t.courses?.id
            ? fetchScoringCourseContext(supabase, t.courses.id)
            : Promise.resolve({ holes: [] as CourseHole[], tees: [] as CourseTeeRow[] }),
        ])
        if (cancelled) return

        setPlayers(roster)
        // Sin sesión, el roster llega sin nombres: se piden al servidor para que el
        // selector no muestre N filas idénticas (y nadie anote en la tarjeta de otro).
        if (faltanNombres(roster)) {
          void (async () => {
            try {
              const res = await fetch(`/api/torneos/${encodeURIComponent(slug)}/nombres`, { cache: 'no-store' })
              if (!res.ok) return
              const body = (await res.json()) as { nombres?: Record<string, string> }
              if (!cancelled && body.nombres) setNombresServidor(body.nombres)
            } catch {
              // Sin nombres el selector sigue usable con el HCP: no se bloquea la tarjeta.
            }
          })()
        }
        // Catálogo CRUDO de la cancha del torneo: la expansión a los hoyos de
        // la ronda la hace `useRondaActivaDelJugador` con la cancha de ESA ronda.
        setCourseHoles(courseCtx.holes)
        setCourseTees(courseCtx.tees)

        setLoading(false)

        // Tarjeta que se abre sola: la del link `?jugador=` (vuelta del login del aviso "Inicia sesión
        // para guardar", reenvía sola lo pendiente) y, sin link, la del invitado. Va FUERA del
        // Promise.all de arriba a propósito: /guest-player depende de la red y no debe retrasar la
        // pantalla. Sin auto-selección si falla: el jugador elige su nombre en la lista.
        void elegirJugadorInicial({
          search: window.location.search,
          roster,
          buscarInvitado: guestId && guestTokenValue ? () => fetchMiJugadorInvitado(slug, guestId, guestTokenValue) : null,
        })
          .then((eleccion) => {
            if (cancelled || !eleccion) return
            setSelectedId(eleccion.id)
            // Usado una vez: recargar el roster después no vuelve a forzar esa tarjeta.
            if (eleccion.desdeLink) window.history.replaceState(window.history.state, '', urlSinJugador(window.location.href))
          })
          .catch((e) => {
            void captureError(e, { context: 'torneo.score.guestPlayer', meta: { slug } })
          })
      } catch (e) {
        void captureError(e, { context: 'torneo.score.load', meta: { slug } })
        if (!cancelled) {
          setLoadError(true)
          setLoading(false)
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [slug, loadNonce, guestId, guestTokenValue])

  // "Podrás anotar cuando el organizador lo inicie": se cumple sin recargar (en el tee nadie recarga).
  useEsperarInicioDelTorneo({
    tournamentId: tournament?.id,
    esperando: !!tournament && !torneoInactivo && motivoSinScores(tournament.status) === 'no_empezo',
    onCambio: () => setLoadNonce(n => n + 1),
  })

  if (loading) return <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>Cargando...</div>
  if (loadError) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-2)', fontSize: '15px', margin: 0, maxWidth: '320px' }}>
        No pudimos cargar el torneo. Revisa tu conexión — los hoyos que ya guardaste están a salvo.
      </p>
      <button type="button" onClick={() => setLoadNonce(n => n + 1)}
        style={{ padding: '12px 24px', background: 'rgba(196,153,42,0.12)', border: '1px solid rgba(196,153,42,0.35)', borderRadius: '10px', color: 'var(--brand-on-bg)', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
        Reintentar
      </button>
    </div>
  )
  if (!tournament) return <div style={{ background: 'var(--bg)', minHeight: '100vh' }}><TorneoNoEncontrado /></div>

  const selectedPlayer = players.find(p => p.id === selectedId)
  const holeCount = holeCountRonda
  const esStableford = isStablefordFormat(resolveFormatoJuego(tournament))
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1)
  // Se sabe desde que carga, no después de un 409: un torneo con inscripciones abiertas no es un torneo cerrado.
  const sinScores = torneoInactivo ? 'cerrado' : motivoSinScores(tournament.status)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: '40px' }}>
      {/* Header */}
      <div data-theme="dark" style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <Link href={`/torneo/${tournament.slug}`} style={{ color: 'var(--text-2)', fontSize: '12px', textDecoration: 'none' }}>← Leaderboard</Link>
          {saveStatus !== 'idle' && (() => {
            const pendingCount = !isOnline || saveStatus === 'error' ? hoyosEnCola() : 0
            const colors = {
              saving:  { bg: 'rgba(196,153,42,0.15)', fg: 'var(--brand-on-bg)', label: 'Guardando...' },
              saved:   { bg: 'rgba(0,230,118,0.15)',  fg: 'var(--status-live-fg)', label: '✓ Guardado' },
              offline: { bg: 'rgba(252,211,77,0.15)', fg: 'var(--bogey)', label: pendingCount > 0 ? `Offline — ${pendingCount} en cola` : 'Sin conexión' },
              error:   { bg: 'rgba(239,68,68,0.15)',  fg: 'var(--double)', label: pendingCount > 0 ? `Reintentando (${pendingCount})` : 'Error' },
              sin_acceso: { bg: 'rgba(239,68,68,0.15)', fg: 'var(--double)', label: 'No guardado' },
              idle:    { bg: 'transparent', fg: 'transparent', label: '' },
            } as const
            const s = colors[saveStatus]
            return (
              <span style={{ fontSize: '12px', color: s.fg, background: s.bg, padding: '4px 10px', borderRadius: '8px', fontWeight: 600 }}>
                {s.label}
              </span>
            )
          })()}
          {saveError && (
            <button onClick={limpiarSaveError} style={{ fontSize: '12px', color: 'var(--double)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', marginLeft: '8px' }}>
              {saveError}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: 'var(--text)', margin: '0 0 2px' }}>{tournament.name}</h1>
            {selectedPlayer && <p style={{ fontSize: '13px', color: 'var(--brand-on-bg)', margin: 0 }}>{playerDisplayName(selectedPlayer, nombresServidor)} · HCP {selectedPlayer.handicap_at_registration != null ? formatearHandicap(selectedPlayer.handicap_at_registration) : '—'}{tournament && hcpPctDelTorneo(tournament) !== HCP_PCT_DEFAULT && ` · juega con ${formatearHandicap(courseHcpDe(selectedPlayer))} (${hcpPctDelTorneo(tournament)} %)`}</p>}
          </div>
          {tournament.formato_juego && (
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(196,153,42,0.12)',
              color: 'var(--score-bogey-fg)',
              fontSize: '10px',
              fontWeight: 600,
              fontFamily: '"DM Mono", monospace',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {formatLabel(tournament.formato_juego, tournament.modo_juego)}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '24px 16px', maxWidth: '500px', margin: '0 auto' }}>
        {/* Player select */}
        {!selectedId && (
          <div data-theme="dark" style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: 'var(--text)', margin: '0 0 16px' }}>¿Quién eres?</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {players.map(p => (
                <button key={p.id} type="button" onClick={() => setSelectedId(p.id)}
                  style={{ padding: '14px 16px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '10px', color: 'var(--text)', fontSize: '16px', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 180ms' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#c4992a'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(122,143,168,0.2)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(7,13,24,0.5)' }}>
                  {playerDisplayName(p, nombresServidor)}
                  {p.handicap_at_registration != null && <span style={{ color: 'var(--text-2)', fontSize: '13px', marginLeft: '8px' }}>HCP {formatearHandicap(p.handicap_at_registration)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scorecard */}
        {/* Sin la cancha de la ronda no se muestra la tarjeta: puntuar con el
            par/slope de otra cancha deja el neto mal guardado. */}
        {selectedPlayer && !rondaCtx && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-2)', fontSize: '15px' }}>
            {ronda.error ? (
              <>
                <p style={{ margin: '0 0 16px' }}>No pudimos cargar la cancha de la ronda {ronda.round?.round_number ?? 1}.</p>
                <button type="button" onClick={ronda.retry}
                  style={{ padding: '12px 24px', background: 'rgba(196,153,42,0.12)', border: '1px solid rgba(196,153,42,0.35)', borderRadius: '10px', color: 'var(--brand-on-bg)', fontSize: '15px', fontWeight: 600, cursor: 'pointer', minHeight: '44px' }}>
                  Reintentar
                </button>
              </>
            ) : (
              <p style={{ margin: 0 }}>Cargando la cancha de la ronda...</p>
            )}
          </div>
        )}
        {selectedPlayer && rondaCtx && (
          <>
            <button type="button" onClick={() => setSelectedId('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '14px', cursor: 'pointer', marginBottom: '8px', padding: '0 12px 0 0', minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>
              ← Cambiar jugador
            </button>
            {sinAcceso && (
              <div role="alert" style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 }}>
                <strong>{sinAcceso.titulo}.</strong> {sinAcceso.detalle}
                <Link href={sinAcceso.href} style={{ display: 'flex', width: 'fit-content', alignItems: 'center', minHeight: '44px', marginTop: '2px', color: 'var(--brand-on-bg)', fontWeight: 700, textDecoration: 'none' }}>
                  {sinAcceso.cta} →
                </Link>
              </div>
            )}
            {sinScores === 'no_empezo' && !rondaCerrada && (
              <div role="status" style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(196,153,42,0.10)', border: '1px solid rgba(196,153,42,0.35)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 }}>
                <strong>El torneo todavía no empieza.</strong> Podrás anotar tu score cuando el organizador lo inicie.
              </div>
            )}
            {sinScores === 'cerrado' && !rondaCerrada && (
              <div role="status" style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(196,153,42,0.10)', border: '1px solid rgba(196,153,42,0.35)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 }}>
                <strong>Torneo cerrado.</strong> Ya no acepta scores; la tarjeta es sólo lectura.
              </div>
            )}
            {rondaCerrada && (
              <div role="status" style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(196,153,42,0.10)', border: '1px solid rgba(196,153,42,0.35)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 }}>
                <strong>Ronda {ronda.round?.round_number ?? 1} cerrada.</strong> La tarjeta es sólo lectura. Cuando el organizador abra la siguiente ronda, aparece acá sola.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {holes.map(holeNum => {
                const hole    = hoyosRonda.find(h => h.numero === holeNum)
                const par     = hole?.par ?? 4
                const si      = normalizedStrokeIndexByHole(hoyosRonda, holeCount)[holeNum] ?? holeNum
                const gross   = currentScores[holeNum]
                const isSaved = savedHoles.has(holeNum)
                const diff    = gross != null ? gross - par : null
                const sr = getScoreResult(gross, par)
                const ss = SCORE_STYLES[sr]
                const bg = gross != null ? ss.bg : 'var(--bg-surface)'
                const border = gross != null ? `${ss.borderWidth} solid ${ss.border}` : '1px solid rgba(122,143,168,0.2)'

                let stablefordPoints = null
                if (gross != null && selectedPlayer && esStableford) {
                  stablefordPoints = puntajeDeHoyo({
                    gross, par, courseHandicap: courseHcpDe(selectedPlayer), strokeIndex: si,
                    holeCount, formato: tournament, modo: tournament.modo_juego,
                  }).puntos
                }

                return (
                  <div key={holeNum} style={{ background: bg, border, borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 200ms' }}>
                    <div>
                      <div style={{ color: 'var(--text-2)', fontSize: '12px', marginBottom: '2px' }}>Hoyo {holeNum}</div>
                      <div style={{ color: 'var(--text)', fontSize: '14px' }}>Par {par}{hole?.stroke_index ? ` · SI ${hole.stroke_index}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        {isSaved && gross != null && <span style={{ fontSize: '12px', color: 'var(--status-live-fg)' }}>✓</span>}
                        {stablefordPoints != null && (
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--brand-on-bg)', fontFamily: '"DM Mono", monospace' }}>
                            {stablefordPoints} pts
                          </div>
                        )}
                      </div>
                      <input
                        type="number" min={1} max={19} inputMode="numeric"
                        disabled={rondaCerrada || sinScores !== null}
                        defaultValue={gross ?? ''}
                        key={`${selectedId}-${holeNum}-${gross}`}
                        onBlur={(e) => { void guardarHoyo(holeNum, e.target.value) }}
                        style={{ width: '64px', height: '56px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '10px', color: 'var(--text)', textAlign: 'center', fontSize: '24px', fontWeight: 700, outline: 'none', appearance: 'textfield' as React.CSSProperties['appearance'] }}
                        placeholder="—"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Aviso "No molestar": una vez por ronda del torneo, cuando la tarjeta ya acepta golpes. */}
      <AvisoNoMolestar claveRonda={selectedPlayer && rondaCtx && !rondaCerrada && !sinScores ? claveAvisoTorneo(ronda.round?.id) : null} />

      {/* Modal de registro post-ronda para invitados */}
      {showRegisterModal && isGuest && (
        <Portal>
          <div style={{
            position: 'fixed', inset: 0, zIndex: Z_OVERLAY,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}>
            <div style={{
              background: 'var(--bg)', borderRadius: '16px', padding: '32px 24px',
              maxWidth: '380px', width: '100%', textAlign: 'center',
              border: '1px solid var(--surface-border)',
            }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: 'rgba(196,153,42,0.15)', border: '1.5px solid rgba(196,153,42,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: '24px',
              }}>
                ⛳
              </div>
              <h2 style={{
                fontFamily: '"Playfair Display", serif', fontSize: '22px',
                color: 'var(--text)', fontWeight: 700, margin: '0 0 8px',
              }}>
                ¡Ronda completa!
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 24px', lineHeight: '1.5' }}>
                Crea tu cuenta gratis para guardar tu historial, seguir tu handicap y activar tu coach de golf con IA.
              </p>
              <Link
                href={registerUrl(`/torneo/${slug}`)}
                style={{
                  display: 'block', width: '100%', padding: '14px',
                  background: '#c4992a', color: 'var(--brand-dark)',
                  fontWeight: 700, fontSize: '15px', borderRadius: '10px',
                  textDecoration: 'none', textAlign: 'center',
                  marginBottom: '12px',
                }}
              >
                Crear cuenta gratis
              </Link>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--text-2)', fontSize: '13px',
                  cursor: 'pointer', textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                No, gracias — ver resultados
              </button>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
