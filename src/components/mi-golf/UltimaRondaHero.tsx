'use client'

import Link from 'next/link'
import type { RondaConScores } from '@/lib/mi-golf/ultima-ronda'

const GOLD = '#c4992a'
const TEXT = '#1a1a1a'
const TEXT_2 = '#666'
const TEXT_3 = '#999'
const BORDER = '#e8e8e8'

// Paleta Garmin Formato 2 — activity bar
const G_EAGLE = '#0B6BA6'
const G_BIRDIE = '#14B3D9'
const G_PAR = '#22c55e'
const G_BOGEY = '#D4A442'
const G_DOUBLE = '#dc2626'

/**
 * 4º estado del hero contextual de CompetenciaTab. Se muestra cuando hay una
 * ronda finalizada hoy. Toda la card es un <Link> al espectador de esa ronda.
 *
 * Diseño: espejo exacto de HeroProximo (white bg + border-left gold 4px).
 * Activity bar debajo del sub con 18 segmentos coloreados por vsPar hoyo.
 * Si no hay scores ni parPerHole, se omite la barra pero se muestra el resto.
 */
export function UltimaRondaHero({ ronda }: { ronda: RondaConScores }) {
  const segments = buildSegments(ronda.scores, ronda.parPerHole)

  return (
    <Link
      href={`/ronda-libre/${ronda.codigo}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        background: '#fff',
        color: TEXT,
        border: `1px solid ${GOLD}`,
        borderLeft: `4px solid ${GOLD}`,
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        textDecoration: 'none',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            fontWeight: 700,
            color: GOLD,
            marginBottom: '6px',
          }}
        >
          Última ronda
        </div>
        <div
          style={{
            fontSize: '17px',
            fontWeight: 700,
            lineHeight: 1.2,
            color: TEXT,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ronda.course_name}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: TEXT_2,
            marginTop: '4px',
            fontFamily: 'var(--font-dm-mono)',
            letterSpacing: '-0.005em',
          }}
        >
          Hoy
        </div>
        {segments.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '2px',
              height: '5px',
              marginTop: '10px',
            }}
            aria-label={`Actividad por hoyo — ${segments.length} segmentos`}
          >
            {segments.map((s, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  background: segmentColor(s),
                  borderRadius: '1px',
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-playfair)',
            fontSize: '32px',
            fontWeight: 700,
            lineHeight: 1,
            color: TEXT,
            letterSpacing: '-0.015em',
          }}
        >
          {ronda.total_gross ?? '—'}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontSize: '11px',
            fontWeight: 600,
            marginTop: '4px',
            color: diffColor(ronda.vsPar),
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {formatDiff(ronda.vsPar)}
        </div>
      </div>
    </Link>
  )
}

type SegKind = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'empty'

function buildSegments(
  scores: number[] | null,
  parPerHole: number[] | null,
): SegKind[] {
  if (!scores || !parPerHole) return []
  const n = Math.min(scores.length, parPerHole.length)
  const out: SegKind[] = []
  for (let i = 0; i < n; i++) {
    const s = scores[i]
    const p = parPerHole[i]
    if (s == null || p == null || s === 0) {
      out.push('empty')
      continue
    }
    const diff = s - p
    if (diff <= -2) out.push('eagle')
    else if (diff === -1) out.push('birdie')
    else if (diff === 0) out.push('par')
    else if (diff === 1) out.push('bogey')
    else out.push('double')
  }
  return out
}

function segmentColor(kind: SegKind): string {
  switch (kind) {
    case 'eagle': return G_EAGLE
    case 'birdie': return G_BIRDIE
    case 'par': return G_PAR
    case 'bogey': return G_BOGEY
    case 'double': return G_DOUBLE
    case 'empty': return BORDER
  }
}

function formatDiff(vsPar: number | null): string {
  if (vsPar == null) return '—'
  if (vsPar === 0) return 'par'
  return `${vsPar > 0 ? '+' : ''}${vsPar} vs par`
}

function diffColor(vsPar: number | null): string {
  if (vsPar == null) return TEXT_3
  if (vsPar <= 0) return G_PAR
  if (vsPar >= 5) return G_DOUBLE
  return TEXT_2
}
