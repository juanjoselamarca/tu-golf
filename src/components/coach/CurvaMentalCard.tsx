'use client'

import type { CSSProperties } from 'react'
import type { MentalState } from '@/golf/coach/mental-index'

interface Props {
  fecha: string
  curso: string
  totalScore: number
  overPar: number
  states: Array<MentalState | null>
  scores: Array<number | null>
  hole_pars: number[]
  espirales: number
}

const STATE_COLOR: Record<MentalState, string> = {
  calm: 'var(--coach-recovery-high)',
  tense: 'var(--coach-recovery-mid)',
  tilt: 'var(--coach-recovery-low)',
}

function renderHalf(label: string, overParHalf: number, states: Array<MentalState | null>, scores: Array<number | null>, pars: number[], startIdx: number) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '6px', padding: '0 1px' }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text-2)', fontFamily: '"DM Mono", monospace', letterSpacing: 0 }}>{overParHalf >= 0 ? '+' : ''}{overParHalf}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px', height: '18px', alignItems: 'flex-end', marginBottom: '4px' }} aria-hidden>
        {scores.map((s, i) => {
          const par = pars[i] ?? 4
          const over = s != null ? s - par : 0
          const h = Math.min(100, 20 + over * 20)
          return <div key={`s-${startIdx + i}`} style={{ height: `${h}%`, background: 'var(--text)' }} />
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px', height: '14px' }} aria-hidden>
        {states.map((st, i) => (
          <div key={`m-${startIdx + i}`} style={{ background: st ? STATE_COLOR[st] : 'var(--line)' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px', marginTop: '4px' }}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={`a-${startIdx + i}`} style={{ fontFamily: '"DM Mono", monospace', fontSize: '9.5px', color: 'var(--text-3)', textAlign: 'center' }}>{startIdx + i + 1}</div>
        ))}
      </div>
    </div>
  )
}

export function CurvaMentalCard({ fecha, curso, totalScore, overPar, states, scores, hole_pars, espirales }: Props) {
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '22px 20px 20px',
    margin: '0 20px 24px',
  }
  const f9States = states.slice(0, 9)
  const b9States = states.slice(9, 18)
  const f9Scores = scores.slice(0, 9)
  const b9Scores = scores.slice(9, 18)
  const f9Pars = hole_pars.slice(0, 9)
  const b9Pars = hole_pars.slice(9, 18)
  const f9Over = f9Scores.reduce<number>((acc, s, i) => acc + (s != null ? s - (f9Pars[i] ?? 4) : 0), 0)
  const b9Over = b9Scores.reduce<number>((acc, s, i) => acc + (s != null ? s - (b9Pars[i] ?? 4) : 0), 0)

  const calmCount = states.filter(s => s === 'calm').length
  const tenseCount = states.filter(s => s === 'tense').length
  const tiltCount = states.filter(s => s === 'tilt').length

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '16px', fontWeight: 600 }}>Curva mental</span>
        <span style={{
          fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '3px 8px',
          borderRadius: '2px', border: '1px solid var(--coach-recovery-low)', background: 'var(--coach-recovery-low-soft)',
          color: 'var(--coach-recovery-low)', fontFamily: '"DM Mono", monospace',
        }}>{espirales} espirales</span>
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-2)', marginBottom: '18px' }}>
        {fecha} · {curso} · <span style={{ color: 'var(--text)', fontFamily: '"DM Mono", monospace' }}>{totalScore} ({overPar >= 0 ? '+' : ''}{overPar})</span>
      </div>

      {renderHalf('Front 9', f9Over, f9States, f9Scores, f9Pars, 0)}
      {renderHalf('Back 9', b9Over, b9States, b9Scores, b9Pars, 9)}

      <div style={{ display: 'flex', gap: '12px', paddingTop: '14px', marginTop: '8px', borderTop: '1px solid var(--line)', fontSize: '11px', color: 'var(--text-2)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coach-recovery-high)' }} aria-hidden />{calmCount} calmos</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coach-recovery-mid)' }} aria-hidden />{tenseCount} tensos</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coach-recovery-low)' }} aria-hidden />{tiltCount} tilt</div>
        <span style={{ marginLeft: 'auto', color: 'var(--text)', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>hoyo a hoyo →</span>
      </div>
    </div>
  )
}
