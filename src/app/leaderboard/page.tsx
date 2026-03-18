/* eslint-disable @next/next/no-img-element */
'use client'

import { useState } from 'react'
import LeaderboardTable from '@/components/LeaderboardTable'
import { MobileLeaderboard } from '@/components/MobileLeaderboard'
import { PLAYERS } from '@/lib/golf-data'
import { useDemoSimulation, getScoreVsPar } from '@/hooks/useDemoSimulation'
import { DEMO_PARS } from '@/lib/demo-simulation'

export default function LeaderboardPage() {
  const { players: simPlayers, lastEvent, roundNumber } = useDemoSimulation()
  const [category, setCategory] = useState('General')

  const leader = simPlayers[0]
  const leaderScore = leader ? getScoreVsPar(leader.scores) : 0
  const playingCount = simPlayers.filter(p => p.status === 'playing').length

  return (
    <div className="min-h-screen bg-bg-deep">
      {/* Hero — desktop */}
      <div className="hidden md:block relative overflow-hidden" style={{ minHeight: 'clamp(240px, 34vw, 320px)' }}>
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
              EN VIVO · Ronda {roundNumber}
            </span>
            <span className="font-sans text-xs text-gray-soft">Simulación automática</span>
          </div>
          <h1 className="font-display font-bold text-ivory" style={{ fontSize: 'clamp(24px, 4vw, 42px)', lineHeight: 1.05 }}>
            Copa Golfers+ Demo 2026
          </h1>
          <p className="font-sans text-sm text-gray-soft max-w-2xl">
            Simulación en vivo — los jugadores avanzan hoyo a hoyo con scores realistas según su índice.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
            {[
              { label: 'Cancha', value: 'Club de Golf Los Leones' },
              { label: 'Ronda', value: String(roundNumber) },
              { label: 'Par', value: '72' },
              { label: 'En cancha', value: `${playingCount} jugadores` },
            ].map(item => (
              <div key={item.label} className="glass-card rounded-xl px-3 py-3" style={{ background: 'rgba(13,27,23,0.76)' }}>
                <div className="font-sans text-[11px] uppercase tracking-[0.12em]" style={{ color: '#9fb4aa' }}>{item.label}</div>
                <div className="font-sans text-sm font-semibold text-ivory mt-1">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hero — mobile compact */}
      <div className="md:hidden" style={{ background: 'rgba(7,13,24,0.95)', padding: '12px 16px', borderBottom: '1px solid rgba(196,153,42,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e676', animation: 'livePulse 2s infinite' }} />
            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '11px', color: '#c9a84c', letterSpacing: '0.08em' }}>EN VIVO</span>
          </div>
          <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Simulación auto</span>
        </div>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', fontWeight: 700, color: '#edeae4', marginBottom: '4px' }}>
          Copa Golfers+ Demo 2026
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>
          Club de Golf Los Leones
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { label: 'RDA', value: String(roundNumber) },
            { label: 'PAR', value: '72' },
            { label: 'JUG', value: '10' },
            { label: 'VIVO', value: String(playingCount) },
          ].map(p => (
            <div key={p.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-cormorant), serif', fontSize: '18px', fontWeight: 300, color: '#edeae4' }}>{p.value}</div>
              <div style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{p.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ticker bar */}
      {lastEvent && (
        <div key={lastEvent} className="ticker-event" style={{
          background: 'rgba(201,168,76,0.08)', borderBottom: '1px solid rgba(201,168,76,0.2)',
          padding: '8px 16px', fontFamily: 'var(--font-dm-mono), monospace', fontSize: '11px', color: '#edeae4',
        }}>
          ▶ {lastEvent}
        </div>
      )}

      <div className="gold-divider" />

      {/* Category tabs */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {['General', 'Categoría A', 'Categoría B'].map(tab => (
          <button key={tab} onClick={() => setCategory(tab)} style={{
            padding: '8px 16px', borderRadius: '6px', whiteSpace: 'nowrap',
            fontSize: '13px', fontWeight: category === tab ? 600 : 400,
            background: category === tab ? '#c4992a' : 'transparent',
            color: category === tab ? '#070d18' : 'rgba(255,255,255,0.5)',
            border: category === tab ? 'none' : '1px solid rgba(196,153,42,0.3)',
            cursor: 'pointer', minHeight: '40px',
          }}>{tab}</button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <LeaderboardTable players={PLAYERS} />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden" style={{ padding: '8px 12px 80px' }}>
        <MobileLeaderboard
          players={simPlayers}
          getScoreVsPar={(scores) => getScoreVsPar(scores)}
          category={category}
        />
      </div>
    </div>
  )
}
