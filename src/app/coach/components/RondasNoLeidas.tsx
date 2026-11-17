'use client'

import { useRouter } from 'next/navigation'
import { ErrorState } from '@/components/ui/ErrorState'

/**
 * Falló la lectura de rondas de /coach: se dice y se ofrece reintentar (44px).
 * Nunca la bienvenida de "aún no tienes rondas" — el jugador sí las tiene.
 */
export function RondasNoLeidas() {
  const router = useRouter()
  return <ErrorState message="No pudimos leer tus rondas" onRetry={() => router.refresh()} />
}
