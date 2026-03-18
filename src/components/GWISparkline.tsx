interface GWISparklineProps {
  series: number[]
  delta: number
  width?: number
  height?: number
}

export function GWISparkline({ series, delta, width = 48, height = 18 }: GWISparklineProps) {
  if (!series || series.length < 2) return null

  const color = delta > 0 ? '#00e676' : delta < 0 ? '#ff1744' : 'rgba(255,255,255,0.3)'
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1

  const points = series.map((v, i) => {
    const x = (i / (series.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })

  const pathD = `M${points.join(' L')}`
  const areaD = `${pathD} L${width},${height} L0,${height} Z`
  const lastPoint = points[points.length - 1].split(',')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`grad-${delta > 0 ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${delta > 0 ? 'up' : 'down'})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="2" fill={color} />
    </svg>
  )
}
