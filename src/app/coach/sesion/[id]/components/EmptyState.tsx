'use client'

import { TaigerIcon } from '@/components/icons/TaigerIcon'
import { PlanActiveCard } from '@/components/coach/PlanActiveCard'
import { SuggestionChips } from './SuggestionChips'
import type { ActivePlanSummary } from '@/golf/coach/intro'

interface EmptyStateProps {
  opener: string
  /** Preguntas sugeridas (chips de arranque). Tocar una la envía al coach. */
  chips?: string[]
  onChip?: (question: string) => void
  /** Plan activo (D3): se muestra como "Tu plan activo" bajo el opener. null = no hay. */
  activePlan?: ActivePlanSummary | null
}

/**
 * Estado vacío: burbuja del opener proactivo del coach + chips de arranque
 * (preguntas sugeridas que arrancan el chat de un toque). Los chips van bajo la
 * burbuja, alineados a ella; tocar uno lo envía como mensaje del usuario.
 */
export function EmptyState({ opener, chips, onChip, activePlan }: EmptyStateProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          gap: 8,
        }}
      >
        <div style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'rgba(196,153,42,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
          marginTop: 2,
        }}>
          <TaigerIcon size={18} />
        </div>
        <div
          className="taiger-md"
          style={{
            maxWidth: '80%',
            padding: '12px 16px',
            borderRadius: '14px 14px 14px 4px',
            background: 'var(--bg-surface)',
            color: 'var(--text)',
            fontSize: 14,
            lineHeight: 1.6,
            wordBreak: 'break-word',
          }}
          data-testid="taiger-opener"
        >
          {opener}
        </div>
      </div>

      {activePlan && (
        <div style={{ marginTop: 16 }} data-testid="taiger-active-plan">
          <div style={{
            fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)',
            fontWeight: 600, fontFamily: '"DM Mono", monospace', marginLeft: 40, marginBottom: 8,
          }}>
            Tu plan activo
          </div>
          <PlanActiveCard
            title={activePlan.title}
            description={activePlan.description}
            status={activePlan.status}
            dots={activePlan.dots}
            correlationLine={
              activePlan.total > 0 ? (
                <>
                  Aplicas el plan en{' '}
                  <span style={{ color: 'var(--coach-recovery-high)', fontWeight: 600, fontFamily: '"DM Mono", monospace' }}>{activePlan.appliedPct}%</span>{' '}
                  de las últimas <b style={{ color: 'var(--text)', fontWeight: 600 }}>{activePlan.total}</b> rondas con plan activo.
                </>
              ) : (
                <>Aún no registras rondas con este plan. La próxima cuenta.</>
              )
            }
          />
        </div>
      )}

      {chips && onChip && (
        <SuggestionChips
          items={chips}
          onPick={onChip}
          ariaLabel="Preguntas sugeridas"
          containerStyle={{ marginTop: 12, marginLeft: 40 }}
        />
      )}
    </div>
  )
}
