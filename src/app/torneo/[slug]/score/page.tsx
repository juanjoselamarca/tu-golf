'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

interface CourseHole { numero: number; par: number; stroke_index: number }
interface Round { id: string; status: string }
interface Player { id: string; handicap_at_registration: number | null; profiles: { name: string }; rounds: Round[] }
interface Tournament { id: string; name: string; slug: string; format: string; hole_count: number }

function strokesOnHole(courseHandicap: number, strokeIndex: number) {
  const base      = Math.floor(courseHandicap / 18)
  const remainder = courseHandicap % 18
  return strokeIndex <= remainder ? base + 1 : base
}

export default function PlayerScoringPage() {
  const { slug } = useParams() as { slug: string }
  const [tournament,    setTournament]    = useState<Tournament | null>(null)
  const [players,       setPlayers]       = useState<Player[]>([])
  const [courseHoles,   setCourseHoles]   = useState<CourseHole[]>([])
  const [selectedId,    setSelectedId]    = useState<string>('')
  const [currentScores, setCurrentScores] = useState<Record<number, number>>({})
  const [saving,        setSaving]        = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [savedHoles,    setSavedHoles]    = useState<Set<number>>(new Set())

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: t } = await supabase
        .from('tournaments')
        .select('id, name, slug, format, hole_count, courses(id)')
        .eq('slug', slug).single()
      if (!t) { setLoading(false); return }
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
    setCurrentScores(map)
  }, [players])

  useEffect(() => { if (selectedId) loadScores(selectedId) }, [selectedId, loadScores])

  const handleScoreChange = async (holeNumber: number, value: string) => {
    const gross = parseInt(value)
    if (isNaN(gross) || gross < 1 || gross > 20 || !tournament || !selectedId) return
    const player = players.find(p => p.id === selectedId)
    const round  = player?.rounds?.[0]
    if (!round) return
    const hole       = courseHoles.find(h => h.numero === holeNumber)
    const par        = hole?.par ?? 4
    const si         = hole?.stroke_index ?? holeNumber
    const courseHcp  = player.handicap_at_registration ?? 0
    const strokes    = strokesOnHole(courseHcp, si)
    const netScore   = gross - strokes
    let points = 0
    if (tournament.format === 'stableford') points = Math.max(0, 2 - (netScore - par))
    setCurrentScores(prev => ({ ...prev, [holeNumber]: gross }))
    setSaving(true)
    await fetch('/api/game', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert_score', tournament_id: tournament.id, round_id: round.id, hole_number: holeNumber, par, gross_score: gross, net_score: netScore, points }),
    })
    setSaving(false)
    setSavedHoles(prev => new Set(prev).add(holeNumber))
  }

  if (loading) return <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a8c0' }}>Cargando...</div>
  if (!tournament) return <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fca5a5' }}>Torneo no encontrado.</div>

  const selectedPlayer = players.find(p => p.id === selectedId)
  const holeCount = tournament.hole_count || 18
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1)

  return (
    <div style={{ background: '#070d18', minHeight: '100vh', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <Link href={`/torneo/${tournament.slug}`} style={{ color: '#94a8c0', fontSize: '12px', textDecoration: 'none' }}>← Leaderboard</Link>
          {saving && <span style={{ fontSize: '12px', color: '#94a8c0' }}>Guardando...</span>}
        </div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#edeae4', margin: '0 0 2px' }}>{tournament.name}</h1>
        {selectedPlayer && <p style={{ fontSize: '13px', color: '#c4992a', margin: 0 }}>{selectedPlayer.profiles?.name} · HCP {selectedPlayer.handicap_at_registration ?? '—'}</p>}
      </div>

      <div style={{ padding: '24px 16px', maxWidth: '500px', margin: '0 auto' }}>
        {/* Player select */}
        {!selectedId && (
          <div style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#edeae4', margin: '0 0 16px' }}>¿Quién eres?</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {players.map(p => (
                <button key={p.id} type="button" onClick={() => setSelectedId(p.id)}
                  style={{ padding: '14px 16px', background: 'rgba(7,13,24,0.5)', border: '1px solid rgba(122,143,168,0.2)', borderRadius: '10px', color: '#edeae4', fontSize: '16px', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 180ms' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#c4992a'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(122,143,168,0.2)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(7,13,24,0.5)' }}>
                  {p.profiles?.name}
                  {p.handicap_at_registration != null && <span style={{ color: '#94a8c0', fontSize: '13px', marginLeft: '8px' }}>HCP {p.handicap_at_registration}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scorecard */}
        {selectedPlayer && (
          <>
            <button type="button" onClick={() => { setSelectedId(''); setCurrentScores({}); setSavedHoles(new Set()) }}
              style={{ background: 'none', border: 'none', color: '#94a8c0', fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>
              ← Cambiar jugador
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {holes.map(holeNum => {
                const hole    = courseHoles.find(h => h.numero === holeNum)
                const par     = hole?.par ?? 4
                const gross   = currentScores[holeNum]
                const isSaved = savedHoles.has(holeNum)
                const diff    = gross != null ? gross - par : null
                let bg = 'rgba(14,28,47,0.9)'; let border = '1px solid rgba(122,143,168,0.2)'
                if (gross != null) {
                  if (diff! <= -2)     { bg = 'rgba(37,99,235,0.20)';  border = '2px solid #2563eb' }
                  else if (diff === -1) { bg = 'rgba(22,163,74,0.20)';  border = '2px solid #16a34a' }
                  else if (diff === 0)  { bg = 'rgba(100,116,139,0.15)'; border = '1px solid rgba(255,255,255,0.1)' }
                  else if (diff === 1)  { bg = 'rgba(220,38,38,0.20)'; border = '2px solid rgba(220,38,38,0.6)' }
                  else                  { bg = 'rgba(220,38,38,0.35)'; border = '2px solid #dc2626' }
                }
                return (
                  <div key={holeNum} style={{ background: bg, border, borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 200ms' }}>
                    <div>
                      <div style={{ color: '#94a8c0', fontSize: '12px', marginBottom: '2px' }}>Hoyo {holeNum}</div>
                      <div style={{ color: '#edeae4', fontSize: '14px' }}>Par {par}{hole?.stroke_index ? ` · SI ${hole.stroke_index}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {isSaved && gross != null && <span style={{ fontSize: '12px', color: '#4ade80' }}>✓</span>}
                      <input
                        type="number" min={1} max={20} inputMode="numeric"
                        defaultValue={gross ?? ''}
                        key={`${selectedId}-${holeNum}-${gross}`}
                        onBlur={(e) => handleScoreChange(holeNum, e.target.value)}
                        style={{ width: '64px', height: '56px', background: 'rgba(7,13,24,0.5)', border: '1px solid rgba(122,143,168,0.3)', borderRadius: '10px', color: '#edeae4', textAlign: 'center', fontSize: '24px', fontWeight: 700, outline: 'none', appearance: 'textfield' as React.CSSProperties['appearance'] }}
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
