'use client'

// src/components/IndiceBreakdownModal.tsx
//
// "¿Qué rondas cuentan?" modal: breakdown of the Golfers+ index calculation.
// Inbox 82af3d48: the user wants to see, FedeGolf app style, which specific
// rounds were used to reach their current index.
//
// Logic: same as the `calcular_indice_golfers` RPC:
//   1) The rounds that count: `indexWindow` (src/golf/core/index-window.ts).
//   2) Sort by diferencial ASC (best first).
//   3) "Best" = best N of those 20 per WHS Table 5.2a (`whsTableRow`).
//   4) Index = AVG(best N) + the table adjustment (`computeGolfersIndex`).
//
// The list renders sorted by played_at DESC (chronological, like the rest of
// the history), but each item shows whether it enters the calculation.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Portal } from '@/components/ui/Portal'
import { createClient } from '@/lib/supabase'
import { X } from '@/components/icons'
import BreakdownRow, { BreakdownLista } from '@/components/indice/BreakdownRow'
import { computeGolfersIndex, whsTableRow } from '@/golf/core/whs-index'
import { rondasParaActivar, textoRondasParaActivar } from '@/lib/indice-golfers'
import { indexWindow, INDEX_WINDOW_COLUMNS } from '@/golf/core/index-window'
import { formatearIndice } from '@/golf/handicap-index-range'

interface RoundForBreakdown {
  id: string
  course_name: string
  played_at: string
  created_at: string | null
  total_gross: number | null
  diferencial: number | null
  holes_played: number | null
  slope_rating: number | null
  course_rating: number | null
  excluded_from_handicap: boolean
}

interface IndiceBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
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
        .select(`${INDEX_WINDOW_COLUMNS}, course_name`)
        .eq('user_id', user.id)
        .order('played_at', { ascending: false })
      if (!cancelled) {
        setRounds(indexWindow((data as RoundForBreakdown[]) ?? []))
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  const tableRow = rounds ? whsTableRow(rounds.length) : null

  // Set de IDs de las rondas que entran al cálculo (mejores N por diferencial).
  const usedIds = useMemo(() => {
    if (!rounds || !tableRow) return new Set<string>()
    const sorted = [...rounds].sort((a, b) => (a.diferencial ?? 0) - (b.diferencial ?? 0))
    return new Set(sorted.slice(0, tableRow.best).map(r => r.id))
  }, [rounds, tableRow])

  const indice = useMemo(() => (rounds ? computeGolfersIndex(rounds.map(r => r.diferencial ?? 0)) : null), [rounds])

  if (!isOpen) return null

  // Portal a document.body para que position:fixed se resuelva contra el viewport,
  // no contra un ancestor con transform (main { animation:pageIn } crea containing
  // block que rompía el posicionamiento del bottom-sheet).
  return (
    <Portal>
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
          className="pb-sheet-safe"
          style={{
            background: 'var(--bg-surface)',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            paddingTop: '20px',
            paddingInline: '16px',
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

          {/* Resumen: solo con índice (sin fila de la tabla WHS diría "mejores 0 … = —") */}
          {!loading && rounds && tableRow && (
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
              De tus últimas <strong style={{ color: 'var(--text)' }}>{rounds.length}</strong> rondas válidas,
              las mejores <strong style={{ color: 'var(--text)' }}>{usedIds.size}</strong> entran al cálculo:
              {tableRow.adjustment !== 0 ? `promedio − ${Math.abs(tableRow.adjustment).toFixed(1)} (ajuste WHS con ${rounds.length} rondas)` : 'promedio'}{' '}
              = <strong style={{ color: 'var(--brand-on-bg)' }}>{indice != null ? formatearIndice(indice) : '—'}</strong>.
            </div>
          )}

          {loading && (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '40px 0' }}>
              Cargando…
            </p>
          )}

          {!loading && rounds && rounds.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '32px 0', lineHeight: 1.6 }}>
              {/* Las tarjetas FedeGolf llegan excluidas del índice: no son un camino para activarlo. */}
              <p style={{ margin: 0 }}>
                Aún no tienes rondas válidas (canchas con slope y rating).<br />
                Registra una ronda o importa tus tarjetas de Garmin desde tu historial.
              </p>
              <Link
                href="/ronda-libre/nueva"
                onClick={onClose}
                style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '0 12px', marginTop: '8px', color: 'var(--brand-on-bg)', fontWeight: 600, textDecoration: 'none' }}
              >
                Registrar una ronda →
              </Link>
            </div>
          )}

          {!loading && rounds && rounds.length > 0 && rondasParaActivar(rounds.length) > 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '20px 0', lineHeight: 1.6 }}>
              {textoRondasParaActivar(rondasParaActivar(rounds.length))}
            </p>
          )}

          {/* Lista — misma forma que el desglose del índice federado: los dos
              sheets salen de /perfil y muestran la misma clase de objeto, así que
              la fila la manda un solo archivo (DESIGN.md P4). */}
          {!loading && rounds && rounds.length > 0 && (
            <BreakdownLista>
              {rounds.map((r, i) => (
                <BreakdownRow
                  key={r.id}
                  titulo={r.course_name}
                  meta={`${formatDateShort(r.played_at)} · ${r.holes_played ?? 18}h · ${r.total_gross ?? '—'}`}
                  valor={r.diferencial != null ? r.diferencial.toFixed(1) : '—'}
                  cuenta={usedIds.has(r.id)}
                  ultimo={i === rounds.length - 1}
                />
              ))}
            </BreakdownLista>
          )}

          {/* Keyframes inyectados via useEffect (ver bloque arriba del componente).
              <style jsx global> rompe el ESLint config de Vercel. */}
        </div>
      </div>
    </Portal>
  )
}
