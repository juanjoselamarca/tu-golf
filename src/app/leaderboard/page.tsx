/* eslint-disable @next/next/no-img-element */
'use client'

import { useState, Fragment } from 'react'
import { MobileLeaderboard } from '@/components/MobileLeaderboard'
import { GWISparkline } from '@/components/GWISparkline'
import { useDemoSimulation, getScoreVsPar } from '@/hooks/useDemoSimulation'

/* ─── Helpers ─────────────────────────────────────────── */

function formatTot(vspar: number): string {
  if (vspar === 0) return 'E'
  if (vspar > 0) return `+${vspar}`
  return `${vspar}`
}

function totColor(vspar: number): string {
  if (vspar < 0) return '#c4992a'
  if (vspar === 0) return 'rgba(255,255,255,0.6)'
  return '#ff1744'
}

function gwiColor(gwi: number): string {
  if (gwi > 80) return '#00e676'
  if (gwi >= 60) return '#c4992a'
  return '#ff5252'
}

function gwiDeltaColor(delta: number): string {
  if (delta > 0) return '#00e676'
  if (delta < 0) return '#ff1744'
  return 'rgba(255,255,255,0.5)'
}

/* ─── Position Badge ──────────────────────────────────── */

function PosBadge({ pos, positionDelta }: { pos: number; positionDelta: number }) {
  const isTop3 = pos <= 3
  const bg = pos === 1 ? '#c4992a' : pos === 2 ? '#9ca3af' : pos === 3 ? '#b45309' : 'transparent'
  const color = isTop3 ? (pos === 3 ? '#ffffff' : 'var(--brand-dark)') : 'var(--text-2)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
      {isTop3 ? (
        <span
          style={{
            width: 28, height: 28, borderRadius: '50%', background: bg, color,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}
        >
          {pos}
        </span>
      ) : (
        <span style={{ fontSize: 15, fontWeight: 700, color }}>{pos}</span>
      )}
      {positionDelta !== 0 && (
        <span style={{
          fontSize: 9,
          color: positionDelta > 0 ? '#00e676' : '#ff1744',
          fontFamily: 'var(--font-dm-mono), monospace',
        }}>
          {positionDelta > 0 ? `\u25B2${positionDelta}` : `\u25BC${Math.abs(positionDelta)}`}
        </span>
      )}
    </div>
  )
}

/* ─── Main Page ───────────────────────────────────────── */

