'use client'

import { useState, type ReactNode } from 'react'

type TabKey = 'competencia' | 'identidad'

type Props = {
  competencia: ReactNode
  identidad: ReactNode
  hasIdentidadBadge?: boolean
}

export function MiGolfTabs({ competencia, identidad, hasIdentidadBadge = false }: Props) {
  const [active, setActive] = useState<TabKey>('competencia')

  return (
    <>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '24px',
          borderBottom: '1px solid #e5e5e5',
          position: 'sticky',
          top: 0,
          background: '#ffffff',
          zIndex: 10,
          padding: '12px 16px 0',
          maxWidth: '640px',
          margin: '0 auto',
        }}
      >
        <TabButton
          label="Competencia"
          isActive={active === 'competencia'}
          onClick={() => setActive('competencia')}
        />
        <TabButton
          label="Identidad"
          isActive={active === 'identidad'}
          onClick={() => setActive('identidad')}
          badge={hasIdentidadBadge}
        />
      </div>

      <div role="tabpanel" aria-hidden={active !== 'competencia'} style={{ display: active === 'competencia' ? 'block' : 'none' }}>
        {competencia}
      </div>
      <div role="tabpanel" aria-hidden={active !== 'identidad'} style={{ display: active === 'identidad' ? 'block' : 'none' }}>
        {identidad}
      </div>
    </>
  )
}

function TabButton({
  label,
  isActive,
  onClick,
  badge,
}: {
  label: string
  isActive: boolean
  onClick: () => void
  badge?: boolean
}) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'transparent',
        border: 'none',
        padding: '8px 0 10px',
        fontSize: '15px',
        fontWeight: isActive ? 700 : 500,
        color: isActive ? '#1a1a1a' : '#888',
        cursor: 'pointer',
        borderBottom: isActive ? '2px solid #c4992a' : '2px solid transparent',
        transition: 'color 120ms ease, border-color 120ms ease',
      }}
    >
      {label}
      {badge && (
        <span
          data-testid="identidad-badge"
          style={{
            position: 'absolute',
            top: '6px',
            right: '-10px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#c4992a',
          }}
        />
      )}
    </button>
  )
}
