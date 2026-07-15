import { LoadingScreen } from './components/EmptyStates'

/**
 * Fallback de streaming para /perfil/historial: el mismo spinner que la
 * versión client mostraba mientras verificaba auth. Con el page.tsx ahora
 * Server Component (fetch de rondas + stats server-side), Next lo pinta al
 * instante en la navegación y lo reemplaza cuando llega el HTML con datos —
 * paridad perceptual con el flujo anterior, sin waterfall.
 */
export default function Loading() {
  return <LoadingScreen />
}
