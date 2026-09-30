import { UpsellPage } from '@/components/billing/UpsellPage'

/**
 * Upsell de /en-vivo. Única fuente: lo usan el gate server-side (page.tsx) y
 * la defensa en profundidad client-side (ProGate en LiveView).
 */
export function LiveUpsell() {
  return (
    <UpsellPage
      feature="leaderboard-live"
      title="Leaderboard en vivo"
      description="Scores en tiempo real durante el torneo con actualizaciones automáticas"
    />
  )
}
