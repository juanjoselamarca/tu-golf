'use client'

import type { CSSProperties } from 'react'
import type { BandaMental } from '@/golf/coach/mental-index'

/** Cortes reales de banda (BANDA_MENTAL_MEDIA / BANDA_MENTAL_ALTA), los pasa el server. */
export interface UmbralesMental {
  media: number
  alta: number
}

type Props =
  | {
      score: number
      band: BandaMental
      delta: number | null
      title: string
      description: string
      umbrales: UmbralesMental
    }
  | {
      /** Sin datos suficientes: tarjeta sobria, sin número ni barra; `description` dice qué falta. */
      score: null
      description: string
    }

const BAND_COLOR_VAR: Record<BandaMental, string> = {
  low: 'var(--coach-recovery-low)',
  mid: 'var(--coach-recovery-mid)',
  high: 'var(--coach-recovery-high)',
}

const cardStyle: CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--line)',
  borderRadius: '6px',
  padding: '22px 22px 20px',
  margin: '0 20px 24px',
  position: 'relative',
  overflow: 'hidden',
}

function accentStrip(background: string): CSSProperties {
  return { position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background }
}

function rotulo(color: string): CSSProperties {
  return { fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color, fontWeight: 700, marginBottom: '12px', fontFamily: '"DM Mono", monospace' }
}

export function MentalRecoveryCard(props: Props) {
  if (props.score === null) {
    return (
      <div style={cardStyle}>
        <div style={accentStrip('var(--line)')} aria-hidden />
        <div style={rotulo('var(--text-2)')}>Mental Index</div>
        <div style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.5 }}>
          {props.description}
        </div>
      </div>
    )
  }

  const { score, band, delta, title, description, umbrales } = props
  const color = BAND_COLOR_VAR[band]
  const deltaText = delta == null
    ? null
    : delta > 0
      ? `↑ ${delta} sem`
      : delta < 0
        ? `↓ ${Math.abs(delta)} sem`
        : '= sem'
  // Cada tramo ocupa lo que mide su banda en la escala 0–100 (no tercios iguales).
  const tramos: Array<{ band: BandaMental; width: number }> = [
    { band: 'low', width: umbrales.media },
    { band: 'mid', width: umbrales.alta - umbrales.media },
    { band: 'high', width: 100 - umbrales.alta },
  ]

  return (
    <div style={cardStyle}>
      <div style={accentStrip(color)} aria-hidden />
      <div style={rotulo(color)}>Mental Index</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '56px', fontWeight: 500, lineHeight: 0.95, color, letterSpacing: '-0.02em' }}>{score}</span>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '16px', color: 'var(--text-3)' }}>/ 100</span>
        {deltaText && (
          <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: '12px', color: 'var(--text-2)' }}>
            {deltaText}
          </span>
        )}
      </div>
      <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '18px', fontWeight: 600, lineHeight: 1.25, margin: '4px 0 8px', color: 'var(--text)' }}>
        {title}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '14px' }}>
        {description}
      </div>
      <div style={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', position: 'relative' }} aria-hidden>
        {tramos.map(t => (
          <div key={t.band} data-banda={t.band} style={{ width: `${t.width}%`, background: BAND_COLOR_VAR[t.band], opacity: band === t.band ? 1 : 0.4 }} />
        ))}
      </div>
    </div>
  )
}
