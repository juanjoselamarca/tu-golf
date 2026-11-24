import { UpsellPage } from '@/components/billing/UpsellPage'
import { volverAlTorneo } from '../en-vivo/LiveUpsell'

/**
 * Upsell del modo TV. Única fuente: lo usan el gate server-side (page.tsx) y
 * la defensa en profundidad client-side (ProGate en TVBoard).
 * `loginNext` sólo se pasa sin sesión: ruta de vuelta para "¿Ya tienes PRO? Entrar".
 */
export function TvUpsell({ slug, loginNext }: { slug: string; loginNext?: string }) {
  return (
    <UpsellPage
      feature="tournament-tv"
      title="Modo TV"
      description="Leaderboard en pantalla grande con auto-actualización cada 30 segundos"
      loginNext={loginNext}
      volver={volverAlTorneo(slug)}
    />
  )
}
