'use client'

import { UpsellCard } from '@/components/billing/UpsellCard'

/**
 * Pantalla de upsell para el coach cuando el usuario no tiene plan PRO.
 * Se muestra ANTES del gate de beta (hasCoachAccess). Si no tiene el plan,
 * ni siquiera llega al gate de acceso por codigo.
 */
export function CoachUpsellPage() {
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 100px' }}>
      {/* `full`: la tarjeta ES el título de la página (antes un header aparte
          repetía "tAIger+" encima de "Coach tAIger+"). */}
      <UpsellCard
        feature="coach-plan"
        variant="full"
        title="Coach tAIger+"
        description="Análisis de patrones, plan de mejora personalizado, índice mental y más. Desbloquea tu coach de rendimiento."
      />
    </div>
  )
}
