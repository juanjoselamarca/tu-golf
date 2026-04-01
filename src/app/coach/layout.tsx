import type { Metadata } from 'next'
import { CoachAuthGuard } from './CoachAuthGuard'

export const metadata: Metadata = {
  title: 'tAIger+ Coach IA — Golfers+',
  description: 'Coach de golf con inteligencia artificial y psicologia deportiva. Analiza tu juego y recibe recomendaciones personalizadas.',
  openGraph: {
    title: 'tAIger+ Coach IA — Golfers+',
    description: 'Coach de golf con IA y psicologia deportiva personalizada.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return <CoachAuthGuard>{children}</CoachAuthGuard>
}
