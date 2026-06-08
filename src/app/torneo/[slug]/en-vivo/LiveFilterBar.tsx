'use client'

// src/app/torneo/[slug]/en-vivo/LiveFilterBar.tsx
// Barra de filtros: categoria, grupo, "solo mi grupo", boton TV mode.

export interface LiveFilterBarProps {
  categories: Array<{ id: string; name: string }>
  groups: Array<{ id: string; name: string }>
  selectedCategory: string | null
  selectedGroup: string | null
  myViewEnabled: boolean
  canEnableMyView: boolean
  onCategoryChange: (cat: string | null) => void
  onGroupChange: (g: string | null) => void
  onMyViewToggle: (enabled: boolean) => void
  onTVMode: () => void
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-secondary, #6b7280)',
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
  color: 'var(--text-primary, #111827)',
  fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  minWidth: '160px',
  minHeight: '44px', // touch target accesible en mobile
}

const tvButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '8px',
  border: '1px solid var(--brand-gold, #c4992a)',
  background: 'var(--brand-gold, #c4992a)',
  // Texto OSCURO sobre el dorado (no blanco): blanco sobre #c4992a da ~2.4:1 y
  // falla WCAG AA; el navy de marca pasa holgado en ambos temas.
  color: 'var(--brand-dark, #070d18)',
  fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  minHeight: '44px', // touch target accesible en mobile
}

export default function LiveFilterBar({
  categories,
  groups,
  selectedCategory,
  selectedGroup,
  myViewEnabled,
  canEnableMyView,
  onCategoryChange,
  onGroupChange,
  onMyViewToggle,
  onTVMode,
}: LiveFilterBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--card-bg, #f9fafb)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: '12px',
        fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label htmlFor="live-cat-filter" style={labelStyle}>
          Categoría
        </label>
        <select
          id="live-cat-filter"
          style={selectStyle}
          value={selectedCategory ?? ''}
          onChange={(e) => onCategoryChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label htmlFor="live-group-filter" style={labelStyle}>
          Grupo
        </label>
        <select
          id="live-group-filter"
          style={selectStyle}
          value={selectedGroup ?? ''}
          onChange={(e) => onGroupChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">Todos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {canEnableMyView && (
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border, #e5e7eb)',
            background: myViewEnabled ? 'rgba(196, 153, 42, 0.12)' : 'transparent',
            color: 'var(--text-primary, #111827)',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            alignSelf: 'flex-end',
            minHeight: '44px', // touch target accesible en mobile
            boxSizing: 'border-box',
          }}
        >
          <input
            type="checkbox"
            checked={myViewEnabled}
            onChange={(e) => onMyViewToggle(e.target.checked)}
            style={{ accentColor: 'var(--brand-gold, #c4992a)' }}
          />
          Solo mi grupo
        </label>
      )}

      <div style={{ flex: 1 }} />

      <button type="button" style={tvButtonStyle} onClick={onTVMode}>
        TV mode
      </button>
    </div>
  )
}
