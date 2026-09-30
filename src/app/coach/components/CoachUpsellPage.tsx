'use client'

import { UpsellPage } from '@/components/billing/UpsellPage'

/**
 * Pantalla de upsell para el coach cuando el usuario no tiene plan PRO.
 * Se muestra ANTES del gate de beta (hasCoachAccess). Si no tiene el plan,
 * ni siquiera llega al gate de acceso por codigo.
 */
export function CoachUpsellPage() {
  return (
    // `full` (vía UpsellPage): la tarjeta ES el título de la página (antes un
    // header aparte repetía "tAIger+" encima de "Coach tAIger+").
    <UpsellPage
      feature="coach-plan"
      title="Coach tAIger+"
      description="Análisis de patrones, plan de mejora personalizado, índice mental y más. Desbloquea tu coach de rendimiento."
    />
  )
}
