interface HoleColorBarProps {
  scores: Array<{ gross: number; par: number } | null | undefined>
  totalHoles: number
}

export function HoleColorBar({ scores, totalHoles }: HoleColorBarProps) {
  const getColor = (s: { gross: number; par: number } | null | undefined) => {
    if (!s) return 'rgba(0,0,0,0.08)'
    const d = s.gross - s.par
    if (d <= -2) return '#93C5FD'
    if (d === -1) return '#FCA5A5'
    if (d === 0) return '#86EFAC'
    if (d === 1) return '#FCD34D'
    if (d === 2) return '#F87171'
    return '#DC2626'
  }

  return (
    <div style={{ display: 'flex', gap: '2px', marginTop: '10px', height: '5px' }}>
      {Array.from({ length: totalHoles }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1, height: '5px', borderRadius: '2.5px',
            background: getColor(scores?.[i]),
            transition: 'background 0.2s ease',
          }}
        />
      ))}
    </div>
  )
}
