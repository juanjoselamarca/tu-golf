'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { GWIDisplay } from '@/components/GWIDisplay'

interface DemoProfile {
  player: { name: string; pais: string; indice: number; categoria: string; member_since: string }
  gwi: number; gwi_delta: number; gwi_level: string; gwi_series: number[]
  stats: {
    avg_score: number; best_score: number; worst_score: number; total_rounds: number
    avg_putts: number; gir_pct: number; fairways_pct: number
    front9_avg: number; back9_avg: number
    par3_avg: number; par4_avg: number; par5_avg: number
    scoring_trend: number[]
    birdies_total: number; eagles_total: number; bogeys_total: number; pars_total: number; doubles_total: number
  }
  patterns: Array<{ type: string; active: boolean; color: string; title: string; description: string }>
  historial: Array<{
    index: number; date: string; course: string; gross: number; neto: number
    score_vs_par: number; front9: number; back9: number; scores: number[]
    gir: number; putts: number; fairways: number
  }>
}

const TABS = ['Resumen', 'Estadisticas', 'Historial', 'Analisis']
const GOLD = '#c4992a'
const BG = '#070d18'
const CARD = 'rgba(255,255,255,0.03)'
const CARD_BORDER = 'rgba(255,255,255,0.06)'
const GREEN = '#00e676'
const RED = '#ff1744'
const MUTED = 'rgba(255,255,255,0.35)'
const MONO = 'var(--font-dm-mono), monospace'
const SERIF = 'var(--font-cormorant), serif'

