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
 * Layout:
 *   - eyebrow "Resumen de tu ronda"
 *   - big-bar en 2 filas (Ida 1–9 / Vuelta 10–18) con subtotal y diff
 *   - data-rows: Mejor · Peor con tag coloreado del resultado
 *   - breakdown: grilla de 5 columnas (Eagle Birdie Par Bogey Doble+)
 */
export function RoundHighlights({ data, scores, parMap, totalHoles }: Props) {
  if (data.holesPlayed === 0) return null

  const idaHoles = Math.min(9, totalHoles)
  const vueltaHoles = totalHoles - idaHoles

  const idaDiff = sumDiff(scores, parMap, 1, idaHoles)
  const idaScore = sumScores(scores, 1, idaHoles)
  const vueltaDiff = sumDiff(scores, parMap, idaHoles + 1, totalHoles)
  const vueltaScore = sumScores(scores, idaHoles + 1, totalHoles)

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: '14px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        marginBottom: '16px',
      }}
    >
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

      {/* Big activity bar — 2 rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <BarRow
          title={vueltaHoles > 0 ? 'Ida · 1–9' : `Hoyos 1–${idaHoles}`}
          subtotal={idaScore}
          diff={idaDiff}
          scores={scores}
          parMap={parMap}
          from={1}
          to={idaHoles}
          bestHole={data.bestHole?.hole ?? null}
          worstHole={data.worstHole?.hole ?? null}
        />
        {vueltaHoles > 0 && (
          <BarRow
            title={`Vuelta · ${idaHoles + 1}–${totalHoles}`}
            subtotal={vueltaScore}
            diff={vueltaDiff}
            scores={scores}
            parMap={parMap}
            from={idaHoles + 1}
            to={totalHoles}
            bestHole={data.bestHole?.hole ?? null}
            worstHole={data.worstHole?.hole ?? null}
          />
        )}
      </div>

      {/* Mejor / Peor rows */}
      <div style={{ borderTop: `1px solid ${BORDER_SOFT}`, borderBottom: `1px solid ${BORDER_SOFT}` }}>
        {data.bestHole && (
          <DataRow
            kind="Mejor"
            hole={data.bestHole.hole}
            par={data.bestHole.par}
            score={data.bestHole.score}
            diff={data.bestHole.diff}
          />
        )}
        {data.worstHole && data.worstHole.hole !== data.bestHole?.hole && (
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

      {/* Breakdown grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <BreakdownCell color={G_EAGLE} label="Eagle" count={data.desglose.eagles} />
        <BreakdownCell color={G_BIRDIE} label="Birdie" count={data.desglose.birdies} />
        <BreakdownCell color={G_PAR} label="Par" count={data.desglose.pares} />
        <BreakdownCell color={G_BOGEY} label="Bogey" count={data.desglose.bogeys} />
        <BreakdownCell color={G_DOUBLE} label="Doble+" count={data.desglose.doublesPlus} last />
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
  bestHole,
  worstHole,
}: {
  title: string
  subtotal: number
  diff: number
  scores: Record<number, number>
  parMap: Record<number, number>
  from: number
  to: number
  bestHole: number | null
  worstHole: number | null
}) {
  const holes: number[] = []
  for (let h = from; h <= to; h++) holes.push(h)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '10px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: TEXT_3,
          fontWeight: 500,
        }}
      >
        <span>{title}</span>
        <span>
          <span
            style={{
              color: TEXT,
              fontWeight: 600,
              letterSpacing: '-0.005em',
              textTransform: 'none',
              fontSize: '12px',
            }}
          >
            {subtotal || '—'}
          </span>
          {subtotal > 0 && (
            <span style={{ color: TEXT_2, marginLeft: '8px', letterSpacing: '0.02em' }}>
              {diff > 0 ? `+${diff}` : diff}
            </span>
          )}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '3px', height: '9px' }}>
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
      <div style={{ display: 'flex', gap: '3px' }}>
        {holes.map(h => {
          const isBest = bestHole === h
          const isWorst = worstHole === h && !isBest
          const color = isBest ? G_BIRDIE : isWorst ? G_DOUBLE : TEXT_3
          const weight = isBest || isWorst ? 700 : 500
          return (
            <div
              key={h}
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: 'var(--font-dm-mono)',
                fontSize: '10px',
                fontWeight: weight,
                color,
              }}
            >
              {h}
            </div>
          )
        })}
      </div>
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
        display: 'grid',
        gridTemplateColumns: '110px 1fr auto',
        alignItems: 'baseline',
        padding: '14px 0',
        borderBottom: last ? 'none' : `1px solid ${BORDER_SOFT}`,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '10px',
          fontWeight: 700,
          color: TEXT_3,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {kind}
      </span>
      <span style={{ fontSize: '14px', color: TEXT, letterSpacing: '-0.005em' }}>
        <span
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontWeight: 600,
            color: TEXT,
            marginRight: '2px',
          }}
        >
          Hoyo {hole}
        </span>
        <span style={{ color: TEXT_2, fontSize: '13px' }}>
          {' · Par '}{par}{' · Score '}{score}
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
      <span
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '12px',
          fontWeight: 500,
          color: TEXT_3,
        }}
      >
        {diff > 0 ? `+${diff}` : diff}
      </span>
    </div>
  )
}

function BreakdownCell({
  color,
  label,
  count,
  last,
}: {
  color: string
  label: string
  count: number
  last?: boolean
}) {
  return (
    <div
      style={{
        padding: '4px 8px 4px 0',
        borderRight: last ? 'none' : `1px solid ${BORDER_SOFT}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <span style={{ width: '14px', height: '2px', background: color }} />
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
      </div>
      <div
        style={{
          fontFamily: 'var(--font-playfair)',
          fontSize: '24px',
          fontWeight: 700,
          color: count === 0 ? TEXT_3 : TEXT,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {count}
      </div>
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
