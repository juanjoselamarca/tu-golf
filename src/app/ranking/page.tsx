'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { NIVEL_LABELS } from '@/lib/indice-golfers'

/* ── Theme tokens (coherente con signup + score-grupo v2 white) ────── */
const theme = {
  bg: 'var(--bg)',
  card: 'var(--bg-surface)',
  text: 'var(--text)',
  textMuted: 'var(--text-2)',
  textFaint: 'var(--text-3)',
  border: 'var(--border)',
  borderSoft: 'var(--border)',
  gold: '#c4992a',
  goldText: '#8A6A16', /* WCAG AA: 5:1 sobre #fff. Usar para text/links, NO para bordes/fondos. */
} as const

/* ── Nivel colors (progresivo) ────────────────────────────────────── */
const NIVEL_COLORS: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#f1f5f9', fg: '#64748b' },  // Rookie — gris
  2: { bg: '#dbeafe', fg: '#1d4ed8' },  // En Cancha — azul claro
  3: { bg: '#dcfce7', fg: '#15803d' },  // Activo — verde
  4: { bg: '#fef3c7', fg: '#a16207' },  // Scratch+ — ámbar
  5: { bg: '#fce7f3', fg: '#be185d' },  // Golfer+ — magenta (tope)
}

type RankingSource = 'golfers' | 'federacion'

interface RankedPlayer {
  id: string
  name: string | null
  indice_golfers: number | null
  indice: number | null
  nivel: number | null
  avatar_url: string | null
}

export default function RankingPage() {
  const [source, setSource] = useState<RankingSource>('golfers')
  const [players, setPlayers] = useState<RankedPlayer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const col = source === 'golfers' ? 'indice_golfers' : 'indice'
      const { data } = await supabase
        .from('profiles')
        .select('id, name, indice_golfers, indice, nivel, avatar_url')
        .not(col, 'is', null)
        .order(col, { ascending: true })
        .limit(50)
      setPlayers((data as RankedPlayer[]) || [])
      setLoading(false)
    }
    load()
  }, [source])

  const activeIndex = (p: RankedPlayer): number | null =>
    source === 'golfers' ? p.indice_golfers : p.indice

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            fontSize: '11px', color: theme.textMuted, fontFamily: '"DM Mono", ui-monospace, monospace',
            letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: '6px',
          }}>
            Ranking Chile
          </div>
          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 'clamp(28px, 6vw, 38px)',
            color: theme.text,
            margin: '0 0 6px',
            letterSpacing: '-0.015em',
            lineHeight: 1.1,
            fontWeight: 600,
          }}>
            Top 50 Golfers<span style={{ color: theme.gold }}>+</span>
          </h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, margin: 0, lineHeight: 1.5 }}>
            Jugadores ordenados por índice — los números mandan
          </p>
        </div>

        {/* Filter tabs (Golfers+ vs Federación) */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '20px', justifyContent: 'center',
        }}>
          {([
            { v: 'golfers' as const, label: 'Golfers+', hint: 'Cálculo propio' },
            { v: 'federacion' as const, label: 'Federación', hint: 'Índice FedeGolf' },
          ]).map(t => {
            const active = source === t.v
            return (
              <button
                key={t.v}
                onClick={() => setSource(t.v)}
                style={{
                  background: active ? theme.text : 'var(--bg-surface)',
                  color: active ? 'var(--bg-surface)' : theme.text,
                  border: `1px solid ${active ? theme.text : theme.border}`,
                  borderRadius: '999px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 180ms',
                }}
              >
                {t.label}
                <span style={{
                  marginLeft: '6px',
                  fontSize: '10px',
                  opacity: active ? 0.7 : 1,
                  color: active ? undefined : theme.textFaint,
                  fontWeight: 500,
                }}>
                  {t.hint}
                </span>
              </button>
            )
          })}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted, fontSize: '14px' }}>
            Cargando…
          </div>
        ) : players.length === 0 ? (
          <div style={{
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: '16px',
            padding: '40px 24px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '6px' }}>
              Sin jugadores rankeados todavía
            </div>
            <p style={{ fontSize: '13px', color: theme.textMuted, lineHeight: 1.6, margin: 0 }}>
              {source === 'golfers'
                ? 'El Índice Golfers+ se calcula con 3+ rondas que tengan Course Rating y Slope. Cuando los jugadores completen sus primeras rondas, aparecerán acá.'
                : 'Aún no hay jugadores con índice Federación cargado. Los usuarios pueden ingresarlo desde su perfil.'}
            </p>
          </div>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {players.map((p, idx) => {
              const rank = idx + 1
              const idx_ = activeIndex(p)
              const nivelLabel = p.nivel ? NIVEL_LABELS[p.nivel] : null
              const nivelColor = p.nivel ? NIVEL_COLORS[p.nivel] : null
              const isPodium = rank <= 3
              return (
                <li
                  key={p.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center',
                    gap: '14px',
                    background: theme.card,
                    border: `1px solid ${isPodium ? theme.gold : theme.border}`,
                    borderRadius: '14px',
                    padding: '14px 18px',
                    boxShadow: isPodium
                      ? '0 2px 12px rgba(196,153,42,0.12)'
                      : '0 1px 2px rgba(15,23,42,0.03)',
                  }}
                >
                  {/* Rank */}
                  <div style={{
                    fontFamily: '"DM Mono", ui-monospace, monospace',
                    fontSize: isPodium ? '20px' : '16px',
                    fontWeight: 700,
                    color: isPodium ? theme.goldText : theme.textMuted,
                    width: '36px',
                    textAlign: 'center',
                    letterSpacing: '-0.02em',
                  }}>
                    {String(rank).padStart(2, '0')}
                  </div>

                  {/* Name + nivel */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: theme.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {p.name || 'Sin nombre'}
                    </div>
                    {nivelLabel && nivelColor && (
                      <span style={{
                        display: 'inline-block',
                        marginTop: '4px',
                        background: nivelColor.bg,
                        color: nivelColor.fg,
                        fontSize: '10px',
                        fontWeight: 700,
                        fontFamily: '"DM Mono", ui-monospace, monospace',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase' as const,
                        padding: '2px 8px',
                        borderRadius: '999px',
                      }}>
                        {nivelLabel}
                      </span>
                    )}
                  </div>

                  {/* Índice */}
                  <div style={{
                    fontFamily: '"DM Mono", ui-monospace, monospace',
                    fontSize: '20px',
                    fontWeight: 700,
                    color: theme.text,
                    letterSpacing: '-0.02em',
                    textAlign: 'right',
                  }}>
                    {idx_ != null ? idx_.toFixed(1) : '—'}
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        {/* Footer hint */}
        <div style={{ marginTop: '28px', textAlign: 'center' }}>
          <Link href="/indices" style={{
            fontSize: '12px',
            color: theme.textMuted,
            textDecoration: 'none',
            borderBottom: `1px dashed ${theme.border}`,
            paddingBottom: '2px',
          }}>
            ¿Cómo se calcula el Índice Golfers+?
          </Link>
        </div>
      </div>
    </div>
  )
}
