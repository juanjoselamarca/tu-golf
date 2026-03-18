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

const TABS = ['Resumen', 'Estadísticas', 'Historial', 'Análisis']
const GOLD = '#c4992a'
const BG = '#070d18'

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
      <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-dm-mono), monospace', fontSize: '13px' }}>Cargando perfil demo...</div>
    </div>
  )

  if (!data) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#ff4444', fontFamily: 'var(--font-dm-mono), monospace', fontSize: '13px' }}>Error al cargar datos demo</div>
    </div>
  )

  const { player, stats, patterns, historial } = data

  const filteredHistorial = courseFilter === 'Todo' ? historial : historial.filter(h => h.course === courseFilter)
  const visibleHistorial = showAll ? filteredHistorial : filteredHistorial.slice(0, 10)

  const vsParBadge = (v: number) => {
    const color = v < 0 ? '#00e676' : v > 0 ? '#ff4444' : 'rgba(255,255,255,0.4)'
    const bg = v < 0 ? 'rgba(0,230,118,0.12)' : v > 0 ? 'rgba(255,68,68,0.12)' : 'rgba(255,255,255,0.06)'
    const text = v < 0 ? String(v) : v > 0 ? `+${v}` : 'E'
    return <span style={{ padding: '2px 8px', borderRadius: '8px', background: bg, color, fontSize: '12px', fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 500 }}>{text}</span>
  }

  const scorePill = (score: number, par: number) => {
    const diff = score - par
    const color = diff < 0 ? '#00e676' : diff > 0 ? '#ff4444' : 'rgba(255,255,255,0.6)'
    return <span style={{ padding: '4px 10px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color, fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-dm-mono), monospace' }}>{score}</span>
  }

  // SVG scoring trend
  const renderTrend = () => {
    const vals = stats.scoring_trend.slice(-10)
    if (vals.length < 2) return null
    const min = Math.min(...vals) - 2
    const max = Math.max(...vals) + 2
    const w = 100, h = 180
    const points = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / (max - min)) * (h - 20) - 10}`).join(' ')
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '180px' }} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {vals.map((v, i) => {
          const x = (i / (vals.length - 1)) * w
          const y = h - ((v - min) / (max - min)) * (h - 20) - 10
          return <circle key={i} cx={x} cy={y} r="2.5" fill={GOLD} />
        })}
      </svg>
    )
  }

  const patternBorder = (color: string) => color === 'green' ? '#00e676' : color === 'yellow' ? '#ffab40' : '#ff4444'

  return (
    <div style={{ background: BG, minHeight: '100vh', color: '#fff', paddingBottom: '80px' }}>
      {/* Demo banner */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: `linear-gradient(135deg, ${GOLD}, #8a6d1b)`,
        padding: '10px 16px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-dm-mono), monospace' }}>
          ✦ PERFIL DEMO
        </span>
        <Link href="/register" style={{
          background: '#fff', color: '#111', padding: '6px 16px', borderRadius: '8px',
          fontSize: '13px', fontWeight: 600, textDecoration: 'none',
        }}>
          Crear mi cuenta gratis →
        </Link>
      </div>

      {/* Profile header */}
      <div style={{ padding: '28px 16px 20px', textAlign: 'center' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 12px',
          background: `linear-gradient(135deg, ${GOLD}, #8a6d1b)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-cormorant), serif',
        }}>CM</div>
        <div style={{ fontSize: '22px', fontWeight: 600, fontFamily: 'var(--font-cormorant), serif' }}>
          {player.name} <span style={{ fontSize: '20px' }}>🇨🇱</span>
        </div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '4px', fontFamily: 'var(--font-dm-mono), monospace' }}>
          Índice oficial: {player.indice} · Categoría {player.categoria}
        </div>

        {/* GWI hero bar */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px',
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'GWI', value: data.gwi.toFixed(1) },
            { label: 'DELTA', value: `${data.gwi_delta > 0 ? '+' : ''}${data.gwi_delta.toFixed(1)}`, color: data.gwi_delta > 0 ? '#00e676' : data.gwi_delta < 0 ? '#ff4444' : undefined },
            { label: 'NIVEL', value: data.gwi_level },
            { label: 'ESTADO', value: data.gwi_delta > 0 ? 'Mejorando' : data.gwi_delta < 0 ? 'Bajando' : 'Estable' },
          ].map((m, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: '60px' }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', fontFamily: 'var(--font-dm-mono), monospace', marginBottom: '4px' }}>{m.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: m.color ?? GOLD, fontFamily: 'var(--font-cormorant), serif' }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', minWidth: 'max-content', padding: '0 16px' }}>
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)} style={{
              padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === i ? GOLD : 'rgba(255,255,255,0.4)',
              fontSize: '13px', fontWeight: activeTab === i ? 700 : 400,
              borderBottom: activeTab === i ? `2px solid ${GOLD}` : '2px solid transparent',
              fontFamily: 'var(--font-dm-mono), monospace', whiteSpace: 'nowrap',
            }}>{tab}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '20px 16px' }}>

        {/* TAB RESUMEN */}
        {activeTab === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <GWIDisplay
              gwi={data.gwi} delta={data.gwi_delta} series={data.gwi_series}
              level={data.gwi_level} totalRounds={stats.total_rounds}
              bestRound={stats.best_score} trend={data.gwi_delta > 0 ? 'up' : data.gwi_delta < 0 ? 'down' : 'stable'}
              vsIndex={null}
            />

            {/* Last 5 rounds */}
            <div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-dm-mono), monospace', marginBottom: '10px', letterSpacing: '0.08em' }}>ÚLTIMAS 5 RONDAS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {historial.slice(0, 5).map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '10px 14px',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>{r.course}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-dm-mono), monospace' }}>{r.date}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {scorePill(r.gross, 72)}
                      {vsParBadge(r.score_vs_par)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { label: 'Promedio', value: stats.avg_score.toFixed(1) },
                { label: 'Mejor', value: String(stats.best_score) },
                { label: 'GIR%', value: `${stats.gir_pct}%` },
                { label: 'Putts avg', value: stats.avg_putts.toFixed(1) },
              ].map((s, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px 8px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: GOLD, fontFamily: 'var(--font-cormorant), serif' }}>{s.value}</div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-mono), monospace', marginTop: '4px', letterSpacing: '0.05em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB ESTADÍSTICAS */}
        {activeTab === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Scoring trend */}
            <div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-dm-mono), monospace', marginBottom: '10px', letterSpacing: '0.08em' }}>TENDENCIA DE SCORING</div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
                {renderTrend()}
              </div>
            </div>

            {/* Par performance */}
            <div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-dm-mono), monospace', marginBottom: '10px', letterSpacing: '0.08em' }}>RENDIMIENTO POR PAR</div>
              {[
                { label: 'Par 3', avg: stats.par3_avg, par: 3 },
                { label: 'Par 4', avg: stats.par4_avg, par: 4 },
                { label: 'Par 5', avg: stats.par5_avg, par: 5 },
              ].map((p, i) => {
                const pct = Math.min((p.avg / (p.par + 2)) * 100, 100)
                const color = p.avg <= p.par ? '#00e676' : p.avg <= p.par + 0.5 ? GOLD : '#ff4444'
                return (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{p.label}</span>
                      <span style={{ fontSize: '12px', color, fontFamily: 'var(--font-dm-mono), monospace' }}>{p.avg.toFixed(2)}</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Front 9 vs Back 9 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { label: 'Front 9', value: stats.front9_avg.toFixed(1) },
                { label: 'Back 9', value: stats.back9_avg.toFixed(1) },
              ].map((s, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', marginBottom: '6px' }}>{s.label}</div>
                  <div style={{ fontSize: '28px', fontWeight: 600, color: GOLD, fontFamily: 'var(--font-cormorant), serif' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Score distribution */}
            <div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-dm-mono), monospace', marginBottom: '10px', letterSpacing: '0.08em' }}>DISTRIBUCIÓN DE SCORES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                {[
                  { label: 'Eagles', count: stats.eagles_total, color: '#00e676' },
                  { label: 'Birdies', count: stats.birdies_total, color: '#4caf50' },
                  { label: 'Pars', count: stats.pars_total, color: GOLD },
                  { label: 'Bogeys', count: stats.bogeys_total, color: '#ffab40' },
                  { label: 'Dobles+', count: stats.doubles_total, color: '#ff4444' },
                ].map((d, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '10px 4px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: d.color, fontFamily: 'var(--font-cormorant), serif' }}>{d.count}</div>
                    <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-mono), monospace', marginTop: '4px' }}>{d.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB HISTORIAL */}
        {activeTab === 2 && (
          <div>
            {/* Course filter */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {['Todo', 'Los Leones', 'Prince of Wales', 'La Dehesa'].map(c => (
                <button key={c} onClick={() => { setCourseFilter(c); setShowAll(false) }} style={{
                  padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: courseFilter === c ? GOLD : 'rgba(255,255,255,0.06)',
                  color: courseFilter === c ? '#111' : 'rgba(255,255,255,0.5)',
                  fontSize: '12px', fontWeight: courseFilter === c ? 700 : 400,
                  fontFamily: 'var(--font-dm-mono), monospace',
                }}>{c}</button>
              ))}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['#', 'Fecha', 'Cancha', 'Gross', 'vs Par'].map(h => (
                      <th key={h} style={{
                        padding: '8px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.35)',
                        fontSize: '10px', fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 500, letterSpacing: '0.08em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleHistorial.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px', color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-dm-mono), monospace', fontSize: '11px' }}>{r.index}</td>
                      <td style={{ padding: '10px', color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-dm-mono), monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td style={{ padding: '10px', color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{r.course}</td>
                      <td style={{ padding: '10px', color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontFamily: 'var(--font-dm-mono), monospace' }}>{r.gross}</td>
                      <td style={{ padding: '10px' }}>{vsParBadge(r.score_vs_par)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!showAll && filteredHistorial.length > 10 && (
              <button onClick={() => setShowAll(true)} style={{
                width: '100%', padding: '12px', marginTop: '12px', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', cursor: 'pointer',
                color: GOLD, fontSize: '13px', fontFamily: 'var(--font-dm-mono), monospace',
              }}>Ver más ({filteredHistorial.length - 10} rondas)</button>
            )}
          </div>
        )}

        {/* TAB ANÁLISIS */}
        {activeTab === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {patterns.map((p, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px',
                borderLeft: `3px solid ${patternBorder(p.color)}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                    background: `${patternBorder(p.color)}18`, color: patternBorder(p.color),
                    fontFamily: 'var(--font-dm-mono), monospace',
                  }}>{p.type}</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{p.title}</span>
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{p.description}</div>
              </div>
            ))}

            {/* CTA */}
            <div style={{
              background: `linear-gradient(135deg, ${GOLD}12, ${GOLD}06)`,
              border: `1px solid ${GOLD}30`, borderRadius: '14px', padding: '24px', textAlign: 'center', marginTop: '10px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: '8px' }}>
                ¿Quieres ver los patrones de tu propio juego?
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>
                Registra tus rondas y obtén análisis personalizado con inteligencia artificial.
              </div>
              <Link href="/register" style={{
                display: 'inline-block', background: GOLD, color: '#111', padding: '10px 24px',
                borderRadius: '10px', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
              }}>
                Registrarme gratis →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Mobile CTA fixed bottom */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(to top, #070d18 60%, transparent)',
      }}
        className="block md:hidden"
      >
        <Link href="/register" style={{
          display: 'block', width: '100%', textAlign: 'center',
          background: GOLD, color: '#111', padding: '14px', borderRadius: '12px',
          fontSize: '15px', fontWeight: 700, textDecoration: 'none',
        }}>
          Crear mi cuenta gratis →
        </Link>
      </div>
    </div>
  )
}
