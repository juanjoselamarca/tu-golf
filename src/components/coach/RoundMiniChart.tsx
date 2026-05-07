'use client'

/**
 * RoundMiniChart — bar chart inline de scores hoyo por hoyo vs par.
 *
 * Cada barra: alta proporcional al score, color por resultado (eagle/birdie
 * verde, par neutro, bogey amarillo, doble+ rojo). Línea horizontal del par
 * promedio. Numero del hoyo abajo.
 *
 * SVG puro, sin libs externas. Render inline en el chat cuando el coach
 * analiza una ronda específica.
 */

export interface RoundSummary {
  course_name: string | null
  played_at: string | null
  total_gross: number | null
  scores: Array<number | null>
  pars: Array<number | null>
}

interface Props {
  summary: RoundSummary
}

export function RoundMiniChart({ summary }: Props) {
  const scores = summary.scores
  const pars = summary.pars
  const validHoles = scores.length

  if (validHoles === 0) return null

  // Normalizamos altura de barra: la base es el par del hoyo (línea de
  // referencia). Bonus si está bajo el par, penalty si lo está sobre.
  const maxScore = Math.max(...scores.map(s => s ?? 0), ...pars.map(p => (p ?? 0) + 2))
  const minScore = Math.min(...scores.map(s => s ?? Infinity).filter(s => s !== Infinity), 1)

  const width = 320
  const height = 110
  const padX = 4
  const padTop = 18
  const padBottom = 22
  const innerH = height - padTop - padBottom
  const barW = (width - padX * 2) / validHoles
  const yScale = (v: number) => padTop + innerH - ((v - Math.max(0, minScore - 1)) / (maxScore - Math.max(0, minScore - 1))) * innerH

  const front9 = scores.slice(0, 9)
  const back9 = scores.slice(9, 18)
  const front9Sum = front9.reduce<number>((a, b) => a + (b ?? 0), 0)
  const back9Sum = back9.reduce<number>((a, b) => a + (b ?? 0), 0)
  const showSplit = validHoles >= 18

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
      margin: '8px 0',
      maxWidth: 360,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 10,
        fontSize: 12,
      }}>
        <div>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>
            {summary.course_name ?? 'Ronda'}
          </span>
          {summary.played_at && (
            <span style={{ color: 'var(--text-2)', marginLeft: 6 }}>
              · {new Date(summary.played_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
        {summary.total_gross != null && (
          <span style={{ color: '#8A6A16', fontWeight: 700 }}>
            {summary.total_gross} golpes
          </span>
        )}
      </div>

      <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
        {scores.map((s, i) => {
          if (s == null) return null
          const par = pars[i]
          const x = padX + i * barW
          const y = yScale(s)
          const h = padTop + innerH - y
          const overPar = par != null ? s - par : 0
          const fill = barColor(overPar)
          return (
            <g key={i}>
              <rect
                x={x + 1}
                y={y}
                width={barW - 2}
                height={h}
                fill={fill}
                rx={2}
              />
              {par != null && (
                <line
                  x1={x}
                  y1={yScale(par)}
                  x2={x + barW}
                  y2={yScale(par)}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              )}
              {/* hole number */}
              <text
                x={x + barW / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-2)"
                fontFamily="ui-monospace, monospace"
              >
                {i + 1}
              </text>
            </g>
          )
        })}
      </svg>

      {showSplit && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--text-2)',
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px dashed var(--border)',
        }}>
          <span>Front 9: <strong style={{ color: 'var(--text)' }}>{front9Sum}</strong></span>
          <span>Δ <strong style={{ color: back9Sum > front9Sum ? '#dc2626' : '#15803d' }}>
            {back9Sum > front9Sum ? '+' : ''}{back9Sum - front9Sum}
          </strong></span>
          <span>Back 9: <strong style={{ color: 'var(--text)' }}>{back9Sum}</strong></span>
        </div>
      )}

      <div style={{
        display: 'flex',
        gap: 10,
        fontSize: 10,
        color: 'var(--text-2)',
        marginTop: 8,
        flexWrap: 'wrap',
      }}>
        <Legend color={barColor(-1)} label="birdie" />
        <Legend color={barColor(0)} label="par" />
        <Legend color={barColor(1)} label="bogey" />
        <Legend color={barColor(2)} label="doble" />
        <Legend color={barColor(3)} label="+" />
      </div>
    </div>
  )
}

function barColor(overPar: number): string {
  if (overPar <= -2) return '#16a34a' // eagle+
  if (overPar === -1) return '#22c55e' // birdie
  if (overPar === 0) return '#94a8c0'  // par
  if (overPar === 1) return '#f59e0b'  // bogey
  if (overPar === 2) return '#ef4444'  // doble
  return '#7f1d1d' // triple+
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 8, height: 8, background: color, borderRadius: 2 }} />
      {label}
    </span>
  )
}
