import { UpsellPage } from '@/components/billing/UpsellPage'

/**
 * Salida de los upsells del torneo (/en-vivo y /tv) a su versión gratis: el leaderboard del torneo. Quien no es PRO
 * llega acá por la pestaña «En Vivo» del torneo o por el link que comparte el organizador; sin esta salida quedaba
 * en un callejón (solo «Conocer PRO»).
 */
export function volverAlTorneo(slug: string) {
  return { href: `/torneo/${encodeURIComponent(slug)}`, label: 'Ver el leaderboard del torneo' }
}

/**
 * Upsell de /en-vivo. Única fuente: lo usan el gate server-side (page.tsx) y
 * la defensa en profundidad client-side (ProGate en LiveView).
 * `loginNext` sólo se pasa sin sesión: ruta de vuelta para "¿Ya tienes PRO? Entrar".
 */
export function LiveUpsell({ slug, loginNext }: { slug: string; loginNext?: string }) {
  return (
    <UpsellPage
      feature="leaderboard-live"
      title="Leaderboard en vivo"
      description="Scores en tiempo real durante el torneo con actualizaciones automáticas"
      loginNext={loginNext}
      volver={volverAlTorneo(slug)}
    />
  )
}
