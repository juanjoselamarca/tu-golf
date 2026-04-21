import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ranking — Golfers+',
  description: 'Top 50 jugadores por Índice Golfers+',
}

export default function RankingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
