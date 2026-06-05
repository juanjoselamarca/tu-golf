'use client'

/**
 * ScoreProjectionCard — render del objetivo/proyección de score que produjo la
 * calculadora determinista (tool compute_score_projection). El número que se ve
 * acá NUNCA lo calculó el LLM: salió de `projectScore`, por lo que es imposible
 * que esté mal. Si la cancha no tiene par completo verificado, `absolute` es null
 * y se muestra solo el "+N sobre par".
 *
 * Sigue el lenguaje visual de PlanAssignedCard (dorado/crema premium, tokens de
 * color, sin hardcodes de texto). El número es la garantía dura del coach.
 */

export interface ScoreProjection {
  over: number
  absolute: number | null
  relativeLabel: string
  distribution: {
    eagle: number
    birdie: number
    par: number
    bogey: number
    double: number
    triple: number
  }
}

interface Props {
  projection: ScoreProjection
}

const PART_LABELS: ReadonlyArray<readonly [keyof ScoreProjection['distribution'], string]> = [
  ['eagle', 'Eagles'],
  ['birdie', 'Birdies'],
  ['par', 'Pares'],
  ['bogey', 'Bogeys'],
  ['double', 'Dobles'],
  ['triple', 'Triples'],
]

export function ScoreProjectionCard({ projection }: Props) {
  const { absolute, relativeLabel, distribution } = projection
  const parts = PART_LABELS.filter(([k]) => distribution[k] > 0)
  const big = absolute != null ? String(absolute) : relativeLabel

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(196,153,42,0.10), rgba(196,153,42,0.04))',
        border: '1px solid rgba(196,153,42,0.35)',
        borderRadius: 16,
        padding: '20px 22px',
        margin: '16px 0',
        maxWidth: '85%',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(196,153,42,0.30)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#8A6A16',
          marginBottom: 10,
        }}
      >
        Objetivo calculado
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: parts.length ? 14 : 0 }}>
        <span
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 34,
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            lineHeight: 1,
          }}
        >
          {big}
        </span>
        {absolute != null && (
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
            {relativeLabel} sobre par
          </span>
        )}
      </div>

      {parts.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {parts.map(([k, label]) => (
            <li
              key={k}
              style={{
                fontSize: 12.5,
                color: 'var(--text-2)',
                background: 'rgba(196,153,42,0.08)',
                border: '1px solid rgba(196,153,42,0.18)',
                borderRadius: 999,
                padding: '3px 10px',
              }}
            >
              <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{distribution[k]}</strong> {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
