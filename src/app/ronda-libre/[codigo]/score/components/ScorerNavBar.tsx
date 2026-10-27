'use client'

import type { ScorerTheme } from '@/components/ronda/scorer-theme'
import { textoConfirmarFinalizar } from '@/components/ronda/finalizar-copy'

interface ScorerNavBarProps {
  currentHoleIdx: number
  isLastHole: boolean
  canFinalize: boolean
  confirmFinalize: boolean
  /** Finalizar en curso: el botón dice "Finalizando..." y ningún botón acepta toques
   *  (Siguiente auto-llena el par y guarda: saldría después de que Finalizar leyó la tarjeta). */
  finalizando: boolean
  missingCount: number
  holesPlayed: number
  totalHoles: number
  onPrev: () => void
  onNext: () => void
  onFinalize: () => void
  theme: ScorerTheme
}

/** Barra inferior: Anterior / Siguiente / Finalizar (secundario desde el 9, primario en el último). */
export function ScorerNavBar({
  currentHoleIdx, isLastHole, canFinalize, confirmFinalize, finalizando, missingCount, holesPlayed, totalHoles,
  onPrev, onNext, onFinalize, theme,
}: ScorerNavBarProps) {
  return (
    <div style={{
      flexShrink: 0, background: theme.navBg,
      borderTop: `1px solid ${theme.border}`,
      padding: '8px 16px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
      display: 'flex', gap: '8px',
    }}>
      {currentHoleIdx > 0 && (
        <button
          onTouchStart={() => {}}
          onClick={onPrev}
          disabled={finalizando}
          aria-label="Hoyo anterior"
          style={{
            flex: 1, padding: '14px', minHeight: '48px', background: 'transparent',
            color: theme.textMuted, border: `1px solid var(--border)`,
            borderRadius: '12px', fontSize: '14px', fontWeight: 400,
            cursor: finalizando ? 'wait' : 'pointer', opacity: finalizando ? 0.5 : 1, WebkitTapHighlightColor: 'transparent',
          }}
        >{'←'} Anterior</button>
      )}
      {/* Primary button: Siguiente or Finalizar (on last hole) */}
      {!isLastHole && (
        <button
          onTouchStart={() => {}}
          onClick={onNext}
          disabled={finalizando}
          aria-label="Siguiente hoyo"
          style={{
            flex: 2, padding: '14px', minHeight: '48px',
            background: 'var(--brand)', color: 'var(--brand-dark)',
            border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            cursor: finalizando ? 'wait' : 'pointer', opacity: finalizando ? 0.5 : 1, WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation', letterSpacing: '0.01em',
          }}
        >Siguiente {'→'}</button>
      )}
      {/* Finalize button: secondary from hole 9, primary on last hole */}
      {canFinalize && (
        <button
          onTouchStart={() => {}}
          onClick={onFinalize}
          disabled={finalizando}
          aria-busy={finalizando}
          aria-label={finalizando ? 'Finalizando ronda' : confirmFinalize ? 'Confirmar finalizacion' : 'Finalizar ronda'}
          style={{
            flex: isLastHole ? 2 : 1, padding: isLastHole ? '14px' : '12px',
            background: confirmFinalize ? '#d97706' : isLastHole ? 'var(--brand)' : 'transparent',
            color: confirmFinalize || isLastHole ? 'var(--brand-dark)' : 'var(--brand-on-bg)',
            border: isLastHole ? 'none' : '1px solid rgba(196,153,42,0.4)',
            borderRadius: '12px',
            fontSize: isLastHole ? '16px' : '13px',
            fontWeight: isLastHole ? 600 : 500,
            cursor: finalizando ? 'wait' : 'pointer', opacity: finalizando ? 0.7 : 1,
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation', letterSpacing: '0.01em',
            transition: 'background 0.3s ease',
          }}
        >{finalizando
            ? 'Finalizando...'
            : confirmFinalize
            ? textoConfirmarFinalizar({ missingCount, holesPlayed, totalHoles, completa: 'Confirmar finalizacion' })
            : 'Finalizar ronda ✓'}</button>
      )}
    </div>
  )
}
