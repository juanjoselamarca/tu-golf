'use client'

// src/app/organizador/nuevo/sections/PremiosSection.tsx
//
// Sección "Premios": lista editable de config.prizes.

import type { TournamentConfig, PrizeConfig } from '@/lib/draft/types'

export interface PremiosSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

function newPrize(): PrizeConfig {
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `pz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'category_position',
    description: 'Nuevo premio',
    position: 1,
  }
}

const TYPE_LABELS: Record<PrizeConfig['type'], string> = {
  category_position: 'Posición en categoría',
  closest_to_pin: 'Más cerca del banderín',
  long_drive: 'Drive más largo',
  special: 'Especial',
}

export function PremiosSection({ config, applyChange }: PremiosSectionProps) {
  const prizes = config.prizes ?? []
  const categories = config.categories ?? []

  const updateAt = (idx: number, patch: Partial<PrizeConfig>) => {
    const next = prizes.map((p, i) => (i === idx ? { ...p, ...patch } : p))
    applyChange({ prizes: next })
  }

  const removeAt = (idx: number) => {
    applyChange({ prizes: prizes.filter((_, i) => i !== idx) })
  }

  const addPrize = () => {
    applyChange({ prizes: [...prizes, newPrize()] })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Premios</h2>

      {prizes.length === 0 && (
        <p style={emptyStyle}>
          Sin premios definidos. Podés agregar premios por categoría, closest-to-pin, long drive o especiales.
        </p>
      )}

      <div style={listStyle}>
        {prizes.map((prize, idx) => (
          <div key={prize.id} style={rowStyle}>
            <div style={rowGridStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor={`pz-type-${prize.id}`}>Tipo</label>
                <select
                  id={`pz-type-${prize.id}`}
                  style={inputStyle}
                  value={prize.type}
                  onChange={(e) => {
                    const newType = e.target.value as PrizeConfig['type']
                    // Limpiamos campos que no aplican al nuevo tipo
                    const patch: Partial<PrizeConfig> = { type: newType }
                    if (newType !== 'category_position') {
                      patch.position = undefined
                      patch.category_id = undefined
                    }
                    if (newType !== 'closest_to_pin' && newType !== 'long_drive') {
                      patch.hole_number = undefined
                    }
                    updateAt(idx, patch)
                  }}
                >
                  {(Object.keys(TYPE_LABELS) as Array<PrizeConfig['type']>).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ ...fieldStyle, gridColumn: 'span 2' }}>
                <label style={labelStyle} htmlFor={`pz-desc-${prize.id}`}>Descripción</label>
                <input
                  id={`pz-desc-${prize.id}`}
                  type="text"
                  style={inputStyle}
                  value={prize.description}
                  onChange={(e) => updateAt(idx, { description: e.target.value })}
                />
              </div>

              {prize.type === 'category_position' && (
                <>
                  <div style={fieldStyle}>
                    <label style={labelStyle} htmlFor={`pz-pos-${prize.id}`}>Posición</label>
                    <input
                      id={`pz-pos-${prize.id}`}
                      type="number"
                      min={1}
                      step={1}
                      style={inputStyle}
                      value={prize.position ?? 1}
                      onChange={(e) =>
                        updateAt(idx, {
                          position: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle} htmlFor={`pz-cat-${prize.id}`}>Categoría</label>
                    <select
                      id={`pz-cat-${prize.id}`}
                      style={inputStyle}
                      value={prize.category_id ?? ''}
                      onChange={(e) =>
                        updateAt(idx, { category_id: e.target.value || undefined })
                      }
                    >
                      <option value="">— cualquiera —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {(prize.type === 'closest_to_pin' || prize.type === 'long_drive') && (
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor={`pz-hole-${prize.id}`}>Hoyo N°</label>
                  <input
                    id={`pz-hole-${prize.id}`}
                    type="number"
                    min={1}
                    max={18}
                    step={1}
                    style={inputStyle}
                    value={prize.hole_number ?? ''}
                    onChange={(e) =>
                      updateAt(idx, {
                        hole_number: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              style={removeBtnStyle}
              onClick={() => removeAt(idx)}
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>

      <button type="button" style={addBtnStyle} onClick={addPrize}>
        + Agregar premio
      </button>
    </section>
  )
}

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
  padding: 20,
  fontFamily: '"DM Sans", sans-serif',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text-primary, #111827)',
}

const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontStyle: 'italic',
  color: 'var(--text-secondary, #4b5563)',
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
}

const rowGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 10,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary, #4b5563)',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #111827)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 13,
  outline: 'none',
}

const removeBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-end',
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'transparent',
  color: 'var(--text-secondary, #4b5563)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 12,
  cursor: 'pointer',
}

const addBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px dashed var(--brand-gold, #c4992a)',
  background: 'transparent',
  color: 'var(--brand-gold, #c4992a)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}
