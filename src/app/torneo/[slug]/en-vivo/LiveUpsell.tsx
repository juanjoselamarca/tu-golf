import { UpsellPage } from '@/components/billing/UpsellPage'

/**
 * Upsell de /en-vivo. Única fuente: lo usan el gate server-side (page.tsx) y
 * la defensa en profundidad client-side (ProGate en LiveView).
 * `loginNext` sólo se pasa sin sesión: ruta de vuelta para "¿Ya tienes PRO? Entrar".
 */
export function LiveUpsell({ loginNext }: { loginNext?: string } = {}) {
  return (
    <UpsellPage
      feature="leaderboard-live"
      title="Leaderboard en vivo"
      description="Scores en tiempo real durante el torneo con actualizaciones automáticas"
      loginNext={loginNext}
    />
  )
}
