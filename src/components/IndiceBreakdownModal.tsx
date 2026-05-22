'use client'

// src/components/IndiceBreakdownModal.tsx
//
// Modal "¿Qué rondas cuentan?" — desglose del cálculo del Índice Golfers+.
// Inbox 82af3d48: el usuario quiere ver, al estilo app FedeGolf, qué rondas
// concretas se usaron para llegar a su índice actual.
//
// Lógica: replica la del RPC `calcular_indice_golfers` (migration 037 →
// 20260521_excluded_from_handicap):
//   1) Tomar las últimas 20 rondas (played_at DESC) con diferencial no-null,
//      slope_rating no-null, course_rating no-null, NOT excluded_from_handicap.
//   2) Ordenar por diferencial ASC (mejores primero).
//   3) "Usar" = mejores N de esas 20 según la tabla WHS (count→usar).
//   4) Índice = AVG(mejores N) × 0.96.
//
// La lista se renderiza ordenada por played_at DESC (cronológico, como el
// resto del historial), pero cada item indica si entra o no en el cálculo.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { X, Trophy } from '@/components/icons'

interface RoundForBreakdown {
  id: string
  course_name: string
  played_at: string
  total_gross: number | null
  diferencial: number | null
  holes_played: number | null
  excluded_from_handicap: boolean
}

interface IndiceBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
}

// Misma tabla USGA usada por el RPC y por calcularIndiceGolfersLocal.
function rondasUsadas(count: number): number {
  if (count <= 6) return 1
  if (count <= 8) return 2
  if (count <= 11) return 3
  if (count <= 14) return 4
  if (count <= 16) return 5
  if (count === 17) return 6
  if (count <= 19) return 7
  return 8
}

function formatDateShort(d: string): string {
  try {
    const date = new Date(d)
    return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
  } catch {
    return d
  }
}

export default function IndiceBreakdownModal({ isOpen, onClose }: IndiceBreakdownModalProps) {
  const [rounds, setRounds] = useState<RoundForBreakdown[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }
      const { data } = await supabase
        .from('historical_rounds')
        .select('id, course_name, played_at, total_gross, diferencial, holes_played, excluded_from_handicap')
        .eq('user_id', user.id)
        .not('diferencial', 'is', null)
        .not('slope_rating', 'is', null)
        .not('course_rating', 'is', null)
        .eq('excluded_from_handicap', false)
        .order('played_at', { ascending: false })
        .limit(20)
      if (!cancelled) {
        setRounds((data as RoundForBreakdown[]) ?? [])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  // Set de IDs de las rondas que entran al cálculo (mejores N por diferencial).
  const usedIds = useMemo(() => {
    if (!rounds || rounds.length < 3) return new Set<string>()
    const sorted = [...rounds].sort((a, b) => (a.diferencial ?? 0) - (b.diferencial ?? 0))
    const usar = rondasUsadas(rounds.length)
    return new Set(sorted.slice(0, usar).map(r => r.id))
  }, [rounds])

  const indice = useMemo(() => {
    if (!rounds || rounds.length < 3) return null
    const sorted = [...rounds].sort((a, b) => (a.diferencial ?? 0) - (b.diferencial ?? 0))
    const usar = rondasUsadas(rounds.length)
    const mejores = sorted.slice(0, usar).map(r => r.diferencial ?? 0)
    const avg = mejores.reduce((a, b) => a + b, 0) / mejores.length
    return Math.round(avg * 0.96 * 10) / 10
  }, [rounds])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="indice-breakdown-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(7,13,24,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'breakdownOverlayIn 200ms ease-out both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          padding: '20px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          animation: 'breakdownSheetIn 280ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2
            id="indice-breakdown-title"
            style={{
              fontFamily: '"Playfair Display", serif', fontSize: '20px', fontWeight: 700,
              color: 'var(--text)', margin: 0,
            }}
          >
            ¿Qué rondas cuentan?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)',
              padding: '6px', minWidth: '36px', minHeight: '36px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Resumen */}
        {!loading && rounds && rounds.length > 0 && (
          <div style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '14px',
            fontSize: '12px',
            color: 'var(--text-2)',
            lineHeight: 1.6,
          }}>
            De tus últimas <strong style={{ color: 'var(--text)' }}>{rounds.length}</strong> rondas con diferencial,
            las mejores <strong style={{ color: 'var(--text)' }}>{usedIds.size}</strong> entran al cálculo:
            promedio × 0.96 = <strong style={{ color: '#c4992a' }}>{indice ?? '—'}</strong>.
          </div>
        )}

        {loading && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '40px 0' }}>
            Cargando…
          </p>
        )}

        {!loading && rounds && rounds.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '40px 0', lineHeight: 1.6 }}>
            Aún no tenés rondas con diferencial calculado.<br />
            Importá tu historial desde FedeGolf, Garmin o un CSV.
          </p>
        )}

        {!loading && rounds && rounds.length > 0 && rounds.length < 3 && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '20px 0', lineHeight: 1.6 }}>
            Faltan {3 - rounds.length} rondas para activar el índice (mínimo 3 con diferencial).
          </p>
        )}

        {/* Lista */}
        {!loading && rounds && rounds.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {rounds.map(r => {
              const used = usedIds.has(r.id)
              return (
                <li
                  key={r.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px',
                    border: `1px solid ${used ? 'rgba(196,153,42,0.35)' : 'var(--border)'}`,
                    background: used ? 'rgba(196,153,42,0.04)' : 'var(--bg)',
                    borderRadius: '10px',
                  }}
                >
                  {used && (
                    <span aria-label="Usada en el cálculo" style={{ color: '#c4992a', display: 'inline-flex' }}>
                      <Trophy size={14} strokeWidth={1.75} />
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.course_name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                      {formatDateShort(r.played_at)} · {r.holes_played ?? 18}h · {r.total_gross ?? '—'}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '13px', fontWeight: 700,
                    fontFamily: '"DM Mono", monospace',
                    color: used ? '#c4992a' : 'var(--text-2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {r.diferencial != null ? r.diferencial.toFixed(1) : '—'}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* style jsx global porque las animations se aplican via inline style={{ animation: ... }}
            que no puede referenciar keyframes scoped al componente. Sin global, el modal abría
            sin pintar la animación (Playwright detectaba el dialog pero el visual humano lo
            veía vacío detrás del backdrop). */}
        <style jsx global>{`
          @keyframes breakdownOverlayIn {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes breakdownSheetIn {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  )
}