export default function DemoPage() {
  const [data, setData] = useState<DemoProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(0)
  const [courseFilter, setCourseFilter] = useState('Todo')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/demo/profile')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: MUTED, fontFamily: MONO, fontSize: '13px' }}>Cargando perfil demo...</div>
    </div>
  )

  if (!data) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: RED, fontFamily: MONO, fontSize: '13px' }}>Error al cargar datos demo</div>
    </div>
  )

  const { player, stats, patterns, historial } = data

  const filteredHistorial = courseFilter === 'Todo' ? historial : historial.filter(h => h.course.includes(courseFilter))
  const visibleHistorial = showAll ? filteredHistorial : filteredHistorial.slice(0, 10)

  const bestGross = Math.min(...historial.map(r => r.gross))

  const vsParColor = (v: number) => v < 0 ? GREEN : v > 0 ? RED : 'rgba(255,255,255,0.4)'
  const vsParBg = (v: number) => v < 0 ? 'rgba(0,230,118,0.12)' : v > 0 ? 'rgba(255,23,68,0.12)' : 'rgba(255,255,255,0.06)'
  const vsParText = (v: number) => v < 0 ? String(v) : v > 0 ? `+${v}` : 'E'
  const borderColor = (v: number) => v < 0 ? GREEN : v > 0 ? RED : 'rgba(255,255,255,0.12)'

  const shortCourse = (name: string) => name.replace(/^Club de Golf\s+/, '').replace(/\s+Country Club$/, '')

  const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  }

  const patternLabel = (type: string) => {
    if (type.includes('specialist') || type.includes('par')) return 'FORTALEZA'
    if (type.includes('back9') || type.includes('analysis')) return 'PATRON'
    if (type.includes('improv') || type.includes('trend')) return 'TENDENCIA'
    return 'INSIGHT'
  }

  const patternBorderColor = (color: string) => color === 'green' ? GREEN : color === 'yellow' ? '#ffab40' : RED

  // SVG scoring trend with par 72 reference
  const renderTrendSVG = () => {
    const vals = stats.scoring_trend.slice(-10)
    if (vals.length < 2) return null
    const allVals = [...vals, 72]
    const min = Math.min(...allVals) - 2
    const max = Math.max(...allVals) + 2
    const w = 300, h = 160, padX = 30, padY = 20
    const chartW = w - padX * 2, chartH = h - padY * 2

    const toX = (i: number) => padX + (i / (vals.length - 1)) * chartW
    const toY = (v: number) => padY + chartH - ((v - min) / (max - min)) * chartH

    const parY = toY(72)
    const points = vals.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')

    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '160px' }} preserveAspectRatio="xMidYMid meet">
        {/* Par 72 reference line */}
        <line x1={padX} y1={parY} x2={w - padX} y2={parY} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4,4" />
        <text x={w - padX + 4} y={parY + 3} fill={MUTED} fontSize="9" fontFamily={MONO}>72</text>

        {/* Grid lines */}
        {[min, min + (max - min) / 2, max].map((v, i) => (
          <text key={i} x={padX - 4} y={toY(v) + 3} fill="rgba(255,255,255,0.15)" fontSize="8" fontFamily={MONO} textAnchor="end">
            {Math.round(v)}
          </text>
        ))}

        {/* Area fill */}
        <polygon
          points={`${toX(0)},${toY(vals[0])} ${points} ${toX(vals.length - 1)},${h - padY} ${toX(0)},${h - padY}`}
          fill={`url(#trendGrad)`} opacity="0.3"
        />
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.4" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Line */}
        <polyline points={points} fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots */}
        {vals.map((v, i) => (
          <g key={i}>
            <circle cx={toX(i)} cy={toY(v)} r="3.5" fill={BG} stroke={GOLD} strokeWidth="1.5" />
            <text x={toX(i)} y={toY(v) - 8} fill="rgba(255,255,255,0.5)" fontSize="8" fontFamily={MONO} textAnchor="middle">
              {v}
            </text>
          </g>
        ))}
      </svg>
    )
  }

  return (
    <div style={{ background: BG, minHeight: '100vh', color: '#fff', paddingBottom: '80px' }}>

      {/* === BANNER === */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'linear-gradient(90deg, rgba(196,153,42,0.12), rgba(196,153,42,0.04))',
        borderBottom: '1px solid rgba(196,153,42,0.25)',
        padding: '10px 16px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: GOLD, fontFamily: MONO, letterSpacing: '0.05em' }}>
          PERFIL DEMO
        </span>
        <Link href="/register" style={{
          border: '1px solid rgba(196,153,42,0.5)', background: 'rgba(196,153,42,0.1)',
          color: GOLD, padding: '6px 16px', borderRadius: '8px',
          fontSize: '13px', fontWeight: 600, textDecoration: 'none',
        }}>
          Crear mi cuenta gratis
        </Link>
      </div>

      {/* === HEADER — single consolidated card === */}
      <div style={{
        margin: '16px', padding: '20px',
        background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: '16px',
      }}>
        {/* Desktop: avatar left + info right. Mobile: centered stack */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Avatar */}
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${GOLD}, #8a6d1b)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', fontWeight: 700, color: '#fff', fontFamily: SERIF,
          }}>CM</div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: '180px' }}>
            <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: SERIF }}>
              {player.name}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: MONO, marginTop: '2px' }}>
              Indice {player.indice} · Cat {player.categoria} · {stats.total_rounds} rondas
            </div>

            {/* GWI bar — single instance */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '9px', color: MUTED, fontFamily: MONO, letterSpacing: '0.1em' }}>GWI</span>
                <span style={{ fontSize: '28px', fontWeight: 300, color: GOLD, fontFamily: SERIF, lineHeight: 1 }}>{data.gwi.toFixed(1)}</span>
              </div>
              <span style={{
                fontSize: '12px', fontFamily: MONO, fontWeight: 500,
                color: data.gwi_delta > 0 ? GREEN : data.gwi_delta < 0 ? RED : MUTED,
              }}>
                {data.gwi_delta > 0 ? '+' : ''}{data.gwi_delta.toFixed(1)}
              </span>
              <span style={{
                padding: '2px 8px', borderRadius: '8px', fontSize: '9px', fontWeight: 600,
                background: 'rgba(201,168,76,0.12)', color: GOLD, fontFamily: MONO, letterSpacing: '0.08em',
              }}>{data.gwi_level}</span>
            </div>
          </div>
        </div>
      </div>

      {/* === TAB BAR === */}
      <div style={{ position: 'relative', borderBottom: `1px solid ${CARD_BORDER}` }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'flex', minWidth: 'max-content', padding: '0 16px' }}>
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)} style={{
              padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === i ? GOLD : 'rgba(255,255,255,0.4)',
              fontSize: '13px', fontWeight: activeTab === i ? 700 : 400,
              borderBottom: activeTab === i ? `2px solid ${GOLD}` : '2px solid transparent',
              fontFamily: MONO, whiteSpace: 'nowrap',
            }}>{tab}</button>
          ))}
        </div>
        </div>
        {/* Scroll fade indicator */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px',
          background: `linear-gradient(to right, transparent, ${BG})`,
          pointerEvents: 'none',
        }} />
      </div>

      {/* === TAB CONTENT === */}
      <div style={{ padding: '20px 16px' }}>

        {/* ——— TAB RESUMEN ——— */}
        {activeTab === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* 2-col on desktop: gauge left, recent rounds right */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {/* Left: GWI gauge */}
              <div style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: '14px', padding: '20px' }}>
                <GWIDisplay
                  gwi={data.gwi} delta={data.gwi_delta} series={data.gwi_series}
                  level={data.gwi_level} totalRounds={stats.total_rounds}
                  bestRound={stats.best_score} trend={data.gwi_delta > 0 ? 'up' : data.gwi_delta < 0 ? 'down' : 'stable'}
                  vsIndex={null}
                />
              </div>

              {/* Right: Recent rounds */}
              <div>
                <div style={{ fontSize: '11px', color: MUTED, fontFamily: MONO, marginBottom: '10px', letterSpacing: '0.08em' }}>ULTIMAS 5 RONDAS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {historial.slice(0, 5).map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: CARD, borderRadius: '10px', padding: '10px 14px',
                      borderLeft: `3px solid ${borderColor(r.score_vs_par)}`,
                    }}>
                      <div>
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>{shortCourse(r.course)}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: MONO }}>{fmtDate(r.date)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', fontFamily: MONO }}>{r.gross}</span>
                        <span style={{
                          padding: '2px 8px', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, fontWeight: 500,
                          background: vsParBg(r.score_vs_par), color: vsParColor(r.score_vs_par),
                        }}>{vsParText(r.score_vs_par)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { label: 'Promedio', value: stats.avg_score.toFixed(1) },
                { label: 'Mejor', value: String(stats.best_score) },
                { label: 'GIR%', value: `${stats.gir_pct}%` },
                { label: 'Putts avg', value: stats.avg_putts.toFixed(1) },
              ].map((s, i) => (
                <div key={i} style={{
                  background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: '10px', padding: '12px 8px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: GOLD, fontFamily: SERIF }}>{s.value}</div>
                  <div style={{ fontSize: '9px', color: MUTED, fontFamily: MONO, marginTop: '4px', letterSpacing: '0.05em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ——— TAB ESTADISTICAS ——— */}
        {activeTab === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Scoring trend SVG */}
            <div>
              <div style={{ fontSize: '11px', color: MUTED, fontFamily: MONO, marginBottom: '10px', letterSpacing: '0.08em' }}>TENDENCIA DE SCORING</div>
              <div style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: '12px', padding: '16px' }}>
                {renderTrendSVG()}
              </div>
            </div>

            {/* Par performance — dual bars */}
            <div>
              <div style={{ fontSize: '11px', color: MUTED, fontFamily: MONO, marginBottom: '10px', letterSpacing: '0.08em' }}>RENDIMIENTO POR PAR</div>
              <div style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { label: 'Par 3', avg: stats.par3_avg, par: 3 },
                  { label: 'Par 4', avg: stats.par4_avg, par: 4 },
                  { label: 'Par 5', avg: stats.par5_avg, par: 5 },
                ].map((p, i) => {
                  const maxVal = p.par + 1.5
                  const parPct = ((p.par - (p.par - 0.5)) / (maxVal - (p.par - 0.5))) * 100
                  const avgPct = ((p.avg - (p.par - 0.5)) / (maxVal - (p.par - 0.5))) * 100
                  const color = p.avg <= p.par ? GREEN : p.avg <= p.par + 0.5 ? GOLD : RED
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontFamily: MONO }}>{p.label}</span>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <span style={{ fontSize: '12px', color: MUTED, fontFamily: MONO }}>par {p.par}</span>
                          <span style={{ fontSize: '12px', color, fontFamily: MONO, fontWeight: 600 }}>{p.avg.toFixed(2)}</span>
                        </div>
                      </div>
                      {/* Dual bar track */}
                      <div style={{ position: 'relative', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }}>
                        {/* Par reference mark */}
                        <div style={{
                          position: 'absolute', left: `${Math.min(100, Math.max(0, parPct))}%`, top: '-2px',
                          width: '1px', height: '12px', background: 'rgba(255,255,255,0.2)',
                        }} />
                        {/* Avg fill */}
                        <div style={{
                          height: '100%', width: `${Math.min(100, Math.max(4, avgPct))}%`,
                          background: color, borderRadius: '4px', transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Front 9 vs Back 9 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { label: 'Front 9', value: stats.front9_avg.toFixed(1) },
                { label: 'Back 9', value: stats.back9_avg.toFixed(1) },
              ].map((s, i) => (
                <div key={i} style={{
                  background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: '12px', padding: '16px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '9px', color: MUTED, fontFamily: MONO, letterSpacing: '0.1em', marginBottom: '6px' }}>{s.label}</div>
                  <div style={{ fontSize: '28px', fontWeight: 600, color: GOLD, fontFamily: SERIF }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Score distribution — proportional colored bars + percentages */}
            <div>
              <div style={{ fontSize: '11px', color: MUTED, fontFamily: MONO, marginBottom: '10px', letterSpacing: '0.08em' }}>DISTRIBUCION DE SCORES</div>
              <div style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: '12px', padding: '16px' }}>
                {(() => {
                  const items = [
                    { label: 'Eagles', count: stats.eagles_total, color: '#00e676' },
                    { label: 'Birdies', count: stats.birdies_total, color: '#4caf50' },
                    { label: 'Pars', count: stats.pars_total, color: GOLD },
                    { label: 'Bogeys', count: stats.bogeys_total, color: '#ffab40' },
                    { label: 'Dobles+', count: stats.doubles_total, color: '#ff4444' },
                  ]
                  const total = items.reduce((a, d) => a + d.count, 0) || 1
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {items.map((d, i) => {
                        const pct = (d.count / total) * 100
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ width: '52px', fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontFamily: MONO, textAlign: 'right' }}>{d.label}</span>
                            <div style={{ flex: 1, height: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.max(2, pct)}%`, background: d.color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
                            </div>
                            <span style={{ width: '28px', fontSize: '11px', color: d.color, fontFamily: MONO, fontWeight: 600, textAlign: 'right' }}>{d.count}</span>
                            <span style={{ width: '36px', fontSize: '10px', color: MUTED, fontFamily: MONO }}>{pct.toFixed(0)}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ——— TAB HISTORIAL ——— */}
        {activeTab === 2 && (
          <div>
            {/* Summary header */}
            <div style={{
              display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap',
              background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: '12px', padding: '14px 16px',
            }}>
              {[
                { label: 'Rondas', value: String(filteredHistorial.length) },
                { label: 'Promedio', value: filteredHistorial.length > 0 ? (filteredHistorial.reduce((a, r) => a + r.gross, 0) / filteredHistorial.length).toFixed(1) : '--' },
                { label: 'Mejor', value: filteredHistorial.length > 0 ? String(Math.min(...filteredHistorial.map(r => r.gross))) : '--' },
                { label: 'Peor', value: filteredHistorial.length > 0 ? String(Math.max(...filteredHistorial.map(r => r.gross))) : '--' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', flex: 1, minWidth: '50px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: GOLD, fontFamily: SERIF }}>{s.value}</div>
                  <div style={{ fontSize: '9px', color: MUTED, fontFamily: MONO, letterSpacing: '0.05em' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Course filter */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {['Todo', 'Los Leones', 'Prince of Wales', 'La Dehesa'].map(c => (
                <button key={c} onClick={() => { setCourseFilter(c); setShowAll(false) }} style={{
                  padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: courseFilter === c ? GOLD : 'rgba(255,255,255,0.06)',
                  color: courseFilter === c ? '#111' : 'rgba(255,255,255,0.5)',
                  fontSize: '12px', fontWeight: courseFilter === c ? 700 : 400, fontFamily: MONO,
                }}>{c}</button>
              ))}
            </div>

            {/* Round cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {visibleHistorial.map((r, i) => {
                const isBest = r.gross === bestGross
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: CARD, borderRadius: '10px', padding: '10px 14px',
                    borderLeft: `3px solid ${borderColor(r.score_vs_par)}`,
                    border: isBest ? `1px solid rgba(196,153,42,0.3)` : `1px solid ${CARD_BORDER}`,
                    borderLeftWidth: '3px', borderLeftStyle: 'solid', borderLeftColor: borderColor(r.score_vs_par),
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontFamily: MONO, minWidth: '20px' }}>#{r.index}</span>
                      <div>
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>
                          {shortCourse(r.course)}{isBest ? ' \u2605' : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: MONO }}>{fmtDate(r.date)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', fontFamily: MONO }}>{r.gross}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontFamily: MONO, fontWeight: 500,
                        background: vsParBg(r.score_vs_par), color: vsParColor(r.score_vs_par),
                      }}>{vsParText(r.score_vs_par)}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {!showAll && filteredHistorial.length > 10 && (
              <button onClick={() => setShowAll(true)} style={{
                width: '100%', padding: '12px', marginTop: '12px', background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${CARD_BORDER}`, borderRadius: '10px', cursor: 'pointer',
                color: GOLD, fontSize: '13px', fontFamily: MONO,
              }}>Ver mas ({filteredHistorial.length - 10} rondas)</button>
            )}
          </div>
        )}

        {/* ——— TAB ANALISIS ——— */}
        {activeTab === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {patterns.map((p, i) => {
              const bc = patternBorderColor(p.color)
              const label = patternLabel(p.type)
              return (
                <div key={i} style={{
                  background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: '12px', padding: '16px',
                  borderLeft: `3px solid ${bc}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700,
                      background: `${bc}18`, color: bc, fontFamily: MONO, letterSpacing: '0.08em',
                    }}>{label}</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{p.title}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginBottom: '12px' }}>{p.description}</div>

                  {/* Inline comparison bar */}
                  {p.type === 'back9_analysis' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: MUTED, fontFamily: MONO, width: '40px' }}>F9</span>
                      <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }}>
                        <div style={{ height: '100%', width: `${(stats.front9_avg / 50) * 100}%`, background: GREEN, borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontFamily: MONO, width: '28px' }}>{stats.front9_avg}</span>
                    </div>
                  )}
                  {p.type === 'back9_analysis' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                      <span style={{ fontSize: '10px', color: MUTED, fontFamily: MONO, width: '40px' }}>B9</span>
                      <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }}>
                        <div style={{ height: '100%', width: `${(stats.back9_avg / 50) * 100}%`, background: '#ffab40', borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontFamily: MONO, width: '28px' }}>{stats.back9_avg}</span>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Premium CTA */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(196,153,42,0.08), rgba(196,153,42,0.02))',
              border: '1px solid rgba(196,153,42,0.2)', borderRadius: '14px', padding: '24px', textAlign: 'center', marginTop: '10px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: '8px' }}>
                Analisis personalizado con IA
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px', lineHeight: 1.5 }}>
                Registra tus rondas y obtiene patrones, predicciones y recomendaciones basadas en tu juego real.
              </div>
              <Link href="/register" style={{
                display: 'inline-block', border: `1px solid ${GOLD}`, background: 'rgba(196,153,42,0.1)',
                color: GOLD, padding: '10px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
              }}>
                Registrarme gratis
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Mobile CTA fixed bottom */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(to top, #070d18 70%, transparent)',
      }}
        className="block md:hidden"
      >
        <Link href="/register" style={{
          display: 'block', width: '100%', textAlign: 'center',
          background: `linear-gradient(135deg, ${GOLD}, #a8821e)`, color: '#fff',
          padding: '14px', borderRadius: '12px',
          fontSize: '15px', fontWeight: 700, textDecoration: 'none',
          boxShadow: '0 4px 20px rgba(196,153,42,0.3)',
        }}>
          Crear mi cuenta gratis
        </Link>
      </div>
    </div>
  )
}
