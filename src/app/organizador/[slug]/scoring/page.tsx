'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'

interface CourseHole { numero: number; par: number; stroke_index: number }
interface Round { id: string; status: string; total_gross: number; total_net: number; total_points: number }
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
  if (d === 0)  return '1px solid rgba(255,255,255,0.10)'
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

  // Estadísticas adicionales por hoyo
  const [showStats,    setShowStats]    = useState(false)
  const [holePutts,    setHolePutts]    = useState<Record<number, number | null>>({})
  const [holeFairway,  setHoleFairway]  = useState<Record<number, boolean | null>>({})
  const [holeGir,      setHoleGir]      = useState<Record<number, boolean | null>>({})

  // Load all data
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()

      const { data: t } = await supabase
        .from('tournaments')
        .select('id, name, slug, format, hole_count, courses(id, nombre, par_total, slope_rating, course_rating)')
        .eq('slug', slug)
        .single()

      if (!t) { setLoading(false); return }
      setTournament(t as unknown as Tournament)

      const { data: p } = await supabase
        .from('players')
        .select('id, handicap_at_registration, profiles(name), rounds(id, status, total_gross, total_net, total_points)')
        .eq('tournament_id', t.id)
        .order('created_at')

      setPlayers((p as unknown as Player[]) || [])

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
  const loadScores = useCallback(async (playerId: string) => {
    const player = players.find((p) => p.id === playerId)
    const roundId = player?.rounds?.[0]?.id
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
  }, [players])

  useEffect(() => {
    if (selectedId) loadScores(selectedId)
  }, [selectedId, loadScores])

  const handleScoreBlur = async (holeNumber: number, value: string) => {
    const gross = parseInt(value)
    if (isNaN(gross) || !tournament || !selectedId) return

    if (gross < 1 || gross > 20) {
      showWarning('Score inválido', 'El score debe ser entre 1 y 20 golpes.')
      return
    }

    const player = players.find((p) => p.id === selectedId)
    const round  = player?.rounds?.[0]
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
        prev.map((p) =>
          p.id === selectedId
            ? { ...p, rounds: [{ ...round, ...updatedRound }] }
            : p
        )
      )
    }
  }

  const handleFinalize = async () => {
    if (!tournament || !selectedId) return
    const player = players.find((p) => p.id === selectedId)
    const round  = player?.rounds?.[0]
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
      .select('id, handicap_at_registration, profiles(name), rounds(id, status, total_gross, total_net, total_points)')
      .eq('tournament_id', tournament.id)
      .order('created_at')
    setPlayers((p as unknown as Player[]) || [])
    setSelectedId(null)
    setCurrentScores({})
    setHolePutts({})
    setHoleFairway({})
    setHoleGir({})
  }

  if (loading) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a8c0' }}>Cargando torneo...</div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fca5a5' }}>Torneo no encontrado.</div>
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '56px', marginBottom: '20px' }}>🏌️</div>
          <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: '#edeae4', marginBottom: '10px' }}>
            Sin jugadores inscritos
          </h3>
          <p style={{ color: '#94a8c0', marginBottom: '24px', fontSize: '15px' }}>
            Inscribe jugadores antes de ingresar scores
          </p>
          <button
            onClick={() => window.location.href = `/organizador/${slug}/jugadores`}
            style={{ background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '15px', padding: '12px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
          >
            Inscribir jugadores →
          </button>
        </div>
      </div>
    )
  }

  const holeCount      = tournament.hole_count || 18
  const holes          = Array.from({ length: holeCount }, (_, i) => i + 1)
  const selectedPlayer = players.find((p) => p.id === selectedId)
  const selectedRound  = selectedPlayer?.rounds?.[0]
  const filledCount    = holes.filter((h) => currentScores[h] != null).length
  const allFilled      = filledCount === holeCount
  const parTotal       = tournament.courses?.par_total ?? 72

  const grossTotal = holes.reduce((s, h) => s + (currentScores[h] ?? 0), 0)
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
    <div style={{ background: '#070d18', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#edeae4', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {tournament.name}
            <span style={{ fontSize: '12px', fontFamily: 'DM Sans, sans-serif', background: 'rgba(22,163,74,0.15)', color: '#4ade80', border: '1px solid rgba(22,163,74,0.4)', padding: '3px 10px', borderRadius: '20px', animation: 'pulse 2s infinite' }}>
              ● EN VIVO
            </span>
            {saving && <span style={{ fontSize: '12px', color: '#94a8c0', fontFamily: 'DM Sans, sans-serif' }}>Guardando...</span>}
          </h1>
          <Link href="/dashboard" style={{ color: '#94a8c0', fontSize: '12px', textDecoration: 'none' }}>← Dashboard</Link>
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

        {/* Player cards */}
        <div style={{ overflowX: 'auto', marginBottom: '28px' }}>
          <div style={{ display: 'flex', gap: '12px', padding: '4px 0' }}>
            {players.map((p) => {
              const round      = p.rounds?.[0]
              const isSelected = p.id === selectedId
              const isDone     = round?.status === 'completed'
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id)
                    setCurrentScores({})
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
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSelected ? '#c4992a' : 'rgba(122,143,168,0.2)', color: isSelected ? '#070d18' : '#edeae4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', margin: '0 auto 8px' }}>
                    {getInitials(p.profiles?.name || '?')}
                  </div>
                  <div style={{ color: '#edeae4', fontSize: '12px', fontWeight: 500, lineHeight: 1.2, marginBottom: '4px' }}>
                    {p.profiles?.name?.split(' ')[0] || '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: isDone ? '#4ade80' : '#94a8c0' }}>
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
                <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#edeae4' }}>{selectedPlayer.profiles?.name}</span>
                <span style={{ color: '#94a8c0', fontSize: '13px', marginLeft: '10px' }}>HCP {selectedPlayer.handicap_at_registration ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#94a8c0', marginBottom: '2px' }}>GROSS</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#edeae4' }}>{grossTotal || '—'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#94a8c0', marginBottom: '2px' }}>NET</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: netTotal < 0 ? '#4ade80' : netTotal > 0 ? '#f87171' : '#edeae4' }}>
                    {grossTotal ? (netTotal <= 0 ? netTotal : `+${netTotal}`) : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#94a8c0', marginBottom: '2px' }}>vs PAR</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#94a8c0' }}>
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
                      background: hasErr ? 'rgba(220,38,38,0.15)' : haScore ? scoreBackground(gross, par) : 'rgba(7,13,24,0.5)',
                      border:     hasErr ? '2px solid #dc2626' : haScore ? scoreBorder(gross, par) : '1px solid rgba(122,143,168,0.15)',
                      borderRadius: '8px',
                      padding: '8px 4px',
                      textAlign: 'center',
                      animation: hasErr ? 'pulse 1s ease-in-out 3' : 'none',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#94a8c0', marginBottom: '2px' }}>H{holeNum}</div>
                    <div style={{ fontSize: '10px', color: '#94a8c0', marginBottom: '4px' }}>P{par}</div>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      inputMode="numeric"
                      defaultValue={gross ?? ''}
                      key={`${selectedId}-${holeNum}-${gross}`}
                      onBlur={(e) => handleScoreBlur(holeNum, e.target.value)}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: '#edeae4',
                        textAlign: 'center',
                        fontSize: '18px',
                        fontWeight: 700,
                        padding: '2px 0',
                        cursor: 'text',
                        appearance: 'textfield',
                      }}
                      placeholder="—"
                    />
                  </div>
                )
              })}
            </div>

            {/* ── Estadísticas adicionales (colapsable) ── */}
            <div style={{ borderTop: '1px solid rgba(122,143,168,0.1)' }}>
              <button
                type="button"
                onClick={() => setShowStats(!showStats)}
                style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', color: '#94a8c0', fontSize: '13px' }}
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
                          <th key={h} style={{ color: '#94a8c0', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', padding: '6px 8px', textAlign: 'center' }}>{h}</th>
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
                            <td style={{ textAlign: 'center', color: '#94a8c0', padding: '6px 8px', fontSize: '12px' }}>H{h} P{par}</td>
                            <td style={{ textAlign: 'center', color: '#edeae4', padding: '6px 8px', fontSize: '13px', fontWeight: 600 }}>{gross ?? '—'}</td>

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
                                    net_score: gross, points: 0,
                                    putts: holePutts[h] ?? null,
                                  })})
                                }}
                                style={{ width: '48px', background: 'rgba(7,13,24,0.5)', border: '1px solid rgba(122,143,168,0.2)', borderRadius: '4px', color: '#edeae4', textAlign: 'center', fontSize: '13px', padding: '4px', outline: 'none', appearance: 'textfield' as const, cursor: disabled ? 'not-allowed' : 'text' }}
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
                                          net_score: gross, points: 0, fairway_hit: v,
                                        })})
                                      }}
                                      style={{ padding: '3px 7px', fontSize: '11px', borderRadius: '4px', border: '1px solid', cursor: disabled ? 'not-allowed' : 'pointer',
                                        background:  holeFairway[h] === v ? (v === true ? 'rgba(22,163,74,0.25)' : v === false ? 'rgba(220,38,38,0.2)' : 'rgba(122,143,168,0.15)') : 'transparent',
                                        borderColor: holeFairway[h] === v ? (v === true ? '#16a34a' : v === false ? '#dc2626' : '#94a8c0') : 'rgba(122,143,168,0.2)',
                                        color:       holeFairway[h] === v ? '#edeae4' : '#94a8c0',
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
                                        net_score: gross, points: 0, gir: v,
                                      })})
                                    }}
                                    style={{ padding: '3px 7px', fontSize: '11px', borderRadius: '4px', border: '1px solid', cursor: disabled ? 'not-allowed' : 'pointer',
                                      background:  holeGir[h] === v ? (v === true ? 'rgba(22,163,74,0.25)' : v === false ? 'rgba(220,38,38,0.2)' : 'rgba(122,143,168,0.15)') : 'transparent',
                                      borderColor: holeGir[h] === v ? (v === true ? '#16a34a' : v === false ? '#dc2626' : '#94a8c0') : 'rgba(122,143,168,0.2)',
                                      color:       holeGir[h] === v ? '#edeae4' : '#94a8c0',
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
            {allFilled && selectedRound?.status !== 'completed' && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(196,153,42,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleFinalize}
                  disabled={saving}
                  style={{
                    background: '#c4992a',
                    color: '#070d18',
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

            {selectedRound?.status === 'completed' && (
              <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(22,163,74,0.2)', background: 'rgba(22,163,74,0.05)', textAlign: 'center', color: '#4ade80', fontSize: '14px' }}>
                ✓ Ronda finalizada
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: 'rgba(14,28,47,0.7)', border: '1px solid rgba(122,143,168,0.15)', borderRadius: '14px', padding: '48px', textAlign: 'center', color: '#94a8c0' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>⛳</div>
            <div style={{ fontSize: '16px', color: '#edeae4', marginBottom: '6px' }}>Selecciona un jugador arriba</div>
            <div style={{ fontSize: '13px' }}>Luego ingresa los scores hoyo a hoyo.</div>
          </div>
        )}
      </div>
    </div>
  )
}
