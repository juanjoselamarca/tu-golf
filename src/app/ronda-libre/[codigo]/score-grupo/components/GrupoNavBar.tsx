'use client'

import { textoConfirmarFinalizar } from '@/components/ronda/finalizar-copy'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface GrupoNavBarProps {
  currentHoleIdx: number
  isLastHole: boolean
  canFinalize: boolean
  confirmFinalize: boolean
  finalizing: boolean
  totalMissingScores: number
  maxThru: number
  totalHoles: number
  onPrev: () => void
  onNext: () => void
  onFinalize: () => void
  theme: ScorerTheme
}

/** Barra inferior del scorer de grupo: Anterior / Siguiente / Finalizar. */
export function GrupoNavBar({
  currentHoleIdx, isLastHole, canFinalize, confirmFinalize, finalizing, totalMissingScores, maxThru, totalHoles,
  onPrev, onNext, onFinalize, theme,
}: GrupoNavBarProps) {
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
          style={{
            flex: 1, padding: '14px', background: 'transparent',
            color: theme.textMuted, border: '1px solid #e2e8f0',
            borderRadius: '12px', fontSize: '14px', fontWeight: 400,
            cursor: 'pointer', minHeight: '48px',
          }}
        >
          {'←'} Anterior
        </button>
      )}
      {/* Primary: Siguiente (hidden on last hole) */}
      {!isLastHole && (
        <button
          onClick={onNext}
          style={{
            flex: 2, padding: '14px',
            background: theme.gold, color: '#ffffff',
            border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            cursor: 'pointer', minHeight: '48px',
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
          disabled={finalizing}
          style={{
            flex: isLastHole ? 2 : 1, padding: isLastHole ? '14px' : '12px',
            background: finalizing ? '#9ca3af' : confirmFinalize ? '#d97706' : isLastHole ? theme.gold : 'transparent',
            color: finalizing ? '#ffffff' : confirmFinalize ? '#ffffff' : isLastHole ? '#ffffff' : theme.gold,
            border: isLastHole ? 'none' : `1px solid rgba(196,153,42,0.4)`,
            borderRadius: '12px',
            fontSize: isLastHole ? '16px' : '13px',
            fontWeight: isLastHole ? 600 : 500,
            cursor: finalizing ? 'not-allowed' : 'pointer', minHeight: '48px',
            touchAction: 'manipulation', letterSpacing: '0.01em',
            transition: 'background 0.2s ease',
            opacity: finalizing ? 0.7 : 1,
          }}
        >
          {finalizing
            ? 'Finalizando...'
            : confirmFinalize
              ? textoConfirmarFinalizar({ missingCount: totalMissingScores, holesPlayed: maxThru, totalHoles, completa: '¿Finalizar ronda?' })
              : 'Finalizar ronda ✓'}
        </button>
      )}
    </div>
  )
}
