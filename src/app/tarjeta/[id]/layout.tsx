import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { loadTarjetaOgData } from '@/lib/data/tarjeta-og'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()

  const data = await loadTarjetaOgData(id, supabase)
  if (!data) {
    return { title: 'Tarjeta de golf — Golfers+' }
  }

  const { playerName, gross, holesPlayed, courseName, vsParLabel } = data

  return {
    title: `${playerName} jugó ${gross} (${vsParLabel}) en ${courseName} — Golfers+`,
    description: `${holesPlayed} hoyos en ${courseName}. Mira la tarjeta completa en Golfers+.`,
    openGraph: {
      title: `${playerName} jugó ${gross} (${vsParLabel}) en ${courseName}`,
      description: `${holesPlayed} hoyos · ${courseName} · Golfers+`,
      type: 'website',
      siteName: 'Golfers+',
    },
  }
}

export default function TarjetaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
