'use client'

/**
 * Drill Studio — landing page del prototipo.
 *
 * Render order: Canvas 3D al fondo (z=0), Overlay editorial encima (z>0).
 * R3F debe ser dynamic import (ssr:false) para evitar hydration mismatch.
 */
import dynamic from 'next/dynamic'
import DrillOverlay from '@/components/DrillOverlay'
import { PUTTING_15M_DRILL } from '@/lib/sample-drill'

const DrillScene = dynamic(() => import('@/components/DrillScene'), { ssr: false })

export default function Page() {
  return (
    <main className="relative w-screen h-screen bg-ink-900 overflow-hidden">
      <DrillScene />
      <DrillOverlay drill={PUTTING_15M_DRILL} />
    </main>
  )
}
