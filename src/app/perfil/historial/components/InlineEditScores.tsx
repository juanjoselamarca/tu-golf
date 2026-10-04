/**
 * Edición inline de scores hoyo-a-hoyo. Aparece dentro de la card expandida
 * cuando el usuario hace click en "Editar" desde el botón inferior del scorecard.
 *
 * Para edición desde el menú "..." (Editar) la navegación va a
 * /perfil/historial/{id}?edit=1, que renderiza un EditMode separado en
 * la página detalle (full screen).
 */
'use client'

import { useEffect, useState } from 'react'
import { formatOv } from '../lib/helpers'
import { GOLPES_MAX_POR_HOYO, GOLPES_MIN_POR_HOYO } from '@/golf/ronda-libre/golpes-por-hoyo'

interface Props {
  initialScores: (number | null)[]
  /** Número real de cada posición (`metadata.hoyos`): una ronda de 9 desde el 10 son 10..18. */
  hoyos?: readonly number[]
  /** Hoyos con score estimado por WHS (`metadata.estimados`): se marcan para que se sepa qué corregir. */
  estimados?: ReadonlyArray<{ hoyo: number }>
  saving:        boolean
  onSave:        (scores: (number | null)[]) => void
  onCancel:      () => void
}

export function InlineEditScores({ initialScores, hoyos, estimados, saving, onSave, onCancel }: Props) {
  // Tantas casillas como hoyos tiene la ronda (antes siempre 18: una de 9 podía crecer a 10+).
  // Filas viejas sin `metadata.hoyos`: si la tarjeta guardada trae 9 posiciones, es de 9.
  const n = hoyos?.length ?? (initialScores?.length > 0 && initialScores.length <= 9 ? initialScores.length : 18)
  const numeroDe = (i: number) => hoyos?.[i] ?? i + 1
  const esEstimado = new Set((estimados ?? []).map(e => e.hoyo))
  const [editScores, setEditScores] = useState<(number | null)[]>(() => {
    return [...(initialScores ?? [])].concat(Array(n).fill(null)).slice(0, n)
  })

  useEffect(() => {
    setEditScores([...(initialScores ?? [])].concat(Array(n).fill(null)).slice(0, n))
  }, [initialScores, n])

  const handleEditScore = (idx: number, value: string) => {
    const num = value === '' ? null : parseInt(value)
    setEditScores(prev => {
      const next = [...prev]
      next[idx] = (num != null && !isNaN(num) && num >= GOLPES_MIN_POR_HOYO && num <= GOLPES_MAX_POR_HOYO) ? num : null
      return next
    })
  }

  const filled = editScores.filter((s): s is number => s != null)
  const total  = filled.reduce((a, b) => a + b, 0)

  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }} onClick={(e) => e.stopPropagation()}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-3)' }}>Editar scores ({GOLPES_MIN_POR_HOYO}-{GOLPES_MAX_POR_HOYO})</div>
        {total > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
            Total: <strong style={{ color: 'var(--text)' }}>{total}</strong>{' '}
            <span style={{ color: 'var(--text-3)' }}>· {formatOv(total - (filled.length <= 9 ? 36 : 72))}</span>
          </div>
        )}
      </div>
      {(n > 9 ? [0, 9] : [0]).map(offset => (
        <div
          key={offset}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px', marginBottom: offset === 0 ? '6px' : '10px' }}
        >
          {Array.from({ length: Math.min(9, n - offset) }, (_, i) => (
            <div key={i + offset} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-3)', marginBottom: '2px' }}>{numeroDe(i + offset)}</div>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                aria-label={`Golpes del hoyo ${numeroDe(i + offset)}${esEstimado.has(numeroDe(i + offset)) ? ' (estimado)' : ''}`}
                value={editScores[i + offset] ?? ''}
                onChange={(e) => handleEditScore(i + offset, e.target.value)}
                style={{
                  width: '100%', textAlign: 'center',
                  fontSize: '14px', fontWeight: 600,
                  minHeight: '44px',
                  padding: '6px 0',
                  // Estimado: borde punteado (la marca es la forma, no sólo el color).
                  border: esEstimado.has(numeroDe(i + offset)) ? '1.5px dashed var(--brand-on-bg)' : '1px solid var(--border)',
                  borderRadius: '6px',
                  outline: 'none',
                  background: 'var(--bg-surface)',
                  color: 'var(--text)',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--brand-on-bg)'; e.target.select() }}
                onBlur={(e) => { e.target.style.borderColor = esEstimado.has(numeroDe(i + offset)) ? 'var(--brand-on-bg)' : 'var(--border)' }}
              />
            </div>
          ))}
        </div>
      ))}
      {esEstimado.size > 0 && (
        <p style={{ margin: '0 0 10px', fontSize: '12px', lineHeight: 1.4, color: 'var(--text-2)' }}>
          Borde punteado: hoyo estimado con la regla WHS. Si lo jugaste, anota tu score real.
        </p>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onSave(editScores) }}
          disabled={saving}
          style={{
            flex: 1, padding: '10px',
            background: 'var(--brand)',
            color: 'var(--brand-dark)',
            fontWeight: 700, fontSize: '14px',
            border: 'none', borderRadius: '8px',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onCancel() }}
          disabled={saving}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            color: 'var(--text-2)',
            fontWeight: 600, fontSize: '14px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
