'use client'

// src/app/torneo/[slug]/en-vivo/LiveTabs.tsx
// Tabs por ronda: Acumulado | Ronda 1 | Ronda 2 | ...
// Si total_rounds === 1, no renderiza nada (no aporta UI).

export type LiveTabValue = 'cumulative' | number

export interface LiveTabsProps {
  totalRounds: number
  selected: LiveTabValue
  onChange: (value: LiveTabValue) => void
}

export default function LiveTabs({ totalRounds, selected, onChange }: LiveTabsProps) {
  if (totalRounds <= 1) return null

  const tabs: { key: string; label: string; value: LiveTabValue }[] = [
    { key: 'cumulative', label: 'Acumulado', value: 'cumulative' },
    ...Array.from({ length: totalRounds }, (_, i) => ({
      key: `round-${i + 1}`,
      label: `Ronda ${i + 1}`,
      value: i + 1 as LiveTabValue,
    })),
  ]

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    borderRadius: '10px',
    background: 'var(--bg, #fafaf7)',
    border: '1px solid var(--border, rgba(26,29,36,0.08))',
    fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
    overflowX: 'auto',
  }

  return (
    <nav role="tablist" aria-label="Vista por ronda" style={containerStyle}>
      {tabs.map((t) => {
        const isActive = t.value === selected
        const buttonStyle: React.CSSProperties = {
          flex: '0 0 auto',
          padding: '8px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: isActive ? 600 : 500,
          border: 'none',
          cursor: 'pointer',
          background: isActive ? 'var(--bg-surface, #ffffff)' : 'transparent',
          color: isActive ? 'var(--text, #1a1d24)' : 'var(--text-2, #5a6573)',
          boxShadow: isActive ? 'var(--shadow-sm, 0 1px 2px rgba(20,25,35,0.04))' : 'none',
          transition: 'background 120ms ease, color 120ms ease',
        }
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.value)}
            style={buttonStyle}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
