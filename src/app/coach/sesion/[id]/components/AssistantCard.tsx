'use client'

import { PlanAssignedCard, type AssignedPlan } from '@/components/coach/PlanAssignedCard'
import { RoundMiniChart, type RoundSummary } from '@/components/coach/RoundMiniChart'
import { ScoreProjectionCard, type ScoreProjection } from '@/components/coach/ScoreProjectionCard'

/** Heurística para decidir si el mensaje justifica el mini-chart de ronda. */
export function shouldRenderChart(text: string): boolean {
  if (!text || text.length < 30) return false
  return /\bhoyos?\b|\bback nine\b|\bfront nine\b|\bh\d+\b|\bida\b|\bvuelta\b|primeros 9|últimos 9|ultimos 9/i.test(text)
}

interface AssistantCardsProps {
  content: string
  round?: RoundSummary
  projection?: ScoreProjection
  plan?: AssignedPlan
  onChangeFocus: () => void
}

/**
 * Cards de datos ancladas a un mensaje assistant: mini-chart de ronda,
 * proyección de score y plan asignado. Render idéntico al original
 * (page.tsx:536-555) — mismas condiciones, mismo layout (width:100%,
 * paddingLeft:40 para alinear bajo el avatar).
 */
export function AssistantCards({ content, round, projection, plan, onChangeFocus }: AssistantCardsProps) {
  return (
    <>
      {round && shouldRenderChart(content) && (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', paddingLeft: 40 }}>
          <RoundMiniChart summary={round} />
        </div>
      )}
      {projection && (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', paddingLeft: 40 }}>
          <ScoreProjectionCard projection={projection} />
        </div>
      )}
      {plan && (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', paddingLeft: 40 }}>
          <PlanAssignedCard plan={plan} onChangeFocus={onChangeFocus} />
        </div>
      )}
    </>
  )
}
