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
  /** 9 o 18. Las 9h se marcan distinto y no entran a la tendencia (su
   * diferencial equiv-18h es más volátil: un buen front-9 ×2 da un dif optimista). */
  holes_played: number
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
    .map((p) => ({ ...p, dif: p.delta_vs_handicap_expected + (currentHandicap ?? 0), is9: p.holes_played === 9 }))

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
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

  // La TENDENCIA (la bajada) se computa sobre las rondas de 18h — la señal
  // estable y representativa del handicap. Las 9h son contexto (su dif equiv-18h
  // es más volátil). Si hay pocas 18h, caemos a todas las rondas para no quedar
  // sin tendencia (jugador 9h-heavy).
  const trend = puntos.filter((p) => !p.is9).map((p) => ({ i: puntos.indexOf(p), dif: p.dif }))
  const trendPts = trend.length >= 3 ? trend : puntos.map((p, i) => ({ i, dif: p.dif }))
  const hay9 = puntos.some((p) => p.is9)

  const rawPath = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.dif).toFixed(1)}`).join(' ')

  const WIN = 5
  const trendDifs = trendPts.map((t) => t.dif)
  const ma = trendPts.map((_, k) => avg(trendDifs.slice(Math.max(0, k - WIN + 1), k + 1)) as number)
  const maPath = trendPts.map((t, k) => `${k === 0 ? 'M' : 'L'} ${x(t.i).toFixed(1)} ${y(ma[k]).toFixed(1)}`).join(' ')
  const firstTx = x(trendPts[0].i)
  const lastTx = x(trendPts[trendPts.length - 1].i)
  const areaPath = `${maPath} L ${lastTx.toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L ${firstTx.toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`

  const fmtMes = (d: string | null) => {
    if (!d) return ''
    const dt = new Date(d + 'T00:00:00')
    return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
  }

  // Mejorando/estable sobre la tendencia (18h): últimas 5 vs 5 previas.
  const tailAvg = avg(trendDifs.slice(-5))
  const prevAvg = avg(trendDifs.slice(-10, -5))
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
        {/* Rondas crudas: contexto tenue. 9h = punto hueco (más volátil). */}
        <path d={rawPath} fill="none" stroke="var(--brand)" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" opacity="0.28" />
        {puntos.map((p, i) =>
          p.is9 ? (
            <circle key={i} cx={x(i)} cy={y(p.dif)} r="2.4" fill="var(--bg-surface)" stroke="var(--brand)" strokeWidth="1" opacity="0.6" />
          ) : (
            <circle key={i} cx={x(i)} cy={y(p.dif)} r="1.8" fill="var(--brand)" opacity="0.35" />
          ),
        )}
        {/* Tendencia (media móvil 5 sobre 18h): la bajada */}
        <path d={maPath} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastTx} cy={y(ma[ma.length - 1])} r="4.5" fill="var(--brand)" stroke="var(--bg-surface)" strokeWidth="1.5" />

        {/* Orientación temporal */}
        <text x={PAD.left} y={H - 6} fontSize="10" fill="var(--text-3)" style={{ fontFamily: 'var(--font-dm-mono)' }}>{fmtMes(puntos[0].played_at)}</text>
        <text x={W - PAD.right} y={H - 6} fontSize="10" fill="var(--text-3)" textAnchor="end" style={{ fontFamily: 'var(--font-dm-mono)' }}>{fmtMes(puntos[puntos.length - 1].played_at)}</text>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '8px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
          Última ronda{last.is9 ? ' · 9 hoyos' : ''}
        </span>
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
          dif {last.dif.toFixed(1)}
        </span>
      </div>
      {hay9 && (
        <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '6px', display: 'flex', gap: '14px', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <svg width="9" height="9"><circle cx="4.5" cy="4.5" r="3" fill="var(--brand)" opacity="0.6" /></svg>
            18 hoyos (tendencia)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <svg width="9" height="9"><circle cx="4.5" cy="4.5" r="3" fill="var(--bg-surface)" stroke="var(--brand)" strokeWidth="1" /></svg>
            9 hoyos (equiv. 18h, más volátil)
          </span>
        </div>
      )}
    </div>
  )
}
