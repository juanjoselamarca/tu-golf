'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { SCORE_STYLES, getScoreResult } from '@/golf/core/colors'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { useScoreSync } from '@/hooks/useScoreSync'
import { formatLabel } from '@/golf/core/rules'
import { puntajeDeHoyo } from '@/golf/core/hole-scoring'
import { resolveScoringCourseHcp } from '@/golf/core/compute-player-course-hcp'
import { parDeLosHoyosJugados } from '@/golf/core/course-handicap'
import { isStablefordFormat, resolveFormatoJuego } from '@/golf/formats'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import {
  fetchScoringTournament,
  fetchScoringRoster,
  fetchScoringCourseContext,
  fetchRoundHoleScores,
  type ScoringPlayer,
  type ScoringTournament,
} from '@/lib/data/tournaments/scoring'

interface CourseHole { numero: number; par: number; stroke_index: number }
type Player = ScoringPlayer
type Tournament = ScoringTournament

export default function PlayerScoringPage() {
  const { slug } = useParams() as { slug: string }
  const router = useRouter()
  const [tournament,    setTournament]    = useState<Tournament | null>(null)
  const [players,       setPlayers]       = useState<Player[]>([])
  const [courseHoles,   setCourseHoles]   = useState<CourseHole[]>([])
  // Catálogo de tees de la cancha: sin él, el gate WHS no puede resolver el
  // slope/CR del jugador y caería al camino seguro (índice crudo).
  const [courseTees,    setCourseTees]    = useState<CourseTeeRow[]>([])
  const [selectedId,    setSelectedId]    = useState<string>('')
  const [currentScores, setCurrentScores] = useState<Record<number, number>>({})
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [savedHoles,    setSavedHoles]    = useState<Set<number>>(new Set())
  const [isOnline,      setIsOnline]      = useState(true)
  type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const retryCountRef = useRef(0)

  const selectedPlayerEarly = players.find(p => p.id === selectedId)
  const roundIdForSync = selectedPlayerEarly?.rounds?.[0]?.id ?? null
  const scoreSync = useScoreSync(slug, roundIdForSync)

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
    if (!tournament) return 0
    const holeCount = tournament.hole_count || 18
    return resolveScoringCourseHcp(
      tournament.hcp_calc_mode,
      player,
      tournament,
      courseTees,
      parDeLosHoyosJugados(courseHoles, holeCount),
      holeCount,
    )
  }, [tournament, courseTees, courseHoles])

  useEffect(() => {
    const load = async () => {
      // MISMAS queries que el scorer del organizador (`src/lib/data/tournaments/scoring.ts`).
      // Las dos pantallas escriben el mismo `net_score`: si cada una trajera su
      // propio subconjunto de columnas, volverían a repartir handicaps distintos
      // — que es exactamente el bug que este fix cierra.
      const supabase = createClient()
      const t = await fetchScoringTournament(supabase, slug)
      if (!t) { setLoading(false); return }
      // Demo torneos son spectator-only — redirigir al leaderboard público.
      if (t.es_demo) {
        router.replace(`/torneo/${slug}`)
        return
      }
      setTournament(t)
      setPlayers(await fetchScoringRoster(supabase, t.id))
      if (t.courses?.id) {
        const { holes, tees } = await fetchScoringCourseContext(supabase, t.courses.id)
        // Los hoyos de la RONDA, no los del catálogo: una cancha de 9 hoyos en un
        // torneo de 18 se recorre dos veces y los hoyos 10-18 son los 1-9 otra
        // vez, con su par y su dificultad reales (`@/golf/courses/vueltas`).
        // Antes se pedían 18 a un catálogo de 9 y cada `find` fallaba: par 4 fijo
        // y stroke index = número de hoyo, o sea birdies mal contados y golpes de
        // handicap repartidos en el hoyo equivocado durante media vuelta.
        setCourseHoles(hoyosDeLaVuelta(holes, t.hole_count || 18))
        setCourseTees(tees)
      }
      setLoading(false)
    }
    load()
  }, [slug])

  const loadScores = useCallback(async (playerId: string) => {
    const player = players.find(p => p.id === playerId)
    const roundId = player?.rounds?.[0]?.id
    if (!roundId) { setCurrentScores({}); return }
    const supabase = createClient()
    const data = await fetchRoundHoleScores(supabase, roundId)
    const map: Record<number, number> = {}
    data.forEach((s) => { if (s.gross_score != null) map[s.hole_number] = s.gross_score })
    // Merge pending local scores (offline/failed saves) so no input is lost on reload
    try {
      const raw = localStorage.getItem(`golfers_score_${slug}_${roundId}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.sincronizado === false && parsed.scores) {
          Object.entries(parsed.scores as Record<string, number>).forEach(([h, g]) => { map[Number(h)] = Number(g) })
          setSaveStatus(typeof navigator !== 'undefined' && navigator.onLine ? 'error' : 'offline')
        }
      }
    } catch { /* silent */ }
    setCurrentScores(map)
  }, [players, slug])

  useEffect(() => { if (selectedId) loadScores(selectedId) }, [selectedId, loadScores])

  const submitHoleScore = useCallback(async (
    tourneyId: string,
    roundId: string,
    holeNumber: number,
    gross: number,
    par: number,
    netScore: number,
    points: number,
  ): Promise<boolean> => {
    let attempts = 0
    while (attempts < 3) {
      try {
        const res = await fetch('/api/game', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upsert_score', tournament_id: tourneyId, round_id: roundId, hole_number: holeNumber, par, gross_score: gross, net_score: netScore, points }),
        })
        if (res.ok) return true
      } catch {
        // network error — retry
      }
      attempts++
      if (attempts < 3) await new Promise(r => setTimeout(r, 400 * attempts))
    }
    return false
  }, [])

  const handleScoreChange = async (holeNumber: number, value: string) => {
    const gross = parseInt(value)
    if (isNaN(gross) || gross < 1 || gross > 20 || !tournament || !selectedId) return
    const player = players.find(p => p.id === selectedId)
    const round  = player?.rounds?.[0]
    if (!round) return
    const hole       = courseHoles.find(h => h.numero === holeNumber)
    const par        = hole?.par ?? 4
    // SI normalizado (permutación 1..N) para alocar golpes: Σ == course handicap
    // aunque el SI sea 18h-impar en un loop de 9h. El SI mostrado se mantiene crudo.
    const si         = normalizedStrokeIndexByHole(courseHoles, tournament.hole_count || 18)[holeNumber] ?? holeNumber
    const holeCount  = tournament.hole_count || 18
    const hcpJugador = player.handicap_at_registration ?? 0
    const { neto: netScore, puntos: points } = puntajeDeHoyo({
      gross, par, courseHandicap: hcpJugador, strokeIndex: si, holeCount,
      formato: tournament,
    })

    const nextScores = { ...currentScores, [holeNumber]: gross }
    setCurrentScores(nextScores)
    // Backup local SIEMPRE primero (funciona sin internet)
    scoreSync.guardarLocal(nextScores)
    retryCountRef.current = 0

    if (!isOnline) {
      setSaveStatus('offline')
      return
    }

    setSaving(true)
    setSaveStatus('saving')
    setSaveError(null)
    const ok = await submitHoleScore(tournament.id, round.id, holeNumber, gross, par, netScore, points)
    if (ok) {
      setSavedHoles(prev => new Set(prev).add(holeNumber))
      setSaveStatus('saved')
      scoreSync.marcarSincronizado()
    } else {
      setSaveStatus('error')
      addToast({ type: 'error', title: `Error hoyo ${holeNumber}`, message: 'Score guardado localmente. Se sincronizará al recuperar la conexión.', duration: 6000 })
      setSaveError(`Error guardando hoyo ${holeNumber}. Reintentando al reconectar.`)
    }
    setSaving(false)
  }

  /* ── Online/offline + auto-sync al reconectar ── */
  useEffect(() => {
    const up = () => {
      setIsOnline(true)
      if (!tournament || !roundIdForSync || !selectedPlayerEarly) return
      if (!scoreSync.tienePendientes() || scoreSync.syncInProgressRef.current) return
      scoreSync.syncInProgressRef.current = true
      const pending = scoreSync.obtenerLocal()
      ;(async () => {
        try {
          if (!pending) return
          const holeCount = tournament.hole_count || 18
          const courseHandicap = courseHcpDe(selectedPlayerEarly)
          const siAlloc = normalizedStrokeIndexByHole(courseHoles, holeCount)
          let failed = 0
          for (const [h, g] of Object.entries(pending)) {
            const holeNumber = Number(h)
            const hole = courseHoles.find(ch => ch.numero === holeNumber)
            const par = hole?.par ?? 4
            const si = siAlloc[holeNumber] ?? holeNumber
            const { neto: netScore, puntos: points } = puntajeDeHoyo({
              gross: g, par, courseHandicap, strokeIndex: si, holeCount,
              formato: tournament,
            })
            const ok = await submitHoleScore(tournament.id, roundIdForSync, holeNumber, g, par, netScore, points)
            if (!ok) failed++
            else setSavedHoles(prev => new Set(prev).add(holeNumber))
          }
          if (failed === 0) {
            scoreSync.marcarSincronizado()
            setSaveStatus('saved')
            addToast({ type: 'success', title: 'Sincronizado', message: `${Object.keys(pending).length} hoyos guardados`, duration: 3000 })
          } else {
            setSaveStatus('error')
          }
        } finally {
          scoreSync.syncInProgressRef.current = false
        }
      })()
    }
    const down = () => { setIsOnline(false); setSaveStatus('offline') }
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
    // `courseHcpDe` va en las deps a propósito: sin él, el re-sync se quedaría
    // con el closure del primer render — `courseTees` vacío — y los hoyos que
    // quedaron en cola offline se sincronizarían con el índice crudo. El bug
    // volvería justo en el peor momento: sin señal, a mitad de cancha.
  }, [tournament, roundIdForSync, selectedPlayerEarly, courseHoles, scoreSync, submitHoleScore, courseHcpDe])

  if (loading) return <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>Cargando...</div>
  if (!tournament) return <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fca5a5' }}>Torneo no encontrado.</div>

  const selectedPlayer = players.find(p => p.id === selectedId)
  const holeCount = tournament.hole_count || 18
  // Predicado canónico: `formato_juego` y `format` discrepan en 4 torneos de
  // prod, y esta pantalla miraba sólo la primera.
  const esStableford = isStablefordFormat(resolveFormatoJuego(tournament))
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: '40px' }}>
      {/* Header — superficie navy fija (hero broadcast): data-theme="dark" para que
          los tokens de texto (nombre del torneo, link) resuelvan claros en tema claro
          del usuario. Sin esto quedaban oscuros e invisibles sobre el navy. */}
      <div data-theme="dark" style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <Link href={`/torneo/${tournament.slug}`} style={{ color: 'var(--text-2)', fontSize: '12px', textDecoration: 'none' }}>← Leaderboard</Link>
          {saveStatus !== 'idle' && (() => {
            const pending = !isOnline || saveStatus === 'error' ? scoreSync.obtenerLocal() : null
            const pendingCount = pending ? Object.keys(pending).length : 0
            const colors = {
              saving:  { bg: 'rgba(196,153,42,0.15)', fg: '#c4992a', label: 'Guardando...' },
              saved:   { bg: 'rgba(0,230,118,0.15)',  fg: '#00e676', label: '✓ Guardado' },
              offline: { bg: 'rgba(252,211,77,0.15)', fg: '#fcd34d', label: pendingCount > 0 ? `Offline — ${pendingCount} en cola` : 'Sin conexión' },
              error:   { bg: 'rgba(239,68,68,0.15)',  fg: '#fca5a5', label: pendingCount > 0 ? `Reintentando (${pendingCount})` : 'Error' },
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
            <button onClick={() => setSaveError(null)} style={{ fontSize: '12px', color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', marginLeft: '8px' }}>
              {saveError}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: 'var(--text)', margin: '0 0 2px' }}>{tournament.name}</h1>
            {selectedPlayer && <p style={{ fontSize: '13px', color: '#c4992a', margin: 0 }}>{selectedPlayer.profiles?.name} · HCP {selectedPlayer.handicap_at_registration ?? '—'}</p>}
          </div>
          {tournament.formato_juego && (
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(196,153,42,0.12)',
              color: '#92400e',
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
        {/* Player select — card navy: data-theme="dark" para legibilidad en tema claro. */}
        {!selectedId && (
          <div data-theme="dark" style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: 'var(--text)', margin: '0 0 16px' }}>¿Quién eres?</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {players.map(p => (
                <button key={p.id} type="button" onClick={() => setSelectedId(p.id)}
                  style={{ padding: '14px 16px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '10px', color: 'var(--text)', fontSize: '16px', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 180ms' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#c4992a'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(122,143,168,0.2)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(7,13,24,0.5)' }}>
                  {p.profiles?.name}
                  {p.handicap_at_registration != null && <span style={{ color: 'var(--text-2)', fontSize: '13px', marginLeft: '8px' }}>HCP {p.handicap_at_registration}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scorecard */}
        {selectedPlayer && (
          <>
            <button type="button" onClick={() => { setSelectedId(''); setCurrentScores({}); setSavedHoles(new Set()) }}
              style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>
              ← Cambiar jugador
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {holes.map(holeNum => {
                const hole    = courseHoles.find(h => h.numero === holeNum)
                const par     = hole?.par ?? 4
                // SI normalizado sólo para alocar golpes (stableford); el SI que se
                // muestra abajo usa hole.stroke_index crudo.
                const si      = normalizedStrokeIndexByHole(courseHoles, tournament.hole_count || 18)[holeNum] ?? holeNum
                const gross   = currentScores[holeNum]
                const isSaved = savedHoles.has(holeNum)
                const diff    = gross != null ? gross - par : null
                const sr = getScoreResult(gross, par)
                const ss = SCORE_STYLES[sr]
                // Hoyo sin score: superficie neutra theme-aware (no navy hardcodeado —
                // rompía el texto var(--text) en tema claro). En dark, --bg-surface ≈ el
                // navy anterior, así que el look oscuro se preserva.
                const bg = gross != null ? ss.bg : 'var(--bg-surface)'
                const border = gross != null ? `${ss.borderWidth} solid ${ss.border}` : '1px solid rgba(122,143,168,0.2)'

                // Calculate Stableford points if it's stableford format and we have a score
                // Los puntos que ve el jugador salen del MISMO cálculo que los
                // que se persisten — antes esta vista los recomputaba aparte.
                // Los puntos que ve el jugador salen del MISMO cálculo que los
                // que se persisten — antes esta vista los recomputaba aparte, y
                // con el índice crudo.
                let stablefordPoints = null
                if (gross != null && selectedPlayer && esStableford) {
                  stablefordPoints = puntajeDeHoyo({
                    gross, par, courseHandicap: courseHcpDe(selectedPlayer), strokeIndex: si,
                    holeCount, formato: tournament,
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
                        {isSaved && gross != null && <span style={{ fontSize: '12px', color: '#4ade80' }}>✓</span>}
                        {stablefordPoints != null && (
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#c4992a', fontFamily: '"DM Mono", monospace' }}>
                            {stablefordPoints} pts
                          </div>
                        )}
                      </div>
                      <input
                        type="number" min={1} max={19} inputMode="numeric"
                        defaultValue={gross ?? ''}
                        key={`${selectedId}-${holeNum}-${gross}`}
                        onBlur={(e) => handleScoreChange(holeNum, e.target.value)}
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
    </div>
  )
}
