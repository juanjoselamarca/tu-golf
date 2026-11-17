'use client'

import type { CSSProperties } from 'react'
import { concordar } from '@/lib/text/contar'
import { etiquetaEspiral, textoVentanaMental, type BucketMental, type Espiral } from '@/golf/coach/mental-index'

interface Props {
  evitables: number
  promedioReal: number
  promedioContenido: number
  realScore: number
  ghostScore: number
  delta: number
  /** Espirales de la última ronda que costaron golpes. */
  espirales: Espiral[]
  /**
   * Tamaño real de la ventana usada para `evitables` y los promedios, con su
   * bucket: "últimas 5 rondas de 18 hoyos" (nunca mezcla 9 y 18).
   */
  windowSize: number
  bucket: BucketMental | null
}

export function CostoPsicologicoCard({ evitables, promedioReal, promedioContenido, realScore, ghostScore, delta, espirales, windowSize, bucket }: Props) {
  const windowLabel = textoVentanaMental(windowSize, bucket)
  const holesAffected = espirales.map(etiquetaEspiral)
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
      <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--coach-recovery-low)', fontWeight: 700, marginBottom: '14px', fontFamily: '"DM Mono", monospace' }}>
        Costo psicológico
      </div>
      <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '72px', fontWeight: 700, lineHeight: 0.92, color: 'var(--coach-recovery-low)', letterSpacing: '-0.03em', marginBottom: '4px' }}>
        {evitables}
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-2)', marginBottom: '16px', fontWeight: 500, letterSpacing: '0.02em' }}>
        {concordar(evitables, 'golpe evitable', 'golpes evitables')}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.55, paddingBottom: '18px', borderBottom: '1px solid var(--line)', marginBottom: '18px' }}>
        Si hubieras contenido las espirales post-bogey en tus {windowLabel}, tu promedio hubiera bajado de <b style={{ color: 'var(--text)', fontWeight: 600 }}>{promedioReal.toFixed(1)}</b> a <b style={{ color: 'var(--text)', fontWeight: 600 }}>{promedioContenido.toFixed(1)}</b>.
      </div>

      <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--coach-brass)', fontWeight: 700, marginBottom: '8px', fontFamily: '"DM Mono", monospace' }}>
        Tu yo contenido · última ronda
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '36px', fontWeight: 500, color: 'var(--text-3)', textDecoration: 'line-through', textDecorationColor: 'var(--line)', letterSpacing: '-0.02em', lineHeight: 1 }}>{realScore}</span>
        <span style={{ fontSize: '18px', color: 'var(--text-3)' }}>→</span>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '44px', fontWeight: 500, color: 'var(--coach-brass)', letterSpacing: '-0.02em', lineHeight: 1 }}>{ghostScore}</span>
        <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: '14px', color: 'var(--coach-brass)', fontWeight: 600, padding: '4px 9px', background: 'var(--coach-brass-soft)', borderRadius: '2px' }}>−{delta}</span>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.55 }}>
        Conteniendo {holesAffected.length === 1 ? (
          <>la <b style={{ color: 'var(--text)', fontWeight: 600 }}>espiral</b> en ({holesAffected[0]})</>
        ) : (
          <>las <b style={{ color: 'var(--text)', fontWeight: 600 }}>{holesAffected.length} espirales</b> ({holesAffected.join(', ')})</>
        )} terminabas en <b style={{ color: 'var(--text)', fontWeight: 600 }}>{ghostScore}</b>.
      </div>
    </div>
  )
}
