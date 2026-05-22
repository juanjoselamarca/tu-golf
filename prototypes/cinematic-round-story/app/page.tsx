'use client'

/**
 * Prototipo Cinematic Round Story — UN hoyo de UNA ronda real ficticia.
 *
 * Objetivo de validación: mostrar este screen a 3-5 golfistas premium en
 * clubhouse y observar reacción primaria. Si dicen "WOW esto cambia el
 * juego" → seguimos a Fase 3 (migración a la app). Si no → iteramos
 * antes de quemar 6 semanas.
 */
import dynamic from 'next/dynamic'
import EditorialOverlay from '@/components/EditorialOverlay'
import { SAMPLE_ROUND } from '@/lib/sample-round'

// R3F debe ser client-only — evitamos hydration mismatch con SSR
const Hole3DScene = dynamic(() => import('@/components/Hole3DScene'), { ssr: false })

export default function Page() {
  return (
    <main className="relative w-screen h-screen bg-ink-900 overflow-hidden">
      <Hole3DScene />
      <EditorialOverlay story={SAMPLE_ROUND} />
    </main>
  )
}
