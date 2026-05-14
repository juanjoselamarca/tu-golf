'use client'

// src/app/organizador/nuevo/sections/CategoriasSection.tsx
//
// Sección "Categorías": lista editable inline.
// Edita config.categories.

import type { TournamentConfig, CategoryConfig } from '@/lib/draft/types'

export interface CategoriasSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

function newCategory(): CategoryConfig {
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Nueva categoría',
    handicap_min: null,
    handicap_max: null,
    gender: null,
    default_tee_color: '',
  }
}

export function CategoriasSection({ config, applyChange }: CategoriasSectionProps) {
  const cats = config.categories ?? []

  const updateAt = (idx: number, patch: Partial<CategoryConfig>) => {
    const next = cats.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    applyChange({ categories: next })
  }

  const removeAt = (idx: number) => {
    applyChange({ categories: cats.filter((_, i) => i !== idx) })
  }

  const addCategory = () => {
    applyChange({ categories: [...cats, newCategory()] })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Categorías</h2>

      {cats.length === 0 && (
        <p style={emptyStyle}>
          Sin categorías. Agregá al menos una (ej. Damas, Caballeros, Senior).
        </p>
      )}

      <div style={listStyle}>
        {cats.map((cat, idx) => (
          <div key={cat.id} style={rowStyle}>
            <div style={rowGridStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor={`cat-name-${cat.id}`}>Nombre</label>
                <input
                  id={`cat-name-${cat.id}`}
                  type="text"
                  style={inputStyle}
                  value={cat.name}
                  onChange={(e) => updateAt(idx, { name: e.target.value })}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor={`cat-hmin-${cat.id}`}>HCP min</label>
                <input
                  id={`cat-hmin-${cat.id}`}
                  type="number"
                  step="0.1"
                  style={inputStyle}
                  value={cat.handicap_min ?? ''}
                  onChange={(e) =>
                    updateAt(idx, {
                      handicap_min: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor={`cat-hmax-${cat.id}`}>HCP max</label>
                <input
                  id={`cat-hmax-${cat.id}`}
                  type="number"
                  step="0.1"
                  style={inputStyle}
                  value={cat.handicap_max ?? ''}
                  onChange={(e) =>
                    updateAt(idx, {
                      handicap_max: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor={`cat-gender-${cat.id}`}>Género</label>
                <select
                  id={`cat-gender-${cat.id}`}
                  style={inputStyle}
                  value={cat.gender ?? ''}
                  onChange={(e) =>
                    updateAt(idx, {
                      gender: (e.target.value || null) as CategoryConfig['gender'],
                    })
                  }
                >
                  <option value="">— sin definir —</option>
                  <option value="male">Caballeros</option>
                  <option value="female">Damas</option>
                  <option value="mixed">Mixto</option>
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor={`cat-tee-${cat.id}`}>Tee por defecto</label>
                <input
                  id={`cat-tee-${cat.id}`}
                  type="text"
                  placeholder="ej. Amarillas"
                  style={inputStyle}
                  value={cat.default_tee_color ?? ''}
                  onChange={(e) => updateAt(idx, { default_tee_color: e.target.value })}
                />
              </div>
            </div>

            <button
              type="button"
              style={removeBtnStyle}
              onClick={() => removeAt(idx)}
              aria-label={`Eliminar categoría ${cat.name}`}
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>

      <button type="button" style={addBtnStyle} onClick={addCategory}>
        + Agregar categoría
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
