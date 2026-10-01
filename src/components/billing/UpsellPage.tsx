import type { Feature } from '@/golf/billing/plans'
import { UpsellCard } from './UpsellCard'

interface UpsellPageProps {
  feature: Feature
  title: string
  description: string
  /** Ruta de vuelta tras iniciar sesión; sólo cuando no hay sesión (ver UpsellCard). */
  loginNext?: string
}

/**
 * Pantalla completa de upsell: para rutas donde el upsell es la única acción
 * (coach, progreso, en vivo, modo TV). La tarjeta `full` ES el título de la
 * página; no se agrega otro header encima.
 */
export function UpsellPage({ feature, title, description, loginNext }: UpsellPageProps) {
  return (
    <div style={{ maxWidth: '600px', width: '100%', margin: '0 auto', padding: '24px 16px 100px' }}>
      <UpsellCard feature={feature} variant="full" title={title} description={description} loginNext={loginNext} />
    </div>
  )
}
