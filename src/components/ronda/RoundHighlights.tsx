'use client'

import type { RoundHighlightsData } from '@/lib/ronda/round-highlights'

const GOLD = '#c4992a'
const TEXT = '#1a1a1a'
const TEXT_2 = '#666'
const TEXT_3 = '#999'
const BORDER = '#e8e8e8'
const BORDER_SOFT = '#f2f2f2'

const G_EAGLE = '#0B6BA6'
const G_BIRDIE = '#14B3D9'
const G_PAR = '#22c55e'
const G_BOGEY = '#D4A442'
const G_DOUBLE = '#dc2626'

interface Props {
  data: RoundHighlightsData
  scores: Record<number, number>
  parMap: Record<number, number>
  totalHoles: number
}

/**
 * Bloque de highlights que aparece sobre el leaderboard en el espectador
 * cuando la ronda está finalizada y el usuario autenticado jugó la ronda.
 *
 * Layout (rediseño editorial-minimal, 17-jun — reporte inbox de Juanjo
 * "el formato es raro, no elegante ni minimalista"):
 *   - hero: eyebrow "Resumen de tu ronda" + score total (Playfair) con vs par
 *   - strip Ida/Vuelta: barras de color por hoyo + subtotal alineado a la derecha
 *   - Mejor · Peor: renglones tipográficos limpios con tag serif del resultado
 *   - desglose: fila inline de 5 (Eagle Birdie Par Bogey Doble+), sin bordes de tabla
 *
 * El curso/fecha NO se repiten acá: ya viven en el header de la página de resultados.
 */
export function RoundHighlights({ data, scores, parMap, totalHoles }: Props) {
  if (data.holesPlayed === 0) return null

  const idaHoles = Math.min(9, totalHoles)
  const vueltaHoles = totalHoles - idaHoles

  const idaDiff = sumDiff(scores, parMap, 1, idaHoles)
  const idaScore = sumScores(scores, 1, idaHoles)
  const vueltaDiff = sumDiff(scores, parMap, idaHoles + 1, totalHoles)
  const vueltaScore = sumScores(scores, idaHoles + 1, totalHoles)

  const totalScore = sumScores(scores, 1, totalHoles)
  const totalDiff = sumDiff(scores, parMap, 1, totalHoles)

  // Peor sólo se muestra si difiere del mejor. Si no, Mejor es la última fila
  // (evita doble borde inferior — el contenedor ya dibuja borderBottom).
  const showPeor = !!data.worstHole && data.worstHole.hole !== data.bestHole?.hole

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: '14px',
        padding: '26px',
        display: 'flex',
        flexDirection: 'column',
        gap: '26px',
        marginBottom: '16px',
      }}
    >
      {/* Hero — eyebrow + score total */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontSize: '10px',
            fontWeight: 700,
            color: GOLD,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Resumen de tu ronda
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span
            style={{
              fontFamily: 'var(--font-playfair)',
              fontSize: '46px',
              fontWeight: 700,
              lineHeight: 0.9,
              color: TEXT,
              letterSpacing: '-0.02em',
            }}
          >
            {totalScore || '—'}
          </span>
          {totalScore > 0 && (
            <span
              style={{
                fontFamily: 'var(--font-dm-mono)',
                fontSize: '15px',
                fontWeight: 500,
                color: TEXT_2,
              }}
            >
              {totalDiff > 0 ? `+${totalDiff}` : totalDiff === 0 ? 'E' : totalDiff}
            </span>
          )}
        </div>
      </div>

      {/* Strip Ida / Vuelta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
        <BarRow
          title={vueltaHoles > 0 ? 'Ida' : `Hoyos 1–${idaHoles}`}
          subtotal={idaScore}
          diff={idaDiff}
          scores={scores}
          parMap={parMap}
          from={1}
          to={idaHoles}
        />
        {vueltaHoles > 0 && (
          <BarRow
            title="Vuelta"
            subtotal={vueltaScore}
            diff={vueltaDiff}
            scores={scores}
            parMap={parMap}
            from={idaHoles + 1}
            to={totalHoles}
          />
        )}
      </div>

      {/* Mejor / Peor */}
      <div style={{ borderTop: `1px solid ${BORDER_SOFT}`, borderBottom: `1px solid ${BORDER_SOFT}` }}>
        {data.bestHole && (
          <DataRow
            kind="Mejor"
            hole={data.bestHole.hole}
            par={data.bestHole.par}
            score={data.bestHole.score}
            diff={data.bestHole.diff}
            last={!showPeor}
          />
        )}
        {showPeor && data.worstHole && (
          <DataRow
            kind="Peor"
            hole={data.worstHole.hole}
            par={data.worstHole.par}
            score={data.worstHole.score}
            diff={data.worstHole.diff}
            last
          />
        )}
      </div>

      {/* Desglose — fila inline, sin bordes de tabla */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <BreakdownCell color={G_EAGLE} label="Eagle" count={data.desglose.eagles} />
        <BreakdownCell color={G_BIRDIE} label="Birdie" count={data.desglose.birdies} />
        <BreakdownCell color={G_PAR} label="Par" count={data.desglose.pares} />
        <BreakdownCell color={G_BOGEY} label="Bogey" count={data.desglose.bogeys} />
        <BreakdownCell color={G_DOUBLE} label="Doble+" count={data.desglose.doublesPlus} />
      </div>
    </div>
  )
}

