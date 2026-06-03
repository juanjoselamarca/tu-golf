'use client'

import type { CSSProperties } from 'react'

export interface FocoData {
  kind: 'focus' | 'fallback'
  label?: string
  accion?: string
  evidencia?: Record<string, unknown>
  metrica?: { key: string; valor: number; muestra: number }
  reason?: string
  handicap?: number | null
}

/** Traduce la evidencia del foco a una frase humana (cero claves crudas). */
function frasesEvidencia(ev: Record<string, unknown> | undefined): string | null {
  if (!ev) return null
  if (typeof ev.spiral_rate === 'number') {
    return `${Math.round(ev.spiral_rate * 100)}% de tus bogeys arrastran a otro bogey o peor.`
  }
  if (typeof ev.front9_avg === 'number' && typeof ev.back9_avg === 'number') {
    const f = ev.front9_avg as number
    const b = ev.back9_avg as number
    return b >= f
      ? `Tu back nine promedia ${(b - f).toFixed(1)} golpes más que tu front nine.`
      : `Tu front nine promedia ${(f - b).toFixed(1)} golpes más que tu back nine.`
  }
  if (typeof ev.par3_avg_over === 'number') {
    return `En los par 3 promedias +${ev.par3_avg_over} sobre par.`
  }
  if (typeof ev.hole1_avg === 'number') {
    return `Tu hoyo 1 promedia ${ev.hole1_avg} — bastante por encima del resto.`
  }
  if (typeof ev.ratio === 'number') {
    return `En ${Math.round(ev.ratio * 100)}% de tus rondas te desarmas en el cierre.`
  }
  if (typeof ev.cv === 'number') {
    return `Tus totales varían mucho entre rondas — falta consistencia.`
  }
  return null
}

const card: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(196,153,42,0.10) 0%, rgba(196,153,42,0.03) 100%)',
  border: '1px solid var(--brand)',
  borderRadius: '10px',
  padding: '22px 22px 20px',
  position: 'relative',
  overflow: 'hidden',
}

export function FocusHero({ foco }: { foco: FocoData }) {
  if (foco.kind === 'fallback') {
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '22px' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '8px' }}>
          Tu foco
        </div>
        <p style={{ fontFamily: 'var(--font-playfair)', fontSize: '21px', lineHeight: 1.3, color: 'var(--text)', margin: '0 0 8px' }}>
          Todavía no tengo un foco claro para darte.
        </p>
        <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
          {foco.reason === 'cold_start'
            ? 'Me faltan rondas para leer un patrón real. Sumá algunas vueltas de 18 y vuelvo con tu palanca de mayor impacto — sin inventar nada.'
            : 'Tus números no muestran una fuga clara ahora mismo. Buena señal: estás parejo. Seguí jugando y aviso si aparece algo que mueva la aguja.'}
        </p>
      </div>
    )
  }

  const frase = frasesEvidencia(foco.evidencia)
  return (
    <div style={card}>
      <div style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand-on-bg, #8A6A16)', fontWeight: 700, marginBottom: '10px' }}>
        Tu foco ahora
      </div>
      <h2 style={{ fontFamily: 'var(--font-playfair)', fontSize: '26px', lineHeight: 1.15, color: 'var(--text)', margin: '0 0 12px', fontWeight: 600 }}>
        {foco.label}
      </h2>
      {frase && (
        <p style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 16px' }}>{frase}</p>
      )}
      {foco.accion && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', paddingTop: '14px', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand-on-bg, #8A6A16)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, marginTop: '2px' }}>
            Esta semana
          </span>
          <p style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.55, margin: 0, fontWeight: 500 }}>{foco.accion}</p>
        </div>
      )}
    </div>
  )
}
