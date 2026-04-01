import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Leaderboard — Golfers+',
  description: 'Sigue el leaderboard en vivo de torneos y rondas de golf amateur. Resultados en tiempo real.',
  openGraph: {
    title: 'Leaderboard — Golfers+',
    description: 'Leaderboard en vivo de torneos y rondas de golf amateur.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
