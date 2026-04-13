import { GARMIN_COLORS } from '@/components/ScoreSymbol'

/** Color de un segmento según diff vs par (Garmin palette) */
export function getHoleColor(diff: number | null): string {
  if (diff == null) return 'rgba(0,0,0,0.08)'
  if (diff <= -2) return GARMIN_COLORS.eagle    // #0B6BA6
  if (diff === -1) return GARMIN_COLORS.birdie   // #14B3D9
  if (diff === 0)  return '#4ade80'              // verde
  if (diff === 1)  return GARMIN_COLORS.bogey    // #D4A442
  return GARMIN_COLORS.double                     // #DC3B2E
}

/** Color de un segmento según puntos Stableford */
export function getStablefordColor(points: number | null): string {
  if (points == null) return 'rgba(0,0,0,0.08)'
  if (points === 0) return GARMIN_COLORS.double   // rojo
  if (points === 1) return GARMIN_COLORS.bogey    // dorado
  if (points === 2) return '#4ade80'              // verde
  if (points === 3) return GARMIN_COLORS.birdie   // celeste
  return GARMIN_COLORS.eagle                       // azul (eagle+ = 4-5 pts)
}

interface HoleColorBarProps {
  scores: Array<{ gross: number; par: number; neto?: number; stablefordPts?: number } | null | undefined>
  totalHoles: number
  formato?: string  // 'stableford' usa colores por puntos
}

export function HoleColorBar({ scores, totalHoles, formato }: HoleColorBarProps) {
  const getColor = (s: typeof scores[number]) => {
    if (!s) return 'rgba(0,0,0,0.08)'
    if (formato === 'stableford' && s.stablefordPts != null) {
      return getStablefordColor(s.stablefordPts)
    }
    // Usar score neto si está disponible, sino gross
    const score = s.neto ?? s.gross
    return getHoleColor(score - s.par)
  }

  return (
    <div style={{ display: 'flex', gap: '2px', height: '5px' }}>
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
