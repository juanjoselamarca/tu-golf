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
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{
          fontSize: '28px',
          fontWeight: 700,
          fontFamily: '"Playfair Display", serif',
          color: 'var(--text)',
          marginBottom: '8px',
        }}>
          tAIger+
        </div>
        <p style={{ color: 'var(--text-2)', fontSize: '14px' }}>
          Tu coach de rendimiento con inteligencia artificial
        </p>
      </div>
      <UpsellCard
        feature="coach-plan"
        title="Coach tAIger+"
        description="Analisis de patrones, plan de mejora personalizado, indice mental y mas. Desbloquea tu coach de rendimiento."
      />
    </div>
  )
}
