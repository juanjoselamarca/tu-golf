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
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase'
import { X } from '@/components/icons'
import BreakdownRow, { BreakdownLista } from '@/components/indice/BreakdownRow'

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

  // Inyectar keyframes globales una sola vez. Patrón portable que evita
  // el problema de styled-jsx con inline style animation + ESLint Vercel.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const id = 'indice-breakdown-keyframes'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @keyframes breakdownOverlayIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes breakdownSheetIn {
        from { transform: translateY(100%); }
        to   { transform: translateY(0); }
      }
    `
    document.head.appendChild(style)
  }, [])

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
  // SSR safety: portal solo en cliente. Sin el guard, hydration mismatch.
  if (typeof document === 'undefined') return null

  // Portal a document.body para que position:fixed se resuelva contra el viewport,
  // no contra un ancestor con transform (main { animation:pageIn } crea containing
  // block que rompía el posicionamiento del bottom-sheet).
  return createPortal((
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
            promedio × 0.96 = <strong style={{ color: 'var(--brand-on-bg)' }}>{indice ?? '—'}</strong>.
          </div>
        )}

        {loading && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '40px 0' }}>
            Cargando…
          </p>
        )}

        {!loading && rounds && rounds.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '40px 0', lineHeight: 1.6 }}>
            Aún no tienes rondas con diferencial calculado.<br />
            Importá tu historial desde FedeGolf, Garmin o un CSV.
          </p>
        )}

        {!loading && rounds && rounds.length > 0 && rounds.length < 3 && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '20px 0', lineHeight: 1.6 }}>
            Faltan {3 - rounds.length} rondas para activar el índice (mínimo 3 con diferencial).
          </p>
        )}

        {/* Lista — misma forma que el desglose del índice federado: los dos
            sheets salen de /perfil y muestran la misma clase de objeto, así que
            la fila la manda un solo archivo (DESIGN.md P4). */}
        {!loading && rounds && rounds.length > 0 && (
          <BreakdownLista>
            {rounds.map(r => (
              <BreakdownRow
                key={r.id}
                titulo={r.course_name}
                meta={`${formatDateShort(r.played_at)} · ${r.holes_played ?? 18}h · ${r.total_gross ?? '—'}`}
                valor={r.diferencial != null ? r.diferencial.toFixed(1) : '—'}
                cuenta={usedIds.has(r.id)}
              />
            ))}
          </BreakdownLista>
        )}

        {/* Keyframes inyectados via useEffect (ver bloque arriba del componente).
            <style jsx global> rompe el ESLint config de Vercel. */}
      </div>
    </div>
  ), document.body)
}
