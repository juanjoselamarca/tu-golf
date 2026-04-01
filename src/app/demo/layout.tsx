import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Demo interactiva — Golfers+',
  description: 'Prueba el scoring en vivo de Golfers+ sin registrarte. Explora el leaderboard, scorecard y todas las funciones.',
  openGraph: {
    title: 'Demo interactiva — Golfers+',
    description: 'Prueba el scoring en vivo de Golfers+ sin registrarte.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children
}
