import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Rondas en vivo — Golfers+',
  description: 'Ve todas las rondas de golf en curso ahora mismo. Scoring en tiempo real con leaderboard interactivo.',
  openGraph: {
    title: 'Rondas en vivo — Golfers+',
    description: 'Rondas de golf en curso con scoring en tiempo real.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function EnVivoLayout({ children }: { children: React.ReactNode }) {
  return children
}
