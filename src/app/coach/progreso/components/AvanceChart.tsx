'use client'

/**
 * El héroe de la vista: los diferenciales de cada ronda 18h bajando (ojalá)
 * hacia la línea de meta. Lower = mejor. SVG hecho a mano (sin librería de
 * charts) — liviano, on-brand, con líneas de referencia de hándicap actual y meta.
 *
 * dif por ronda = delta_vs_handicap_expected + handicap_actual.
 */
export interface PuntoSerie {
  played_at: string | null
  delta_vs_handicap_expected: number
}

interface Props {
  serie: PuntoSerie[]
  currentHandicap: number | null
  targetHandicap: number | null
}

const W = 600
const H = 220
const PAD = { top: 18, right: 16, bottom: 26, left: 34 }

export function AvanceChart({ serie, currentHandicap, targetHandicap }: Props) {
  const puntos = serie
    .filter((p) => currentHandicap != null)
    .map((p) => ({ ...p, dif: p.delta_vs_handicap_expected + (currentHandicap ?? 0) }))

  if (puntos.length < 2 || currentHandicap == null) {
    return (
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '28px 22px',
          textAlign: 'center',
          color: 'var(--text-3)',
          fontSize: '13px',
          lineHeight: 1.6,
        }}
      >
        Necesito al menos 2 rondas con diferencial para dibujar tu
        avance. Seguí sumando vueltas y acá vas a ver la tendencia.
      </div>
    )
  }

  const difs = puntos.map((p) => p.dif)
  const refs = [currentHandicap, targetHandicap].filter((v): v is number => v != null)
  const lo = Math.min(...difs, ...refs) - 1.5
  const hi = Math.max(...difs, ...refs) + 1.5
  const span = hi - lo || 1

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (puntos.length === 1 ? plotW / 2 : (i / (puntos.length - 1)) * plotW)
  const y = (v: number) => PAD.top + ((hi - v) / span) * plotH

  // Línea cruda (contexto, tenue) + media móvil trailing (la tendencia, el héroe).
  const rawPath = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.dif).toFixed(1)}`).join(' ')
  const WIN = 5
  const ma = puntos.map((_, i) => {
    const w = difs.slice(Math.max(0, i - WIN + 1), i + 1)
    return w.reduce((a, b) => a + b, 0) / w.length
  })
  const maPath = ma.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const areaPath = `${maPath} L ${x(puntos.length - 1).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`

  const fmtMes = (d: string | null) => {
    if (!d) return ''
    const dt = new Date(d + 'T00:00:00')
    return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
  }

  // Tendencia: promedio de las últimas 5 vs las 5 previas.
  const tail = difs.slice(-5)
  const prev = difs.slice(-10, -5)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const tailAvg = avg(tail)
  const prevAvg = avg(prev)
  const mejorando = tailAvg != null && prevAvg != null ? tailAvg < prevAvg - 0.3 : null

  const last = puntos[puntos.length - 1]

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--line)',
        borderRadius: '8px',
        padding: '18px 18px 14px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600 }}>
          Diferencial por ronda · equiv. 18h
        </span>
        {mejorando != null && (
          <span style={{ fontSize: '11px', fontWeight: 700, color: mejorando ? 'var(--coach-recovery-high)' : 'var(--text-3)' }}>
            {mejorando ? '↓ mejorando' : '→ estable'}
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Diferenciales por ronda hacia la meta" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="avance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(196,153,42,0.16)" />
            <stop offset="100%" stopColor="rgba(196,153,42,0)" />
          </linearGradient>
        </defs>

        {/* Línea de meta */}
        {targetHandicap != null && (
          <g>
            <line x1={PAD.left} y1={y(targetHandicap)} x2={W - PAD.right} y2={y(targetHandicap)} stroke="var(--coach-recovery-high)" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={PAD.left} y={y(targetHandicap) - 5} fontSize="10" fill="var(--coach-recovery-high)" style={{ fontFamily: 'var(--font-dm-mono)' }}>
              meta {targetHandicap}
            </text>
          </g>
        )}
        {/* Línea de hándicap actual */}
        <g>
          <line x1={PAD.left} y1={y(currentHandicap)} x2={W - PAD.right} y2={y(currentHandicap)} stroke="var(--text-3)" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
          <text x={W - PAD.right} y={y(currentHandicap) - 5} fontSize="10" fill="var(--text-3)" textAnchor="end" style={{ fontFamily: 'var(--font-dm-mono)' }}>
            hcp {currentHandicap}
          </text>
        </g>

        <path d={areaPath} fill="url(#avance-fill)" />
        {/* Rondas crudas: contexto tenue */}
        <path d={rawPath} fill="none" stroke="var(--brand)" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" opacity="0.28" />
        {puntos.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.dif)} r="1.8" fill="var(--brand)" opacity="0.3" />
        ))}
        {/* Tendencia (media móvil 5): la bajada */}
        <path d={maPath} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(puntos.length - 1)} cy={y(ma[ma.length - 1])} r="4.5" fill="var(--brand)" stroke="var(--bg-surface)" strokeWidth="1.5" />

        {/* Orientación temporal */}
        <text x={PAD.left} y={H - 6} fontSize="10" fill="var(--text-3)" style={{ fontFamily: 'var(--font-dm-mono)' }}>{fmtMes(puntos[0].played_at)}</text>
        <text x={W - PAD.right} y={H - 6} fontSize="10" fill="var(--text-3)" textAnchor="end" style={{ fontFamily: 'var(--font-dm-mono)' }}>{fmtMes(puntos[puntos.length - 1].played_at)}</text>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '8px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>Última ronda</span>
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
          dif {last.dif.toFixed(1)}
        </span>
      </div>
    </div>
  )
}