function BarRow({
  title,
  subtotal,
  diff,
  scores,
  parMap,
  from,
  to,
}: {
  title: string
  subtotal: number
  diff: number
  scores: Record<number, number>
  parMap: Record<number, number>
  from: number
  to: number
}) {
  const holes: number[] = []
  for (let h = from; h <= to; h++) holes.push(h)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <span
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '10px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: TEXT_3,
          fontWeight: 500,
          width: '42px',
          flexShrink: 0,
        }}
      >
        {title}
      </span>
      <div style={{ display: 'flex', gap: '2px', height: '8px', flex: 1 }}>
        {holes.map(h => (
          <div
            key={h}
            style={{
              flex: 1,
              background: segmentColor(scores[h], parMap[h]),
              borderRadius: '1px',
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '12px',
          fontWeight: 500,
          color: TEXT,
          width: '56px',
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {subtotal || '—'}
        {subtotal > 0 && (
          <span style={{ color: TEXT_2, fontWeight: 400, marginLeft: '6px' }}>
            {diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff}
          </span>
        )}
      </span>
    </div>
  )
}

function DataRow({
  kind,
  hole,
  par,
  score,
  diff,
  last,
}: {
  kind: 'Mejor' | 'Peor'
  hole: number
  par: number
  score: number
  diff: number
  last?: boolean
}) {
  const tagColor = diffToColor(diff)
  const tagLabel = diffToLabel(diff)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '14px',
        padding: '15px 0',
        borderBottom: last ? 'none' : `1px solid ${BORDER_SOFT}`,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '10px',
          fontWeight: 500,
          color: TEXT_3,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          width: '42px',
          flexShrink: 0,
        }}
      >
        {kind}
      </span>
      <span style={{ flex: 1, fontSize: '14px', color: TEXT, letterSpacing: '-0.005em' }}>
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontWeight: 500, color: TEXT, marginRight: '2px' }}>
          Hoyo {hole}
        </span>
        <span style={{ color: TEXT_2, fontSize: '13px' }}>
          {' · Par '}{par}{' · '}{score}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-playfair)',
            fontStyle: 'italic',
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '-0.005em',
            marginLeft: '8px',
            color: tagColor,
          }}
        >
          {tagLabel}
        </span>
      </span>
    </div>
  )
}

function BreakdownCell({
  color,
  label,
  count,
}: {
  color: string
  label: string
  count: number
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ width: '16px', height: '2px', background: color, borderRadius: '2px' }} />
      <span
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '10px',
          fontWeight: 600,
          color: TEXT_3,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-playfair)',
          fontSize: '26px',
          fontWeight: 700,
          color: count === 0 ? TEXT_3 : TEXT,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {count}
      </span>
    </div>
  )
}

function segmentColor(score: number | undefined, par: number | undefined): string {
  if (score == null || score === 0 || par == null) return BORDER
  const diff = score - par
  if (diff <= -2) return G_EAGLE
  if (diff === -1) return G_BIRDIE
  if (diff === 0) return G_PAR
  if (diff === 1) return G_BOGEY
  return G_DOUBLE
}

function sumScores(scores: Record<number, number>, from: number, to: number): number {
  let s = 0
  for (let h = from; h <= to; h++) if (scores[h]) s += scores[h]
  return s
}

function sumDiff(
  scores: Record<number, number>,
  parMap: Record<number, number>,
  from: number,
  to: number,
): number {
  let d = 0
  for (let h = from; h <= to; h++) {
    const s = scores[h]
    const p = parMap[h]
    if (s && p) d += s - p
  }
  return d
}

function diffToLabel(diff: number): string {
  if (diff <= -2) return 'Eagle'
  if (diff === -1) return 'Birdie'
  if (diff === 0) return 'Par'
  if (diff === 1) return 'Bogey'
  if (diff === 2) return 'Doble'
  return `+${diff}`
}

function diffToColor(diff: number): string {
  if (diff <= -2) return G_EAGLE
  if (diff === -1) return G_BIRDIE
  if (diff === 0) return G_PAR
  if (diff === 1) return G_BOGEY
  return G_DOUBLE
}
