import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Crear cuenta — Golfers+',
  description: 'Registrate gratis en Golfers+ y accede a scoring en vivo, leaderboard, estadisticas y coach IA de golf.',
  openGraph: {
    title: 'Crear cuenta — Golfers+',
    description: 'Registrate gratis en Golfers+. Scoring en vivo y coach IA.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