export default function LeaderboardPage() {
  const { players: simPlayers, lastEvent, roundNumber } = useDemoSimulation()
  const [category, setCategory] = useState('General')
  const [showGwiInfo, setShowGwiInfo] = useState(false)

  const leader = simPlayers[0]
  const leaderScore = leader ? getScoreVsPar(leader.scores) : 0
  const playingCount = simPlayers.filter(p => p.status === 'playing').length

  const filtered = category === 'General'
    ? simPlayers
    : category === 'Scratch'
      ? simPlayers.filter(p => p.categoria === 'A')
      : category === 'Senior Scratch'
        ? simPlayers.filter(p => p.categoria === 'B')
        : simPlayers.filter(p => p.categoria === 'B')

  return (
    <div className="min-h-screen bg-bg-deep">
      {/* ── Hero — desktop ─────────────────────────────── */}
      <div className="hidden md:block relative overflow-hidden" style={{ minHeight: '160px', maxHeight: '200px' }}>
        <img
          src="https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1920&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(8,18,15,0.28) 0%, rgba(8,18,15,0.82) 62%, rgba(8,18,15,0.96) 100%)' }} />
        <div className="relative h-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center gap-3 py-8 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-sans font-semibold text-sm" style={{ color: '#c8a55a' }}>
              <span className="w-2 h-2 rounded-full bg-gold live-dot inline-block" />
              EN VIVO &middot; Ronda {roundNumber}
            </span>
            <span className="font-sans text-xs text-gray-soft">Simulación automática &middot; Actualiza cada 20s</span>
          </div>
          <h1 className="font-display font-bold text-ivory" style={{ fontSize: 'clamp(24px, 4vw, 42px)', lineHeight: 1.05 }}>
            Copa Golfers+ Demo 2026
          </h1>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-dm-mono), monospace', marginTop: '8px' }}>
            Club de Golf Los Leones &middot; Par 72 &middot; Ronda {roundNumber} &middot; {playingCount} en cancha
          </div>
        </div>
      </div>

      {/* ── Hero — mobile premium ──────────────────────── */}
      <div className="md:hidden" style={{
        background: 'linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)',
        padding: '20px 16px 16px',
        borderBottom: '1px solid #e5e7eb',
      }}>
        {/* Live badge + round */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(22,163,74,0.08)', padding: '4px 10px', borderRadius: '20px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a', animation: 'livePulse 1.5s ease-in-out infinite' }} />
            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '10px', color: '#16a34a', fontWeight: 700, letterSpacing: '0.1em' }}>EN VIVO</span>
          </div>
          <span style={{
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '10px', color: 'var(--text-3)',
            background: 'var(--bg)', padding: '4px 10px', borderRadius: '20px',
          }}>R{roundNumber}</span>
        </div>

        {/* Tournament name */}
        <div style={{
          fontFamily: '"Playfair Display", serif', fontSize: '24px', fontWeight: 700,
          color: 'var(--text)', marginBottom: '4px', lineHeight: 1.15,
        }}>
          Copa Golfers+ Demo
        </div>
        <div style={{
          fontSize: '13px', color: 'var(--text-2)', marginBottom: '14px',
          fontFamily: 'var(--font-dm-mono), monospace',
        }}>
          Los Leones Golf Club · Par 72
        </div>

        {/* Stats row — minimal, elegant */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {[
            { value: '10', label: 'Jugadores' },
            { value: String(playingCount), label: 'En cancha' },
            { value: String(leaderScore === 0 ? 'E' : leaderScore > 0 ? '+' + leaderScore : leaderScore), label: 'Líder' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{s.value}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Ticker — event feed ───────────────────────── */}
      {lastEvent && (
        <div key={lastEvent} className="ticker-event md:hidden" style={{
          background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
          padding: '10px 16px',
          fontFamily: 'var(--font-dm-mono), monospace', fontSize: '12px', color: '#374151',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          <span style={{ color: '#c4992a', marginRight: '6px' }}>●</span>
          {lastEvent}
        </div>
      )}
      {/* Desktop ticker */}
      {lastEvent && (
        <div key={lastEvent + '-d'} className="hidden md:block ticker-event" style={{
          background: 'rgba(201,168,76,0.08)', borderBottom: '1px solid rgba(201,168,76,0.2)',
          padding: '8px 16px', fontFamily: 'var(--font-dm-mono), monospace', fontSize: '11px', color: 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          \u25B6 {lastEvent}
        </div>
      )}

      <div className="gold-divider hidden md:block" />

      {/* ── Category tabs — light on mobile, dark on desktop ── */}
      <div className="md:hidden" style={{ padding: '10px 16px', display: 'flex', gap: '8px', background: 'var(--bg-surface)', borderBottom: '1px solid #e5e7eb' }}>
        {['General', 'Scratch', 'Senior Scratch', 'Categoría A'].map(tab => (
          <button key={tab} onClick={() => setCategory(tab)} style={{
            padding: '8px 16px', borderRadius: '20px', whiteSpace: 'nowrap',
            fontSize: '13px', fontWeight: category === tab ? 600 : 400,
            background: category === tab ? '#111827' : 'transparent',
            color: category === tab ? '#ffffff' : '#6b7280',
            border: category === tab ? 'none' : '1px solid #e5e7eb',
            cursor: 'pointer', minHeight: '36px',
          }}>{tab}</button>
        ))}
      </div>
      <div className="hidden md:flex" style={{ padding: '12px 16px', gap: '8px' }}>
        {['General', 'Scratch', 'Senior Scratch', 'Categoría A'].map(tab => (
          <button key={tab} onClick={() => setCategory(tab)} style={{
            padding: '8px 16px', borderRadius: '6px', whiteSpace: 'nowrap',
            fontSize: '13px', fontWeight: category === tab ? 600 : 400,
            background: category === tab ? '#c4992a' : 'transparent',
            color: category === tab ? 'var(--brand-dark)' : 'var(--text-2)',
            border: category === tab ? 'none' : '1px solid rgba(196,153,42,0.3)',
            cursor: 'pointer', minHeight: '40px',
          }}>{tab}</button>
        ))}
      </div>

      {/* ── Desktop Table — PGA Tour style ─────────────── */}
      <div className="hidden md:block max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(196,153,42,0.13)', background: 'var(--bg)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(196,153,42,0.08)', borderBottom: '1px solid rgba(196,153,42,0.28)' }}>
                {[
                  { label: 'POS', align: 'center' as const, w: 70 },
                  { label: 'JUGADOR', align: 'left' as const, w: undefined },
                  { label: 'TOT', align: 'center' as const, w: 90 },
                  { label: 'THRU', align: 'center' as const, w: 70 },
                  { label: 'R1', align: 'center' as const, w: 70 },
                  { label: 'GWI\u2122', align: 'right' as const, w: 160 },
                ].map(col => (
                  <th
                    key={col.label}
                    style={{
                      padding: '12px 16px',
                      fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-2)',
                      textTransform: 'uppercase', fontWeight: 600,
                      textAlign: col.align,
                      width: col.w,
                      fontFamily: 'var(--font-dm-mono), monospace',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((player, idx) => {
                const pos = idx + 1
                const vspar = getScoreVsPar(player.scores)
                const isLeader = pos === 1
                const thru = player.status === 'finished' ? 'F' : String(player.holesCompleted)

                return (
                  <Fragment key={player.id}>
                    <tr
                      className={player.justScored ? 'flash-row' : ''}
                      style={{
                        background: isLeader ? 'rgba(196,153,42,0.05)' : 'var(--bg)',
                        borderLeft: isLeader ? '3px solid #c4992a' : '3px solid transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 300ms ease',
                      }}
                    >
                      {/* POS */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <PosBadge pos={pos} positionDelta={player.positionDelta} />
                      </td>

                      {/* PLAYER */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                              background: 'linear-gradient(135deg, #1a4fd6 0%, #c4992a 100%)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontSize: 13, fontWeight: 700,
                            }}
                          >
                            {player.initials}
                          </div>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                              {player.pais} {player.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                              <span style={{
                                display: 'inline-block', padding: '1px 6px', borderRadius: 3,
                                background: player.categoria === 'A' ? 'rgba(0,230,118,0.12)' : 'rgba(196,153,42,0.12)',
                                color: player.categoria === 'A' ? '#00e676' : '#c4992a',
                                fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-dm-mono), monospace',
                              }}>
                                CAT {player.categoria}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* TOT — main score column */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: 22, fontWeight: 700, color: totColor(vspar),
                          fontFamily: 'var(--font-dm-mono), monospace',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {formatTot(vspar)}
                        </span>
                      </td>

                      {/* THRU */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          {player.status === 'playing' && (
                            <span style={{
                              width: 5, height: 5, borderRadius: '50%',
                              background: '#00e676', animation: 'livePulse 2s infinite',
                            }} />
                          )}
                          <span style={{
                            fontSize: 14, fontWeight: 600,
                            color: player.status === 'finished' ? 'var(--text-2)' : '#c4992a',
                            fontFamily: 'var(--font-dm-mono), monospace',
                          }}>
                            {thru}
                          </span>
                        </div>
                      </td>

                      {/* R1 — gross total */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: 14, color: 'rgba(255,255,255,0.6)',
                          fontFamily: 'var(--font-dm-mono), monospace',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {player.grossTotal > 0 ? player.grossTotal : '\u2014'}
                        </span>
                      </td>

                      {/* GWI — Bloomberg terminal style */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <GWISparkline series={player.gwiSeries} delta={player.gwiDelta} width={40} height={14} />
                          <span style={{
                            fontFamily: 'var(--font-dm-mono), monospace',
                            fontSize: 14, fontWeight: 600,
                            color: gwiColor(player.gwi),
                            fontVariantNumeric: 'tabular-nums',
                            minWidth: 38, textAlign: 'right',
                          }}>
                            {player.gwi.toFixed(1)}
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-dm-mono), monospace',
                            fontSize: 9,
                            color: gwiDeltaColor(player.gwiDelta),
                            minWidth: 12,
                          }}>
                            {player.gwiDelta > 0 ? '\u25B2' : player.gwiDelta < 0 ? '\u25BC' : '\u2014'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '56px 16px', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
                    No hay jugadores en esta categoría.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Footer hint */}
          <div style={{
            padding: '8px 16px', fontSize: 11, color: 'var(--text-2)', textAlign: 'right',
            background: 'rgba(196,153,42,0.04)', borderTop: '1px solid rgba(196,153,42,0.08)',
            fontFamily: 'var(--font-dm-mono), monospace',
          }}>
            Actualiza cada 20s &middot; {playingCount > 0 ? `${playingCount} en cancha` : 'Ronda cerrada — nueva ronda en 8s'}
          </div>
        </div>
      </div>

      {/* ── GWI info banner (mobile) ─────────────────── */}
      <div className="md:hidden" style={{ padding: '0 16px', background: '#f9fafb' }}>
        <button onClick={() => setShowGwiInfo(!showGwiInfo)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          width: '100%', padding: '8px', background: 'transparent',
          border: 'none', cursor: 'pointer',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono), monospace' }}>
            GWI™ = probabilidad de ganar vs el field
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>{showGwiInfo ? '▲' : '▼'}</span>
        </button>
        {showGwiInfo && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid #e5e7eb', borderRadius: '10px',
            padding: '14px', marginBottom: '10px', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '6px', fontSize: '13px' }}>
              GWI™ — Golf Win Index
            </div>
            <p style={{ margin: '0 0 8px' }}>
              Probabilidad estimada de que un jugador gane la vuelta, calculada en tiempo real. La suma de todos los GWI siempre es 100%.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              Se basa en: score actual vs par, hándicap del jugador, consistencia histórica y dificultad de los hoyos restantes.
            </p>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-3)' }}>
              ▲ verde = subiendo · ▼ rojo = bajando · Actualiza hoyo a hoyo
            </p>
          </div>
        )}
      </div>

      {/* ── Mobile cards ───────────────────────────────── */}
      <div className="md:hidden" style={{ padding: '12px 16px 80px', background: '#f9fafb' }}>
        <MobileLeaderboard
          players={filtered}
          getScoreVsPar={(scores) => getScoreVsPar(scores)}
          category={category}
        />
      </div>
    </div>
  )
}
