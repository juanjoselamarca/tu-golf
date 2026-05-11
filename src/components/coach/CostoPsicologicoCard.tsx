'use client'

import type { CSSProperties } from 'react'

interface Props {
  evitables: number
  promedioReal: number
  promedioContenido: number
  realScore: number
  ghostScore: number
  delta: number
  holesAffected: string[]
}

export function CostoPsicologicoCard({ evitables, promedioReal, promedioContenido, realScore, ghostScore, delta, holesAffected }: Props) {
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '24px 22px 22px',
    margin: '0 20px 24px',
    position: 'relative',
  }
  const accent: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '3px',
    background: 'var(--coach-recovery-low)',
  }

  return (
    <div style={cardStyle}>
      <div style={accent} aria-hidden />
      <div style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--coach-recovery-low)', fontWeight: 700, marginBottom: '14px', fontFamily: '"DM Mono", monospace' }}>
        Costo psicológico · 30D
      </div>
      <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '72px', fontWeight: 700, lineHeight: 0.92, color: 'var(--coach-recovery-low)', letterSpacing: '-0.03em', marginBottom: '4px' }}>
        {evitables}
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-2)', marginBottom: '16px', fontWeight: 500, letterSpacing: '0.02em' }}>
        strokes evitables
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.55, paddingBottom: '18px', borderBottom: '1px solid var(--line)', marginBottom: '18px' }}>
        Si hubieras contenido las espirales post-bogey, tu promedio del mes hubiera bajado de <b style={{ color: 'var(--text)', fontWeight: 600 }}>{promedioReal.toFixed(1)}</b> a <b style={{ color: 'var(--text)', fontWeight: 600 }}>{promedioContenido.toFixed(1)}</b>. La cabeza paga, no el swing.
      </div>

      <div style={{ fontSize: '10.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--coach-brass)', fontWeight: 700, marginBottom: '8px', fontFamily: '"DM Mono", monospace' }}>
        Tu yo contenido · última ronda
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '36px', fontWeight: 500, color: 'var(--text-3)', textDecoration: 'line-through', textDecorationColor: 'var(--line)', letterSpacing: '-0.02em', lineHeight: 1 }}>{realScore}</span>
        <span style={{ fontSize: '18px', color: 'var(--text-3)' }}>→</span>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '44px', fontWeight: 500, color: 'var(--coach-brass)', letterSpacing: '-0.02em', lineHeight: 1 }}>{ghostScore}</span>
        <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: '14px', color: 'var(--coach-brass)', fontWeight: 600, padding: '4px 9px', background: 'var(--coach-brass-soft)', borderRadius: '2px' }}>−{delta}</span>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.55 }}>
        Conteniendo las <b style={{ color: 'var(--text)', fontWeight: 600 }}>{holesAffected.length} espirales</b> ({holesAffected.join(', ')}) terminabas en <b style={{ color: 'var(--text)', fontWeight: 600 }}>{ghostScore}</b>.
      </div>
    </div>
  )
}
