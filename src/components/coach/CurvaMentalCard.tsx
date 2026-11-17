'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { MentalState } from '@/golf/coach/mental-index'

interface Props {
  fecha: string
  curso: string
  totalScore: number
  overPar: number
  states: Array<MentalState | null>
  scores: Array<number | null>
  /** Par real por posición de la tarjeta; null donde no se sabe (nunca se inventa). */
  pares: Array<number | null>
  espirales: number
  /** Detalle de la ronda (tarjeta hoyo a hoyo completa). Sin él, no se ofrece el enlace. */
  detalleHref?: string
}

const STATE_COLOR: Record<MentalState, string> = {
  calm: 'var(--coach-recovery-high)',
  tense: 'var(--coach-recovery-mid)',
  tilt: 'var(--coach-recovery-low)',
}

function renderHalf(label: string, overParHalf: number, states: Array<MentalState | null>, scores: Array<number | null>, pars: Array<number | null>, startIdx: number) {
  const n = scores.length
  if (n === 0) return null
  const gridCols: CSSProperties = { display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: '2px' }
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '6px', padding: '0 1px' }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text-2)', fontFamily: '"DM Mono", monospace', letterSpacing: 0 }}>{overParHalf >= 0 ? '+' : ''}{overParHalf}</span>
      </div>
      <div style={{ ...gridCols, height: '18px', alignItems: 'flex-end', marginBottom: '4px' }} aria-hidden>
        {scores.map((s, i) => {
          const par = pars[i]
          // Sin score o sin par real: sin barra (nunca un par 4 inventado).
          const h = s != null && par != null ? Math.max(0, Math.min(100, 20 + (s - par) * 20)) : 0
          return <div key={`s-${startIdx + i}`} style={{ height: `${h}%`, background: 'var(--text)' }} />
        })}
      </div>
      <div style={{ ...gridCols, height: '14px' }} aria-hidden>
        {states.map((st, i) => (
          <div key={`m-${startIdx + i}`} style={{ background: st ? STATE_COLOR[st] : 'var(--line)' }} />
        ))}
      </div>
      <div style={{ ...gridCols, marginTop: '4px' }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={`a-${startIdx + i}`} style={{ fontFamily: '"DM Mono", monospace', fontSize: '12px', color: 'var(--text-3)', textAlign: 'center' }}>{startIdx + i + 1}</div>
        ))}
      </div>
    </div>
  )
}

export function CurvaMentalCard({ fecha, curso, totalScore, overPar, states, scores, pares, espirales, detalleHref }: Props) {
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
  const f9Pars = pares.slice(0, 9)
  const b9Pars = pares.slice(9, 18)
  const sobreParDe = (sc: Array<number | null>, ps: Array<number | null>) =>
    sc.reduce<number>((acc, s, i) => { const par = ps[i]; return acc + (s != null && par != null ? s - par : 0) }, 0)
  const f9Over = sobreParDe(f9Scores, f9Pars)
  const b9Over = sobreParDe(b9Scores, b9Pars)

  const calmCount = states.filter(s => s === 'calm').length
  const tenseCount = states.filter(s => s === 'tense').length
  const enTilt = states.filter(s => s === 'tilt').length
  // Rojo solo si hubo espirales: "0 espirales" es una buena noticia, no una alarma.
  const chipTone = espirales > 0
    ? { border: '1px solid var(--coach-recovery-low)', background: 'var(--coach-recovery-low-soft)', color: 'var(--coach-recovery-low)' }
    : { border: '1px solid var(--border)', background: 'var(--surface-soft)', color: 'var(--text-2)' }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '16px', fontWeight: 600 }}>Curva mental</span>
        <span style={{
          fontSize: '12px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '3px 8px',
          borderRadius: '2px', ...chipTone, fontFamily: '"DM Mono", monospace',
        }}>{espirales} espirales</span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '18px' }}>
        {fecha} · {curso} · <span style={{ color: 'var(--text)', fontFamily: '"DM Mono", monospace' }}>{totalScore} ({overPar >= 0 ? '+' : ''}{overPar})</span>
      </div>

      {renderHalf('Front 9', f9Over, f9States, f9Scores, f9Pars, 0)}
      {renderHalf('Back 9', b9Over, b9States, b9Scores, b9Pars, 9)}

      <div style={{ display: 'flex', gap: '12px', paddingTop: '14px', marginTop: '8px', borderTop: '1px solid var(--line)', fontSize: '12px', color: 'var(--text-2)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coach-recovery-high)' }} aria-hidden />{calmCount} calmos</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coach-recovery-mid)' }} aria-hidden />{tenseCount} tensos</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coach-recovery-low)' }} aria-hidden />{enTilt} tilt</div>
        {detalleHref && (
          <Link href={detalleHref} style={{ color: 'var(--text)', fontWeight: 600, fontSize: '12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', margin: '-14px 0 -14px auto' }}>hoyo a hoyo →</Link>
        )}
      </div>
    </div>
  )
}
