'use client'

import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface GrupoNavBarProps {
  currentHoleIdx: number
  isLastHole: boolean
  canFinalize: boolean
  finalizing: boolean
  /** Tarjeta congelada (`tarjetaCongelada`: finalizando, descartando o cambiando quién anota): Finalizar no responde. */
  congelada: boolean
  onPrev: () => void
  onNext: () => void
  onFinalize: () => void
  /**
   * Un celular por equipo: el botón de cerrar es «Terminar mi equipo» (cada celular cierra su tarjeta y la ronda se cierra
   * sola con el último), en el mismo lugar y tamaño que Finalizar.
   */
  terminaEquipo?: boolean
  theme: ScorerTheme
}

/** Barra inferior del scorer de grupo: Anterior / Siguiente / Finalizar (o «Terminar mi equipo», un celular por equipo). */
export function GrupoNavBar({
  currentHoleIdx, isLastHole, canFinalize, finalizing, congelada,
  onPrev, onNext, onFinalize, terminaEquipo = false, theme,
}: GrupoNavBarProps) {
  const finalizarInactivo = finalizing || congelada
  // Desde el hoyo 9 caben tres botones (Anterior · Siguiente · Finalizar): en 390 px los textos largos partían en dos
  // líneas (Juanjo, 26-nov). Con tres, Anterior queda solo con la flecha y Finalizar sin «ronda ✓» a la vista (el
  // nombre accesible sigue completo). Ningún botón parte su texto.
  const tresBotones = currentHoleIdx > 0 && !isLastHole && canFinalize
  return (
    <div style={{
      flexShrink: 0, background: theme.navBg,
      borderTop: `1px solid ${theme.border}`,
      padding: '8px 16px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
      display: 'flex', gap: '8px',
    }}>
      {currentHoleIdx > 0 && (
        <button
          onClick={onPrev}
          aria-label={tresBotones ? 'Anterior' : undefined}
          style={{
            flex: tresBotones ? '0 0 52px' : 1, padding: tresBotones ? '0' : '14px', background: 'transparent',
            color: theme.textMuted, border: '1px solid #e2e8f0',
            borderRadius: '12px', fontSize: tresBotones ? '18px' : '14px', fontWeight: 400,
            cursor: 'pointer', minHeight: '48px', whiteSpace: 'nowrap',
          }}
        >
          {tresBotones ? '←' : '← Anterior'}
        </button>
      )}
      {/* Primary: Siguiente (hidden on last hole) */}
      {!isLastHole && (
        <button
          onClick={onNext}
          style={{
            flex: 2, padding: '14px',
            background: theme.gold, color: 'var(--brand-dark)',
            border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            cursor: 'pointer', minHeight: '48px', whiteSpace: 'nowrap',
            touchAction: 'manipulation', letterSpacing: '0.01em',
          }}
        >
          Siguiente {'→'}
        </button>
      )}
      {/* Finalize: secondary from hole 9, primary on last hole */}
      {canFinalize && (
        <button
          onClick={onFinalize}
          disabled={finalizarInactivo}
          aria-label={finalizing ? undefined : terminaEquipo ? 'Terminar mi equipo' : 'Finalizar ronda'}
          style={{
            flex: isLastHole ? 2 : 1, padding: isLastHole ? '14px' : '12px',
            background: finalizing ? '#9ca3af' : isLastHole ? theme.gold : 'transparent',
            color: finalizing || isLastHole ? 'var(--brand-dark)' : 'var(--brand-on-bg)',
            border: isLastHole ? 'none' : `1px solid rgba(196,153,42,0.4)`,
            borderRadius: '12px',
            fontSize: isLastHole ? '16px' : '13px',
            fontWeight: isLastHole ? 600 : 500,
            cursor: finalizarInactivo ? 'not-allowed' : 'pointer', minHeight: '48px', whiteSpace: 'nowrap',
            touchAction: 'manipulation', letterSpacing: '0.01em',
            transition: 'background 0.2s ease',
            opacity: finalizarInactivo ? 0.7 : 1,
          }}
        >
          {terminaEquipo
            ? (finalizing ? 'Terminando…' : tresBotones ? 'Terminar' : 'Terminar mi equipo')
            : (finalizing ? 'Finalizando…' : tresBotones ? 'Finalizar' : 'Finalizar ronda ✓')}
        </button>
      )}
    </div>
  )
}
