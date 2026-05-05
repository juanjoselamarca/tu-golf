'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { SCORE_STYLES, getScoreResult } from '@/golf/core/colors'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { useScoreSync } from '@/hooks/useScoreSync'
import { formatLabel } from '@/golf/core/rules'
import { puntosStablefordHoyo } from '@/golf/core/scoring'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'

interface CourseHole { numero: number; par: number; stroke_index: number }
interface Round { id: string; status: string }
interface Player { id: string; handicap_at_registration: number | null; profiles: { name: string }; rounds: Round[] }
interface Tournament { id: string; name: string; slug: string; format: string; hole_count: number; formato_juego: FormatoJuego | null; modo_juego: ModoJuego | null; es_demo?: boolean }

function strokesOnHole(courseHandicap: number, strokeIndex: number) {
  const base      = Math.floor(courseHandicap / 18)
  const remainder = courseHandicap % 18
  return strokeIndex <= remainder ? base + 1 : base
}

export default function PlayerScoringPage() {
  const { slug } = useParams() as { slug: string }
  const router = useRouter()
  const [tournament,    setTournament]    = useState<Tournament | null>(null)
  const [players,       setPlayers]       = useState<Player[]>([])
  const [courseHoles,   setCourseHoles]   = useState<CourseHole[]>([])
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

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: t } = await supabase
        .from('tournaments')
        .select('id, name, slug, format, hole_count, formato_juego, modo_juego, es_demo, courses(id)')
        .eq('slug', slug).single()
      if (!t) { setLoading(false); return }
      // Demo torneos son spectator-only — redirigir al leaderboard público.
      if ((t as { es_demo?: boolean }).es_demo) {
        router.replace(`/torneo/${slug}`)
        return
      }
      setTournament(t as unknown as Tournament)
      const { data: p } = await supabase
        .from('players')
        .select('id, handicap_at_registration, profiles(name), rounds(id, status)')
        .eq('tournament_id', t.id).order('created_at')
      setPlayers((p as unknown as Player[]) || [])
      const courseId = (t as unknown as { courses: { id: string } | null }).courses?.id
      if (courseId) {
        const { data: holes } = await supabase.from('course_holes').select('numero, par, stroke_index').eq('course_id', courseId).order('numero')
        setCourseHoles((holes as CourseHole[]) || [])
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
    const { data } = await supabase.from('hole_scores').select('hole_number, gross_score').eq('round_id', roundId).not('gross_score', 'is', null)
    const map: Record<number, number> = {}
    ;(data || []).forEach((s: { hole_number: number; gross_score: number | null }) => { if (s.gross_score != null) map[s.hole_number] = s.gross_score })
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
    const si         = hole?.stroke_index ?? holeNumber
    const holeCount  = tournament.hole_count || 18
    const handicapIndex = player.handicap_at_registration ?? 0
    const strokes    = strokesOnHole(handicapIndex, si)
    const netScore   = gross - strokes
    let points = 0
    if (tournament.formato_juego === 'stableford') {
      points = puntosStablefordHoyo(gross, par, handicapIndex, si, holeCount)
    }

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
          const handicapIndex = selectedPlayerEarly.handicap_at_registration ?? 0
          let failed = 0
          for (const [h, g] of Object.entries(pending)) {
            const holeNumber = Number(h)
            const hole = courseHoles.find(ch => ch.numero === holeNumber)
            const par = hole?.par ?? 4
            const si = hole?.stroke_index ?? holeNumber
            const strokes = strokesOnHole(handicapIndex, si)
            const netScore = g - strokes
            let points = 0
            if (tournament.formato_juego === 'stableford') {
              points = puntosStablefordHoyo(g, par, handicapIndex, si, holeCount)
            }
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
  }, [tournament, roundIdForSync, selectedPlayerEarly, courseHoles, scoreSync, submitHoleScore])

  if (loading) return <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>Cargando...</div>
  if (!tournament) return <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fca5a5' }}>Torneo no encontrado.</div>

  const selectedPlayer = players.find(p => p.id === selectedId)
  const holeCount = tournament.hole_count || 18
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
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
        {/* Player select */}
        {!selectedId && (
          <div style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
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
                const si      = hole?.stroke_index ?? holeNum
                const gross   = currentScores[holeNum]
                const isSaved = savedHoles.has(holeNum)
                const diff    = gross != null ? gross - par : null
                const sr = getScoreResult(gross, par)
                const ss = SCORE_STYLES[sr]
                const bg = gross != null ? ss.bg : 'rgba(14,28,47,0.9)'
                const border = gross != null ? `${ss.borderWidth} solid ${ss.border}` : '1px solid rgba(122,143,168,0.2)'

                // Calculate Stableford points if it's stableford format and we have a score
                let stablefordPoints = null
                if (tournament.formato_juego === 'stableford' && gross != null && selectedPlayer) {
                  const holeCount = tournament.hole_count || 18
                  const handicapIndex = selectedPlayer.handicap_at_registration ?? 0
                  stablefordPoints = puntosStablefordHoyo(gross, par, handicapIndex, si, holeCount)
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
