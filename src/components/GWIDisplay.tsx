'use client'

import { GWISparkline } from './GWISparkline'

interface GWIDisplayProps {
  gwi: number
  delta: number
  series: number[]
  level: string
  totalRounds: number
  bestRound: number | null
  trend: string
  vsIndex: number | null
}

export function GWIDisplay({ gwi, delta, series, level, totalRounds, bestRound, trend, vsIndex }: GWIDisplayProps) {
  // Arc calculations
  const radius = 80
  const strokeWidth = 10
  const startAngle = 150
  const endAngle = 390
  const totalAngle = endAngle - startAngle // 240°
  const valueAngle = startAngle + (gwi / 100) * totalAngle

  const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
    const rad = (angle - 90) * Math.PI / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  const cx = 100, cy = 100
  const arcPath = (start: number, end: number, r: number) => {
    const s = polarToCartesian(cx, cy, r, start)
    const e = polarToCartesian(cx, cy, r, end)
    const large = end - start > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
  }

  // Colors
  const arcColor = gwi >= 80 ? '#00e676' : gwi >= 60 ? '#c4992a' : gwi >= 40 ? '#ffab40' : '#ff1744'
  const numberColor = gwi >= 70 ? '#c4992a' : gwi >= 50 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)'
  const deltaColor = delta > 0 ? '#00e676' : delta < 0 ? '#ff1744' : 'rgba(255,255,255,0.3)'
  const deltaIcon = delta > 0 ? '▲' : delta < 0 ? '▼' : '—'

  const trendText = trend === 'up' ? '▲ Mejorando' : trend === 'down' ? '▼ Bajando' : '→ Estable'
  const trendColor = trend === 'up' ? '#00e676' : trend === 'down' ? '#ff1744' : 'rgba(255,255,255,0.5)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      {/* Gauge */}
      <div style={{ position: 'relative', width: '200px', height: '160px' }}>
        <svg width="200" height="160" viewBox="0 0 200 160">
          {/* Track */}
          <path d={arcPath(startAngle, endAngle, radius)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} strokeLinecap="round" />
          {/* Value arc */}
          {gwi > 0 && (
            <path d={arcPath(startAngle, Math.min(valueAngle, endAngle), radius)} fill="none" stroke={arcColor} strokeWidth={strokeWidth} strokeLinecap="round" />
          )}
          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map(v => {
            const angle = startAngle + (v / 100) * totalAngle
            const inner = polarToCartesian(cx, cy, radius + 8, angle)
            const outer = polarToCartesian(cx, cy, radius + 14, angle)
            return (
              <g key={v}>
                <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <text x={outer.x} y={outer.y + 4} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="var(--font-dm-mono), monospace">{v}</text>
              </g>
            )
          })}
        </svg>

        {/* Center content */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -40%)',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--font-cormorant), serif', fontSize: '52px', fontWeight: 300,
            color: numberColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          }}>
            {gwi > 0 ? gwi.toFixed(1) : '--'}
          </div>
          {gwi > 0 && (
            <div style={{
              fontFamily: 'var(--font-dm-mono), monospace', fontSize: '12px', color: deltaColor,
              marginTop: '4px',
            }}>
              {deltaIcon} {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
            </div>
          )}
          <div style={{
            marginTop: '6px', padding: '2px 10px', borderRadius: '10px',
            background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.2)',
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px',
            color: '#c4992a', letterSpacing: '0.1em', fontWeight: 500,
          }}>
            {level}
          </div>
        </div>
      </div>

      {/* Sparkline */}
      {series.length >= 2 && (
        <div style={{ width: '100%', maxWidth: '240px' }}>
          <GWISparkline series={series} delta={delta} width={240} height={44} />
        </div>
      )}

      {/* LIVE indicator */}
      {totalRounds > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%', background: '#00e676',
            animation: 'pulse-dot 1.6s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px', color: '#00e676' }}>
            LIVE · {totalRounds} rondas
          </span>
        </div>
      )}

      {/* Metrics 2x2 */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px',
        background: 'rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden',
        width: '100%', maxWidth: '280px',
      }}>
        {[
          { label: 'RONDAS', value: String(totalRounds), sub: 'registradas' },
          { label: 'MEJOR VUELTA', value: bestRound ? String(bestRound) : '--', sub: 'gross' },
          { label: 'TENDENCIA', value: trendText, sub: 'últimas 3 rondas', color: trendColor },
          { label: 'VS ÍNDICE', value: vsIndex != null ? `${vsIndex > 0 ? '+' : ''}${vsIndex.toFixed(1)}` : '--', sub: 'strokes vs esperado' },
        ].map((m, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.02)', padding: '14px 12px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', marginBottom: '6px' }}>
              {m.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-cormorant), serif', fontSize: '24px', fontWeight: 300,
              color: m.color ?? 'rgba(255,255,255,0.85)', lineHeight: 1,
            }}>
              {m.value}
            </div>
            <div style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>
              {m.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
