'use client'

import type { CSSProperties } from 'react'

export type PatternState = 'active' | 'latente'
export type PatternCategory = 'mental' | 'cancha' | 'tecnico'

interface Props {
  category: PatternCategory
  state: PatternState
  name: string
  score: number | string
  scoreSuffix?: string
  spark: Array<{ height: number; tone?: 'ink' | 'pos' | 'neg' | 'faded' }>
  footMeta: string
}

const CAT_LABEL: Record<PatternCategory, string> = {
  mental: 'Mental',
  cancha: 'Cancha',
  tecnico: 'Técnico',
}

const CAT_COLOR: Record<PatternCategory, string> = {
  mental: 'var(--coach-pattern-mental)',
  cancha: 'var(--coach-pattern-cancha)',
  tecnico: 'var(--coach-pattern-cancha)',
}

const SPARK_COLOR: Record<NonNullable<Props['spark'][number]['tone']>, string> = {
  ink: 'var(--text)',
  pos: 'var(--coach-recovery-high)',
  neg: 'var(--coach-recovery-low)',
  faded: 'var(--line)',
}

export function PatternTile({ category, state, name, score, scoreSuffix, spark, footMeta }: Props) {
  const isLatent = state === 'latente'
  const tileStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '18px 20px 16px',
    marginBottom: '10px',
    opacity: isLatent ? 0.55 : 1,
  }
  const scoreColor = isLatent ? 'var(--coach-pattern-latente)' : 'var(--coach-recovery-low)'

  return (
    <div style={tileStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', marginBottom: '14px' }}>
        <div>
          <div style={{
            fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase',
            color: isLatent ? 'var(--coach-pattern-latente)' : CAT_COLOR[category],
            fontWeight: 700, marginBottom: '4px', fontFamily: '"DM Mono", monospace',
          }}>
            {CAT_LABEL[category]} · {isLatent ? 'latente' : 'activo'}
          </div>
          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '16px', fontWeight: 600, lineHeight: 1.2 }}>{name}</div>
        </div>
        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '28px', fontWeight: 500, color: scoreColor, lineHeight: 1, flexShrink: 0 }}>
          {score}{scoreSuffix && <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{scoreSuffix}</span>}
        </div>
      </div>
      {!isLatent && spark.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '18px', marginBottom: '14px' }} aria-hidden>
          {spark.map((b, i) => (
            <div key={i} style={{ width: '7px', height: `${b.height}%`, background: SPARK_COLOR[b.tone ?? 'ink'] }} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--line)', fontSize: '11.5px', color: 'var(--text-2)', fontFamily: '"DM Mono", monospace' }}>
        <span>{footMeta}</span>
        <span style={{ color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: '12px' }}>ver →</span>
      </div>
    </div>
  )
}
