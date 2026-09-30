import { UpsellPage } from '@/components/billing/UpsellPage'

/**
 * Upsell del modo TV. Única fuente: lo usan el gate server-side (page.tsx) y
 * la defensa en profundidad client-side (ProGate en TVBoard).
 */
export function TvUpsell() {
  return (
    <UpsellPage
      feature="tournament-tv"
      title="Modo TV"
      description="Leaderboard en pantalla grande con auto-actualización cada 30 segundos"
    />
  )
}
