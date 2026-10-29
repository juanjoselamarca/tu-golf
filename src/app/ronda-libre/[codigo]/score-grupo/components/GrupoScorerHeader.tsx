'use client'

import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface GrupoScorerHeaderProps {
  currentHole: number
  modoLabel: string
  courseName: string
  anotadorNombre: string
  maxThru: number
  totalHoles: number
  onExit: () => void
  theme: ScorerTheme
}

/** Header 48px del scorer de grupo (con identidad del anotador) + barra de progreso. */
export function GrupoScorerHeader({ currentHole, modoLabel, courseName, anotadorNombre, maxThru, totalHoles, onExit, theme }: GrupoScorerHeaderProps) {
  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', height: '48px', flexShrink: 0,
        borderBottom: `1px solid ${theme.border}`,
        background: theme.headerBg,
      }}>
        <button onClick={onExit} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: theme.textMuted, fontSize: '14px',
          padding: '8px', minWidth: '44px', minHeight: '44px',
          display: 'flex', alignItems: 'center',
        }}>
          {'←'}
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace', fontSize: '13px', fontWeight: 600, color: theme.gold, letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
              HOYO {currentHole}
            </div>
            <span style={{
              fontSize: '9px', fontWeight: 600, letterSpacing: '0.05em',
              padding: '2px 8px', borderRadius: '10px',
              background: 'rgba(196,153,42,0.15)', color: theme.gold,
              border: '1px solid rgba(196,153,42,0.25)',
              textTransform: 'uppercase' as const,
            }}>
              {modoLabel}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: theme.textFaint, marginTop: '1px' }}>
            {courseName}
            {anotadorNombre && (
              <>
                {' · '}
                {/* Lápiz en SVG de línea fina, no el emoji ✏️: el emoji se
                    pinta con el color del sistema (amarillo infantil en
                    Android, otro en iOS) y rompe el dorado del header. */}
                <span
                  style={{ color: theme.gold, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  // El label pisa el contenido del span: sin el nombre, el
                  // lector de pantalla decía que hay un anotador y nunca quién.
                  aria-label={`Anotador de la ronda: ${anotadorNombre}`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  {anotadorNombre}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: '60px' }}>
          <div style={{ fontSize: '10px', color: theme.textFaint, letterSpacing: '0.04em' }}>THRU</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.gold }}>{maxThru}/{totalHoles}</div>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'var(--border)', flexShrink: 0 }}>
        <div style={{ height: '3px', background: theme.gold, width: `${(maxThru / totalHoles) * 100}%`, transition: 'width 0.3s ease' }} />
      </div>
    </>
  )
}
