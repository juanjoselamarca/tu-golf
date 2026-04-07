'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'

interface CourseHole { numero: number; par: number; stroke_index: number }
interface Round { id: string; status: string; total_gross: number; total_net: number; total_points: number; round_number: number }
interface Player {
  id: string
  handicap_at_registration: number | null
  profiles: { name: string }
  rounds: Round[]
}
interface Tournament {
  id: string
  name: string
  slug: string
  format: string
  hole_count: number
  total_rounds: number
  courses: { id: string; nombre: string; par_total: number; slope_rating: number; course_rating: number } | null
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function scoreBackground(gross: number, par: number) {
  const d = gross - par
  if (d <= -2) return 'rgba(37,99,235,0.30)'
  if (d === -1) return 'rgba(22,163,74,0.30)'
  if (d === 0)  return 'rgba(100,116,139,0.10)'
  if (d === 1)  return 'rgba(220,38,38,0.20)'
  return 'rgba(220,38,38,0.40)'
}

function scoreBorder(gross: number, par: number) {
  const d = gross - par
  if (d <= -2) return '2px solid #2563eb'
  if (d === -1) return '2px solid #16a34a'
  if (d === 0)  return '1px solid #e2e8f0'
  if (d === 1)  return '2px solid rgba(220,38,38,0.6)'
  return '2px solid #dc2626'
}

function strokesOnHole(courseHandicap: number, strokeIndex: number) {
  const base      = Math.floor(courseHandicap / 18)
  const remainder = courseHandicap % 18
  return strokeIndex <= remainder ? base + 1 : base
}

export default function ScoringPage() {
  const { slug } = useParams() as { slug: string }
  const { showError, showSuccess, showWarning } = useToast()

  const [tournament,        setTournament]        = useState<Tournament | null>(null)
  const [players,           setPlayers]           = useState<Player[]>([])
  const [courseHoles,       setCourseHoles]       = useState<CourseHole[]>([])
  const [selectedId,        setSelectedId]        = useState<string | null>(null)
  const [currentScores,     setCurrentScores]     = useState<Record<number, number>>({})
  const [errorHoles,        setErrorHoles]        = useState<Set<number>>(new Set())
  const [saving,            setSaving]            = useState(false)
  const [loading,           setLoading]           = useState(true)
  const [activeTab,         setActiveTab]         = useState<'scoring' | 'resumen'>('scoring')
  const [editingHcp,        setEditingHcp]        = useState<string | null>(null)
  const [editHcpValue,      setEditHcpValue]      = useState('')
  const [activeRoundNum,    setActiveRoundNum]    = useState(1)
  const [startingNextRound, setStartingNextRound] = useState(false)

  // Estadísticas adicionales por hoyo
  const [showStats,    setShowStats]    = useState(false)
  const [holePutts,    setHolePutts]    = useState<Record<number, number | null>>({})
  const [holeFairway,  setHoleFairway]  = useState<Record<number, boolean | null>>({})
  const [holeGir,      setHoleGir]      = useState<Record<number, boolean | null>>({})

  // Undo last score
  const [lastAction, setLastAction] = useState<{
    holeNumber: number; previousScore: number | undefined; playerId: string
  } | null>(null)

  // Load all data
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()

      const { data: t } = await supabase
        .from('tournaments')
        .select('id, name, slug, format, hole_count, total_rounds, courses(id, nombre, par_total, slope_rating, course_rating)')
        .eq('slug', slug)
        .single()

      if (!t) { setLoading(false); return }
      setTournament(t as unknown as Tournament)

      const { data: p } = await supabase
        .from('players')
        .select('id, handicap_at_registration, profiles(name), rounds(id, status, total_gross, total_net, total_points, round_number)')
        .eq('tournament_id', t.id)
        .order('created_at')

      const allPlayers = (p as unknown as Player[]) || []
      setPlayers(allPlayers)

      // Determine active round number: max round_number across all rounds
      const maxRound = allPlayers.reduce((max, pl) => {
        const pMax = pl.rounds?.reduce((m, r) => Math.max(m, r.round_number ?? 1), 0) ?? 0
        return Math.max(max, pMax)
      }, 1)
      setActiveRoundNum(maxRound)

      const courseId = (t.courses as unknown as { id: string } | null)?.id
      if (courseId) {
        const { data: holes } = await supabase
          .from('course_holes')
          .select('numero, par, stroke_index')
          .eq('course_id', courseId)
          .order('numero')
        setCourseHoles((holes as CourseHole[]) || [])
      }

      setLoading(false)
    }
    load()
  }, [slug])

  // Load scores when player selected
  // Get the round for a player matching the active round number
  const getActiveRound = useCallback((player: Player | undefined) => {
    if (!player?.rounds) return undefined
    return player.rounds.find(r => (r.round_number ?? 1) === activeRoundNum) || player.rounds[0]
  }, [activeRoundNum])

  const loadScores = useCallback(async (playerId: string) => {
    const player = players.find((p) => p.id === playerId)
    const roundId = getActiveRound(player)?.id
    if (!roundId) {
      setCurrentScores({})
      setHolePutts({})
      setHoleFairway({})
      setHoleGir({})
      return
    }

    const supabase = createClient()
    const { data } = await supabase
      .from('hole_scores')
      .select('hole_number, gross_score, putts, fairway_hit, gir')
      .eq('round_id', roundId)
      .not('gross_score', 'is', null)

    const scores:  Record<number, number>          = {}
    const putts:   Record<number, number | null>   = {}
    const fairway: Record<number, boolean | null>  = {}
    const gir:     Record<number, boolean | null>  = {}

    ;(data || []).forEach((s: {
      hole_number: number
      gross_score: number | null
      putts:       number | null
      fairway_hit: boolean | null
      gir:         boolean | null
    }) => {
      if (s.gross_score != null) scores[s.hole_number]  = s.gross_score
      putts[s.hole_number]   = s.putts   ?? null
      fairway[s.hole_number] = s.fairway_hit ?? null
      gir[s.hole_number]     = s.gir     ?? null
    })

    setCurrentScores(scores)
    setHolePutts(putts)
    setHoleFairway(fairway)
    setHoleGir(gir)
  }, [players, getActiveRound])

  useEffect(() => {
    if (selectedId) loadScores(selectedId)
  }, [selectedId, loadScores, activeRoundNum])

  const handleScoreBlur = async (holeNumber: number, value: string) => {
    const gross = parseInt(value)
    if (isNaN(gross) || !tournament || !selectedId) return

    if (gross < 1 || gross > 19) {
      showWarning('Score inválido', 'El score debe ser entre 1 y 19 golpes.')
      return
    }

    const player = players.find((p) => p.id === selectedId)
    if (!player) return
    const round  = getActiveRound(player)
    if (!round) return

    const hole         = courseHoles.find((h) => h.numero === holeNumber)
    const par          = hole?.par ?? 4
    const strokeIndex  = hole?.stroke_index ?? holeNumber
    const courseHcp    = player.handicap_at_registration ?? 0
    const strokes      = strokesOnHole(courseHcp, strokeIndex)
    const netScore     = gross - strokes

    let points = 0
    if (tournament.format === 'stableford') {
      points = Math.max(0, 2 - (netScore - par))
    }

    // Save previous for undo
    setLastAction({ holeNumber, previousScore: currentScores[holeNumber], playerId: selectedId })

    // Optimistic update
    setCurrentScores((prev) => ({ ...prev, [holeNumber]: gross }))
    setErrorHoles((prev) => { const next = new Set(prev); next.delete(holeNumber); return next })

    setSaving(true)
    const res = await fetch('/api/game', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:        'upsert_score',
        tournament_id: tournament.id,
        round_id:      round.id,
        hole_number:   holeNumber,
        par,
        gross_score:   gross,
        net_score:     netScore,
        points,
        putts:         holePutts[holeNumber]   ?? null,
        fairway_hit:   holeFairway[holeNumber] ?? null,
        gir:           holeGir[holeNumber]     ?? null,
      }),
    })
    setSaving(false)

    if (!res.ok) {
      showError('Error al guardar', `No pudimos guardar el score del hoyo ${holeNumber}. Intenta nuevamente.`)
      setErrorHoles((prev) => new Set(prev).add(holeNumber))
      return
    }

    showSuccess('Score guardado', '', { duration: 1500 })

    // Refresh round totals in local state
    const supabase = createClient()
    const { data: updatedRound } = await supabase
      .from('rounds')
      .select('total_gross, total_net, total_points')
      .eq('id', round.id)
      .single()

    if (updatedRound) {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== selectedId) return p
          const updatedRounds = (p.rounds || []).map(r =>
            r.id === round.id ? { ...r, ...updatedRound } : r
          )
          return { ...p, rounds: updatedRounds }
        })
      )
    }
  }

  const handleFinalize = async () => {
    if (!tournament || !selectedId) return
    const player = players.find((p) => p.id === selectedId)
    const round  = getActiveRound(player)
    if (!round) return

    setSaving(true)
    await fetch('/api/game', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:        'finalize_round',
        tournament_id: tournament.id,
        round_id:      round.id,
      }),
    })
    setSaving(false)

    // Refresh players
    const supabase = createClient()
    const { data: p } = await supabase
      .from('players')
      .select('id, handicap_at_registration, profiles(name), rounds(id, status, total_gross, total_net, total_points, round_number)')
      .eq('tournament_id', tournament.id)
      .order('created_at')
    setPlayers((p as unknown as Player[]) || [])
    setSelectedId(null)
    setCurrentScores({})
    setHolePutts({})
    setHoleFairway({})
    setHoleGir({})
  }

  const handleHcpSave = async (playerId: string) => {
    const value = parseFloat(editHcpValue)
    if (isNaN(value) || value < 0 || value > 54) {
      showWarning('Handicap inválido', 'Debe ser un número entre 0 y 54.')
      setEditingHcp(null)
      return
    }
    const supabase = createClient()
    const { error } = await supabase
      .from('players')
      .update({ handicap_at_registration: value })
      .eq('id', playerId)
    if (error) {
      showError('Error', 'No se pudo actualizar el handicap.')
    } else {
      setPlayers((prev) =>
        prev.map((p) => p.id === playerId ? { ...p, handicap_at_registration: value } : p)
      )
      showSuccess('Handicap actualizado', '', { duration: 1500 })
    }
    setEditingHcp(null)
  }

  if (loading) {
    return (
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#4a5568' }}>Cargando torneo...</div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fca5a5' }}>Torneo no encontrado.</div>
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '56px', marginBottom: '20px' }}>🏌️</div>
          <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: '#1a1a2e', marginBottom: '10px' }}>
            Sin jugadores inscritos
          </h3>
          <p style={{ color: '#4a5568', marginBottom: '24px', fontSize: '15px' }}>
            Inscribe jugadores antes de ingresar scores
          </p>
          <button
            onClick={() => window.location.href = `/organizador/${slug}/jugadores`}
            style={{ background: '#c4992a', color: '#1a1a2e', fontWeight: 700, fontSize: '15px', padding: '12px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
          >
            Inscribir jugadores →
          </button>
        </div>
      </div>
    )
  }

  const totalRounds    = tournament.total_rounds || 1
  const isMultiRound   = totalRounds > 1
  const holeCount      = tournament.hole_count || 18
  const holes          = Array.from({ length: holeCount }, (_, i) => i + 1)
  const selectedPlayer = players.find((p) => p.id === selectedId)
  const selectedRound  = getActiveRound(selectedPlayer)

  // Multi-round: check if all current rounds are closed
  const allCurrentRoundsClosed = players.every(p => {
    const r = p.rounds?.find(r => (r.round_number ?? 1) === activeRoundNum)
    return r ? (r.status === 'closed' || r.status === 'official') : true
  })
  const canStartNextRound = isMultiRound && allCurrentRoundsClosed && activeRoundNum < totalRounds && players.length > 0

  const handleStartNextRound = async () => {
    if (!tournament || !canStartNextRound) return
    setStartingNextRound(true)
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start_next_round',
        tournament_id: tournament.id,
      }),
    })
    const data = await res.json()
    setStartingNextRound(false)

    if (res.ok && data.roundNumber) {
      setActiveRoundNum(data.roundNumber)
      showSuccess('Ronda iniciada', `Se creo la ronda ${data.roundNumber} para ${data.playersCount} jugadores`)
      // Refresh players
      const supabase = createClient()
      const { data: p } = await supabase
        .from('players')
        .select('id, handicap_at_registration, profiles(name), rounds(id, status, total_gross, total_net, total_points, round_number)')
        .eq('tournament_id', tournament.id)
        .order('created_at')
      setPlayers((p as unknown as Player[]) || [])
      setSelectedId(null)
      setCurrentScores({})
    } else {
      showError('Error', data.error || 'No se pudo iniciar la siguiente ronda')
    }
  }
  const filledCount    = holes.filter((h) => currentScores[h] != null).length
  const allFilled      = filledCount === holeCount
  const parTotal       = tournament.courses?.par_total ?? 72

  const grossTotal = holes.reduce((s, h) => s + (currentScores[h] ?? 0), 0)
  const outGross   = holes.filter(h => h <= 9).reduce((s, h) => s + (currentScores[h] ?? 0), 0)
  const inGross    = holes.filter(h => h > 9).reduce((s, h) => s + (currentScores[h] ?? 0), 0)
  const netTotal   = holes.reduce((s, h) => {
    if (!currentScores[h]) return s
    const hole        = courseHoles.find((ch) => ch.numero === h)
    const par         = hole?.par ?? 4
    const si          = hole?.stroke_index ?? h
    const hcp         = selectedPlayer?.handicap_at_registration ?? 0
    const strokes     = strokesOnHole(hcp, si)
    return s + (currentScores[h] - strokes)
  }, 0)

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#1a1a2e', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {tournament.name}
            <span style={{ fontSize: '12px', fontFamily: 'DM Sans, sans-serif', background: 'rgba(22,163,74,0.15)', color: '#4ade80', border: '1px solid rgba(22,163,74,0.4)', padding: '3px 10px', borderRadius: '20px', animation: 'pulse 2s infinite' }}>
              ● EN VIVO
            </span>
            {isMultiRound && (
              <span style={{ fontSize: '12px', fontFamily: 'DM Sans, sans-serif', background: 'rgba(196,153,42,0.12)', color: '#c4992a', border: '1px solid rgba(196,153,42,0.3)', padding: '3px 10px', borderRadius: '20px' }}>
                R{activeRoundNum}/{totalRounds}
              </span>
            )}
            {saving && <span style={{ fontSize: '12px', color: '#4a5568', fontFamily: 'DM Sans, sans-serif' }}>Guardando...</span>}
            {lastAction && !saving && (
              <button
                onClick={async () => {
                  if (!lastAction || !tournament) return
                  const player = players.find(p => p.id === lastAction.playerId)
                  const round = getActiveRound(player)
                  if (!round) return
                  if (lastAction.previousScore !== undefined) {
                    setCurrentScores(prev => ({ ...prev, [lastAction.holeNumber]: lastAction.previousScore! }))
                    const hole = courseHoles.find(h => h.numero === lastAction.holeNumber)
                    await fetch('/api/game', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'upsert_score', tournament_id: tournament.id, round_id: round.id,
                        hole_number: lastAction.holeNumber, par: hole?.par ?? 4,
                        gross_score: lastAction.previousScore,
                      }),
                    })
                  } else {
                    setCurrentScores(prev => { const next = { ...prev }; delete next[lastAction.holeNumber]; return next })
                  }
                  showSuccess('Deshacer', `Hoyo ${lastAction.holeNumber} restaurado`, { duration: 1500 })
                  setLastAction(null)
                }}
                style={{ fontSize: '12px', color: '#c4992a', background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.3)', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
              >
                Deshacer hoyo {lastAction.holeNumber}
              </button>
            )}
          </h1>
          <Link href="/dashboard" style={{ color: '#4a5568', fontSize: '12px', textDecoration: 'none' }}>← Dashboard</Link>
        </div>
        <Link
          href={`/torneo/${tournament.slug}`}
          target="_blank"
          style={{ background: 'rgba(196,153,42,0.12)', color: '#c4992a', border: '1px solid rgba(196,153,42,0.3)', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', textDecoration: 'none', fontWeight: 500 }}
        >
          Ver leaderboard público →
        </Link>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '28px 20px' }}>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'rgba(14,28,47,0.7)', borderRadius: '10px', padding: '4px', border: '1px solid rgba(122,143,168,0.15)' }}>
          {(['scoring', 'resumen'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: activeTab === tab ? 'rgba(196,153,42,0.15)' : 'transparent',
                border: activeTab === tab ? '1px solid rgba(196,153,42,0.4)' : '1px solid transparent',
                borderRadius: '8px',
                color: activeTab === tab ? '#c4992a' : '#4a5568',
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

        {/* Multi-round controls */}
        {isMultiRound && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            {Array.from({ length: totalRounds }, (_, i) => i + 1).map(rn => {
              const hasRound = players.some(p => p.rounds?.some(r => (r.round_number ?? 1) === rn))
              return (
                <button
                  key={rn}
                  onClick={() => { if (hasRound) { setActiveRoundNum(rn); setSelectedId(null); setCurrentScores({}) } }}
                  disabled={!hasRound}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: activeRoundNum === rn ? 700 : 400,
                    border: activeRoundNum === rn ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.25)',
                    background: activeRoundNum === rn ? 'rgba(196,153,42,0.12)' : 'transparent',
                    color: !hasRound ? '#3a4a5a' : activeRoundNum === rn ? '#c4992a' : '#4a5568',
                    cursor: hasRound ? 'pointer' : 'not-allowed',
                  }}
                >
                  Ronda {rn}
                </button>
              )
            })}
            {canStartNextRound && (
              <button
                onClick={handleStartNextRound}
                disabled={startingNextRound}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  border: '2px solid #c4992a',
                  background: '#c4992a',
                  color: '#1a1a2e',
                  cursor: startingNextRound ? 'not-allowed' : 'pointer',
                  opacity: startingNextRound ? 0.7 : 1,
                  marginLeft: 'auto',
                }}
              >
                {startingNextRound ? 'Creando...' : `Iniciar Ronda ${activeRoundNum + 1}`}
              </button>
            )}
          </div>
        )}

        {/* ── Resumen tab ── */}
        {activeTab === 'resumen' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              {(() => {
                const completed = players.filter(p => p.rounds?.[0]?.status === 'completed').length
                const withScores = players.filter(p => p.rounds?.[0]?.total_gross > 0).length
                const bestGross = players.reduce((best, p) => {
                  const g = p.rounds?.[0]?.total_gross
                  return g && g > 0 && (!best || g < best.score) ? { name: p.profiles?.name, score: g } : best
                }, null as { name: string; score: number } | null)
                const bestNet = players.reduce((best, p) => {
                  const n = p.rounds?.[0]?.total_net
                  return n != null && n !== 0 && (!best || n < best.score) ? { name: p.profiles?.name, score: n } : best
                }, null as { name: string; score: number } | null)

                const cards = [
                  { label: 'Jugadores', value: `${withScores}/${players.length}`, sub: `${completed} completos` },
                  { label: 'Mejor Gross', value: bestGross ? String(bestGross.score) : '--', sub: bestGross?.name?.split(' ')[0] || '' },
                  { label: 'Mejor Neto', value: bestNet ? String(bestNet.score) : '--', sub: bestNet?.name?.split(' ')[0] || '' },
                ]

                return cards.map((c) => (
                  <div key={c.label} style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#4a5568', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a2e', fontFamily: '"Playfair Display", serif' }}>{c.value}</div>
                    {c.sub && <div style={{ fontSize: '12px', color: '#4a5568', marginTop: '4px' }}>{c.sub}</div>}
                  </div>
                ))
              })()}
            </div>

            {/* Player table with editable handicap */}
            <div style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(196,153,42,0.1)' }}>
                <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: '#1a1a2e' }}>Jugadores</span>
                <span style={{ fontSize: '12px', color: '#4a5568', marginLeft: '8px' }}>Toca el handicap para editar</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(122,143,168,0.15)' }}>
                      {['Jugador', 'HCP', 'Gross', 'Neto', 'Pts', 'Estado'].map((h) => (
                        <th key={h} style={{ color: '#4a5568', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', padding: '10px 12px', textAlign: h === 'Jugador' ? 'left' : 'center' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => {
                      const round = p.rounds?.[0]
                      const isDone = round?.status === 'completed'
                      const isEditingThis = editingHcp === p.id
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(122,143,168,0.06)' }}>
                          <td style={{ padding: '10px 12px', color: '#1a1a2e', fontWeight: 500 }}>{p.profiles?.name || '--'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {isEditingThis ? (
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                max={54}
                                autoFocus
                                value={editHcpValue}
                                onChange={(e) => setEditHcpValue(e.target.value)}
                                onBlur={() => handleHcpSave(p.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleHcpSave(p.id); if (e.key === 'Escape') setEditingHcp(null) }}
                                style={{ width: '56px', background: '#f8f9fa', border: '1px solid #c4992a', borderRadius: '4px', color: '#1a1a2e', textAlign: 'center', fontSize: '13px', padding: '4px', outline: 'none' }}
                              />
                            ) : (
                              <button
                                onClick={() => { setEditingHcp(p.id); setEditHcpValue(String(p.handicap_at_registration ?? '')) }}
                                style={{ background: 'transparent', border: '1px solid transparent', borderRadius: '4px', color: '#c4992a', cursor: 'pointer', padding: '4px 8px', fontSize: '13px', fontWeight: 600 }}
                                title="Editar handicap"
                              >
                                {p.handicap_at_registration ?? '--'}
                              </button>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#1a1a2e', fontWeight: 600 }}>{round?.total_gross || '--'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#1a1a2e' }}>{round?.total_net || '--'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#1a1a2e' }}>{round?.total_points || '--'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              background: isDone ? 'rgba(22,163,74,0.15)' : 'rgba(122,143,168,0.1)',
                              color: isDone ? '#4ade80' : '#4a5568',
                              border: `1px solid ${isDone ? 'rgba(22,163,74,0.3)' : 'rgba(122,143,168,0.2)'}`,
                            }}>
                              {isDone ? 'Completo' : 'En juego'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Scoring tab ── */}
        {activeTab === 'scoring' && <>

        {/* Player cards */}
        <div style={{ overflowX: 'auto', marginBottom: '28px' }}>
          <div style={{ display: 'flex', gap: '12px', padding: '4px 0' }}>
            {players.map((p) => {
              const round      = getActiveRound(p)
              const isSelected = p.id === selectedId
              const isDone     = round?.status === 'closed' || round?.status === 'official'
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id)
                    setCurrentScores({})
                    setLastAction(null)
                  }}
                  style={{
                    minWidth: '120px',
                    padding: '14px 16px',
                    background: isSelected ? 'rgba(196,153,42,0.12)' : 'rgba(14,28,47,0.9)',
                    border: isSelected ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.2)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 180ms',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSelected ? '#c4992a' : '#e2e8f0', color: isSelected ? '#1a1a2e' : '#4a5568', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', margin: '0 auto 8px' }}>
                    {getInitials(p.profiles?.name || '?')}
                  </div>
                  <div style={{ color: '#1a1a2e', fontSize: '12px', fontWeight: 500, lineHeight: 1.2, marginBottom: '4px' }}>
                    {p.profiles?.name?.split(' ')[0] || '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: isDone ? '#4ade80' : '#4a5568' }}>
                    {isDone ? '✓ Completo' : `${Object.keys(currentScores).length > 0 && isSelected ? filledCount : 0}/${holeCount}`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Scorecard */}
        {selectedPlayer ? (
          <div style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(196,153,42,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#1a1a2e' }}>{selectedPlayer.profiles?.name}</span>
                <span style={{ color: '#4a5568', fontSize: '13px', marginLeft: '10px' }}>HCP {selectedPlayer.handicap_at_registration ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                {holeCount === 18 && grossTotal > 0 && (
                  <div style={{ fontSize: '11px', color: '#4a5568', fontFamily: '"DM Mono", monospace', alignSelf: 'center' }}>
                    {outGross}+{inGross}
                  </div>
                )}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#4a5568', marginBottom: '2px' }}>GROSS</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a2e' }}>{grossTotal || '—'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#4a5568', marginBottom: '2px' }}>NET</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: netTotal < 0 ? '#4ade80' : netTotal > 0 ? '#f87171' : '#1a1a2e' }}>
                    {grossTotal ? (netTotal <= 0 ? netTotal : `+${netTotal}`) : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#4a5568', marginBottom: '2px' }}>vs PAR</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#4a5568' }}>
                    {grossTotal ? (netTotal - parTotal <= 0 ? netTotal - parTotal : `+${netTotal - parTotal}`) : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Score grid */}
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '8px' }}>
              {holes.map((holeNum) => {
                const hole    = courseHoles.find((h) => h.numero === holeNum)
                const par     = hole?.par ?? 4
                const gross   = currentScores[holeNum]
                const haScore = gross != null
                const hasErr  = errorHoles.has(holeNum)

                return (
                  <div
                    key={holeNum}
                    style={{
                      background: hasErr ? 'rgba(220,38,38,0.15)' : haScore ? scoreBackground(gross, par) : '#f8f9fa',
                      border:     hasErr ? '2px solid #dc2626' : haScore ? scoreBorder(gross, par) : '1px solid rgba(122,143,168,0.15)',
                      borderRadius: '8px',
                      padding: '8px 4px',
                      textAlign: 'center',
                      animation: hasErr ? 'pulse 1s ease-in-out 3' : 'none',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#4a5568', marginBottom: '2px' }}>H{holeNum}</div>
                    <div style={{ fontSize: '10px', color: '#4a5568', marginBottom: '4px' }}>P{par}</div>
                    <input
                      type="number"
                      min={1}
                      max={19}
                      inputMode="numeric"
                      defaultValue={gross ?? ''}
                      key={`${selectedId}-${holeNum}-${gross}`}
                      onBlur={(e) => handleScoreBlur(holeNum, e.target.value)}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: '#1a1a2e',
                        textAlign: 'center',
                        fontSize: '18px',
                        fontWeight: 700,
                        padding: '2px 0',
                        cursor: 'text',
                        appearance: 'textfield',
                      }}
                      placeholder="—"
                    />
                    {haScore && tournament?.format === 'stableford' && (() => {
                      const currentPlayer = players.find(p => p.id === selectedId)
                      const strokes = strokesOnHole(currentPlayer?.handicap_at_registration ?? 0, courseHoles.find(h => h.numero === holeNum)?.stroke_index ?? holeNum)
                      const neto = gross - strokes
                      const pts = Math.max(0, 2 - (neto - par))
                      return (
                        <div style={{ fontSize: '10px', color: pts >= 2 ? '#16a34a' : pts === 1 ? '#c4992a' : '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                          {pts} pt{pts !== 1 ? 's' : ''}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>

            {/* ── Estadísticas adicionales (colapsable) ── */}
            <div style={{ borderTop: '1px solid rgba(122,143,168,0.1)' }}>
              <button
                type="button"
                onClick={() => setShowStats(!showStats)}
                style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', color: '#4a5568', fontSize: '13px' }}
              >
                <span style={{ transition: 'transform 200ms', transform: showStats ? 'rotate(90deg)' : 'rotate(0)', display: 'inline-block' }}>▶</span>
                Estadísticas adicionales — Putts · Fairway · GIR (opcional)
              </button>

              {showStats && (
                <div style={{ padding: '0 20px 20px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '480px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(122,143,168,0.15)' }}>
                        {['Hoyo', 'Gross', 'Putts (0-6)', 'Fairway hit', 'GIR'].map((h) => (
                          <th key={h} style={{ color: '#4a5568', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', padding: '6px 8px', textAlign: 'center' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {holes.map((h) => {
                        const gross    = currentScores[h]
                        const disabled = gross == null
                        const hole     = courseHoles.find((ch) => ch.numero === h)
                        const par      = hole?.par ?? 4
                        const isFairwayApplicable = par >= 4

                        return (
                          <tr key={h} style={{ borderBottom: '1px solid rgba(122,143,168,0.06)', opacity: disabled ? 0.4 : 1 }}>
                            <td style={{ textAlign: 'center', color: '#4a5568', padding: '6px 8px', fontSize: '12px' }}>H{h} P{par}</td>
                            <td style={{ textAlign: 'center', color: '#1a1a2e', padding: '6px 8px', fontSize: '13px', fontWeight: 600 }}>{gross ?? '—'}</td>

                            {/* Putts */}
                            <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                              <input
                                type="number" min={0} max={6} inputMode="numeric"
                                disabled={disabled}
                                value={holePutts[h] ?? ''}
                                onChange={(e) => {
                                  const n = parseInt(e.target.value)
                                  setHolePutts((prev) => ({ ...prev, [h]: isNaN(n) || n < 0 || n > 6 ? null : n }))
                                }}
                                onBlur={async () => {
                                  if (disabled || !tournament || !selectedId) return
                                  const player = players.find((p) => p.id === selectedId)
                                  const round  = player?.rounds?.[0]
                                  if (!round) return
                                  await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                                    action: 'upsert_score', tournament_id: tournament.id, round_id: round.id,
                                    hole_number: h, par, gross_score: gross,
                                    putts: holePutts[h] ?? null,
                                  })})
                                }}
                                style={{ width: '48px', background: '#f8f9fa', border: '1px solid rgba(122,143,168,0.2)', borderRadius: '4px', color: '#1a1a2e', textAlign: 'center', fontSize: '13px', padding: '4px', outline: 'none', appearance: 'textfield' as const, cursor: disabled ? 'not-allowed' : 'text' }}
                                placeholder="—"
                              />
                            </td>

                            {/* Fairway hit */}
                            <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                              {isFairwayApplicable ? (
                                <div style={{ display: 'inline-flex', gap: '4px' }}>
                                  {([true, false, null] as (boolean | null)[]).map((v) => (
                                    <button key={String(v)} type="button" disabled={disabled}
                                      onClick={async () => {
                                        if (disabled) return
                                        setHoleFairway((prev) => ({ ...prev, [h]: v }))
                                        const player = players.find((p) => p.id === selectedId)
                                        const round  = player?.rounds?.[0]
                                        if (!round || !tournament) return
                                        await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                                          action: 'upsert_score', tournament_id: tournament.id, round_id: round.id,
                                          hole_number: h, par, gross_score: gross,
                                          fairway_hit: v,
                                        })})
                                      }}
                                      style={{ padding: '3px 7px', fontSize: '11px', borderRadius: '4px', border: '1px solid', cursor: disabled ? 'not-allowed' : 'pointer',
                                        background:  holeFairway[h] === v ? (v === true ? 'rgba(22,163,74,0.25)' : v === false ? 'rgba(220,38,38,0.2)' : 'rgba(122,143,168,0.15)') : 'transparent',
                                        borderColor: holeFairway[h] === v ? (v === true ? '#16a34a' : v === false ? '#dc2626' : '#4a5568') : 'rgba(122,143,168,0.2)',
                                        color:       holeFairway[h] === v ? '#1a1a2e' : '#4a5568',
                                      }}>
                                      {v === true ? 'Sí' : v === false ? 'No' : '—'}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: '#3a4a5a', fontSize: '12px' }}>N/A</span>
                              )}
                            </td>

                            {/* GIR */}
                            <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                {([true, false, null] as (boolean | null)[]).map((v) => (
                                  <button key={String(v)} type="button" disabled={disabled}
                                    onClick={async () => {
                                      if (disabled) return
                                      setHoleGir((prev) => ({ ...prev, [h]: v }))
                                      const player = players.find((p) => p.id === selectedId)
                                      const round  = player?.rounds?.[0]
                                      if (!round || !tournament) return
                                      await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                                        action: 'upsert_score', tournament_id: tournament.id, round_id: round.id,
                                        hole_number: h, par, gross_score: gross,
                                        gir: v,
                                      })})
                                    }}
                                    style={{ padding: '3px 7px', fontSize: '11px', borderRadius: '4px', border: '1px solid', cursor: disabled ? 'not-allowed' : 'pointer',
                                      background:  holeGir[h] === v ? (v === true ? 'rgba(22,163,74,0.25)' : v === false ? 'rgba(220,38,38,0.2)' : 'rgba(122,143,168,0.15)') : 'transparent',
                                      borderColor: holeGir[h] === v ? (v === true ? '#16a34a' : v === false ? '#dc2626' : '#4a5568') : 'rgba(122,143,168,0.2)',
                                      color:       holeGir[h] === v ? '#1a1a2e' : '#4a5568',
                                    }}>
                                    {v === true ? 'Sí' : v === false ? 'No' : '—'}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Finalize button */}
            {allFilled && selectedRound?.status !== 'completed' && selectedRound?.status !== 'closed' && selectedRound?.status !== 'official' && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(196,153,42,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleFinalize}
                  disabled={saving}
                  style={{
                    background: '#c4992a',
                    color: '#1a1a2e',
                    fontWeight: 700,
                    fontSize: '15px',
                    padding: '12px 28px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.8 : 1,
                  }}
                >
                  {saving ? 'Finalizando...' : 'Finalizar ronda ✓'}
                </button>
              </div>
            )}

            {(selectedRound?.status === 'completed' || selectedRound?.status === 'closed' || selectedRound?.status === 'official') && (
              <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(22,163,74,0.2)', background: 'rgba(22,163,74,0.05)', textAlign: 'center', color: '#4ade80', fontSize: '14px' }}>
                ✓ Ronda finalizada
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: 'rgba(14,28,47,0.7)', border: '1px solid rgba(122,143,168,0.15)', borderRadius: '14px', padding: '48px', textAlign: 'center', color: '#4a5568' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>⛳</div>
            <div style={{ fontSize: '16px', color: '#1a1a2e', marginBottom: '6px' }}>Selecciona un jugador arriba</div>
            <div style={{ fontSize: '13px' }}>Luego ingresa los scores hoyo a hoyo.</div>
          </div>
        )}

        </>}
      </div>
    </div>
  )
}
