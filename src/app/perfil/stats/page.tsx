'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, PieChart, Pie, Cell,
  ReferenceLine,
} from 'recharts'

/* ── Design tokens ── */
const C = {
  bg: '#080d0a',
  card: 'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.07)',
  green: '#1a9e6e',
  greenDim: 'rgba(26,158,110,0.15)',
  gold: '#c4992a',
  red: '#e05a4e',
  ivory: 'rgba(240,235,224,0.85)',
  muted: 'rgba(240,235,224,0.35)',
}

const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.cardBorder}`,
  borderRadius: 16,
  padding: 20,
}

/* ── Types ── */
interface Round {
  id: string
  course_name: string
  tee_color: string | null
  played_at: string
  scores: number[] | null
  total_gross: number
  notes: string | null
  privacy: string
  created_at: string
}

type RangeKey = '5' | '10' | '20' | 'all'

/* ── Helpers ── */
function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

/* ── Component ── */
export default function StatsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [range, setRange] = useState<RangeKey>('all')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  /* ── Load data ── */
  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const { data } = await supabase
      .from('historical_rounds')
      .select('id, course_name, tee_color, played_at, scores, total_gross, notes, privacy, created_at')
      .order('played_at', { ascending: true })

    setAllRounds((data as Round[]) || [])
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  /* ── Filtered rounds ── */
  const rounds = useMemo(() => {
    if (range === 'all') return allRounds
    const n = parseInt(range)
    return allRounds.slice(-n)
  }, [allRounds, range])

  /* ── Derived stats ── */
  const hasRounds = rounds.length > 0
  const avgScore = hasRounds
    ? rounds.reduce((s, r) => s + r.total_gross, 0) / rounds.length
    : 0
  const bestRound = hasRounds
    ? Math.min(...rounds.map(r => r.total_gross))
    : 0

  // Count birdies/eagles from scores arrays (assuming par 72 = 4 avg per hole)
  const { birdies, eagles } = useMemo(() => {
    let b = 0, e = 0
    for (const r of rounds) {
      if (!r.scores || !Array.isArray(r.scores)) continue
      for (const s of r.scores) {
        if (s === null || s === undefined) continue
        // Assume par 4 per hole as average
        if (s <= 2) e++
        else if (s === 3) b++
      }
    }
    return { birdies: b, eagles: e }
  }, [rounds])

  // GWI
  const gwiValue = hasRounds
    ? Math.max(0, Math.min(100, 100 - ((avgScore - 62) * 5)))
    : 0

  // Front 9 vs Back 9
  const nineHoleData = useMemo(() => {
    const eligible = rounds.filter(r => r.scores && Array.isArray(r.scores) && r.scores.length >= 18)
    if (eligible.length < 3) return null
    let front = 0, back = 0
    for (const r of eligible) {
      front += r.scores!.slice(0, 9).reduce((a: number, b: number) => a + (b ?? 0), 0)
      back += r.scores!.slice(9, 18).reduce((a: number, b: number) => a + (b ?? 0), 0)
    }
    return {
      front: (front / eligible.length).toFixed(1),
      back: (back / eligible.length).toFixed(1),
      count: eligible.length,
    }
  }, [rounds])

  // Top 5 rounds
  const topRounds = useMemo(() => {
    return [...rounds].sort((a, b) => a.total_gross - b.total_gross).slice(0, 5)
  }, [rounds])

  /* ── Range toggle ── */
  const ranges: { key: RangeKey; label: string }[] = [
    { key: '5', label: '5R' },
    { key: '10', label: '10R' },
    { key: '20', label: '20R' },
    { key: 'all', label: 'Todo' },
  ]

  /* ── Chart data ── */
  const gwiPieData = [
    { name: 'GWI', value: hasRounds ? gwiValue : 0 },
    { name: 'Rest', value: hasRounds ? 100 - gwiValue : 100 },
  ]

  const lineChartData = rounds.map(r => ({
    date: fmtDate(r.played_at),
    gross: r.total_gross,
  }))

  const scoringTrendChartData = rounds.map(r => ({
    date: fmtDate(r.played_at),
    score: r.total_gross,
    promedio: Math.round(avgScore),
  }))

  /* ── Skeleton ── */
  const Skeleton = ({ w = '100%', h = 16 }: { w?: string | number; h?: number }) => (
    <div style={{
      width: w, height: h, borderRadius: 8,
      background: 'rgba(255,255,255,0.06)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  )

  /* ── Render ── */
  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', padding: '24px 16px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Skeleton h={32} w={200} />
          <div style={{ marginTop: 16 }}><Skeleton h={160} /></div>
          <div style={{ marginTop: 16 }}><Skeleton h={200} /></div>
          <div style={{ marginTop: 16 }}><Skeleton h={200} /></div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }`}</style>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '24px 16px', paddingBottom: 100 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Link href="/perfil" style={{ color: C.muted, fontSize: 14, textDecoration: 'none' }}>
            ← Perfil
          </Link>
        </div>
        <h1 style={{ color: C.ivory, fontSize: 24, fontWeight: 700, margin: '0 0 4px' }}>
          Mis estadísticas
        </h1>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 16px' }}>
          {allRounds.length} ronda{allRounds.length !== 1 ? 's' : ''} registrada{allRounds.length !== 1 ? 's' : ''}
        </p>

        {/* Range toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {ranges.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${range === r.key ? C.green : C.cardBorder}`,
                background: range === r.key ? C.greenDim : 'transparent',
                color: range === r.key ? C.green : C.muted,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* ── GWI Hero ── */}
        <div style={{ ...cardStyle, marginBottom: 16, textAlign: 'center' }}>
          <p style={{ color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
            Golf Wellness Index
          </p>
          <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto' }}>
            {hasRounds ? (
              <>
                {mounted && <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={gwiPieData}
                      cx="50%"
                      cy="50%"
                      startAngle={220}
                      endAngle={-40}
                      innerRadius="78%"
                      outerRadius="100%"
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill={C.green} />
                      <Cell fill={C.greenDim} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>}
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                }}>
                  <span style={{ color: C.green, fontSize: 36, fontWeight: 700 }}>
                    {Math.round(gwiValue)}
                  </span>
                  <br />
                  <span style={{ color: C.muted, fontSize: 11 }}>GWI</span>
                </div>
              </>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', height: '100%',
                border: `3px solid ${C.cardBorder}`, borderRadius: '50%',
              }}>
                <span style={{ color: C.muted, fontSize: 32, fontWeight: 700 }}>--</span>
              </div>
            )}
          </div>
          {!hasRounds && (
            <p style={{ color: C.muted, fontSize: 13, marginTop: 16, fontStyle: 'italic' }}>
              Registra tu primera ronda para ver tu GWI
            </p>
          )}
        </div>

        {/* ── Handicap evolution ── */}
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <p style={{ color: C.ivory, fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Evolución de score
          </p>
          {hasRounds ? (
            <div style={{ height: 200 }}>
              {mounted && <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: C.muted, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: C.muted, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    domain={['dataMin - 5', 'dataMax + 5']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: 8 }}
                    labelStyle={{ color: C.ivory }}
                    itemStyle={{ color: C.ivory }}
                  />
                  <defs>
                    <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.gold} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Line
                    type="monotone"
                    dataKey="gross"
                    stroke={C.gold}
                    strokeWidth={2}
                    dot={{ r: 3, fill: C.gold }}
                    fill="url(#goldFill)"
                    name="Gross"
                  />
                </LineChart>
              </ResponsiveContainer>}
            </div>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: C.muted, fontSize: 13 }}>Sin datos aún</span>
            </div>
          )}
        </div>

        {/* ── Scoring trend ── */}
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <p style={{ color: C.ivory, fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Tendencia de scoring
          </p>
          {hasRounds ? (
            <div style={{ height: 200 }}>
              {mounted && <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoringTrendChartData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: C.muted, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: C.muted, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    domain={['dataMin - 5', 'dataMax + 5']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: 8 }}
                    labelStyle={{ color: C.ivory }}
                    itemStyle={{ color: C.ivory }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={C.gold}
                    strokeWidth={2}
                    dot={{ r: 3, fill: C.gold }}
                    name="Score"
                  />
                  <ReferenceLine
                    y={Math.round(avgScore)}
                    stroke={C.muted}
                    strokeDasharray="6 4"
                    label={{ value: 'Promedio', fill: C.muted, fontSize: 10, position: 'insideTopRight' }}
                  />
                </LineChart>
              </ResponsiveContainer>}
            </div>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: C.muted, fontSize: 13 }}>Sin datos aún</span>
            </div>
          )}
        </div>

        {/* ── Stats grid ── */}
        <div className="stats-grid-desktop" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}>
          {[
            { label: 'Promedio', value: hasRounds ? avgScore.toFixed(1) : '--', color: C.ivory },
            { label: 'Mejor ronda', value: hasRounds ? bestRound : '--', color: C.gold },
            { label: 'Birdies', value: hasRounds ? birdies : '--', color: C.green },
            { label: 'Eagles', value: hasRounds ? eagles : '--', color: C.gold },
          ].map((s, i) => (
            <div key={i} style={{ ...cardStyle, textAlign: 'center' }}>
              <p style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>
                {s.label}
              </p>
              <p style={{ color: s.color, fontSize: 28, fontWeight: 700, margin: 0 }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Front 9 vs Back 9 ── */}
        {nineHoleData && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <p style={{ color: C.ivory, fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
              Front 9 vs Back 9
            </p>
            <p style={{ color: C.muted, fontSize: 12, margin: '0 0 12px' }}>
              Basado en {nineHoleData.count} rondas de 18 hoyos
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                flex: 1, textAlign: 'center', padding: 16,
                background: C.greenDim, borderRadius: 12,
              }}>
                <p style={{ color: C.muted, fontSize: 11, margin: '0 0 4px' }}>Front 9</p>
                <p style={{ color: C.ivory, fontSize: 24, fontWeight: 700, margin: 0 }}>{nineHoleData.front}</p>
              </div>
              <div style={{
                flex: 1, textAlign: 'center', padding: 16,
                background: C.greenDim, borderRadius: 12,
              }}>
                <p style={{ color: C.muted, fontSize: 11, margin: '0 0 4px' }}>Back 9</p>
                <p style={{ color: C.ivory, fontSize: 24, fontWeight: 700, margin: 0 }}>{nineHoleData.back}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Top 5 rounds ── */}
        <div style={{ ...cardStyle }}>
          <p style={{ color: C.ivory, fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Mejores 5 rondas
          </p>
          {topRounds.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topRounds.map((r, i) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: i === 0 ? 'rgba(201,168,76,0.08)' : 'transparent',
                  borderRadius: 10,
                  border: `1px solid ${i === 0 ? 'rgba(201,168,76,0.2)' : C.cardBorder}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      color: i === 0 ? C.gold : C.muted,
                      fontSize: 14, fontWeight: 700, width: 20,
                    }}>
                      #{i + 1}
                    </span>
                    <div>
                      <p style={{ color: C.ivory, fontSize: 13, fontWeight: 500, margin: 0 }}>
                        {r.course_name}
                      </p>
                      <p style={{ color: C.muted, fontSize: 11, margin: 0 }}>
                        {fmtDate(r.played_at)}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    color: i === 0 ? C.gold : C.ivory,
                    fontSize: 20, fontWeight: 700,
                  }}>
                    {r.total_gross}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: 13, fontStyle: 'italic', margin: 0 }}>
              Registra rondas en tu historial para ver tu ranking personal
            </p>
          )}
        </div>

      </div>

      {/* Responsive grid upgrade for desktop */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        @media (min-width: 640px) {
          .stats-grid-desktop {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
      `}</style>
    </div>
  )
}
