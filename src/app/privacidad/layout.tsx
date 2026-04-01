import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politica de privacidad — Golfers+',
  description: 'Politica de privacidad y manejo de datos personales de Golfers+.',
  openGraph: {
    title: 'Politica de privacidad — Golfers+',
    description: 'Politica de privacidad de Golfers+.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function PrivacidadLayout({ children }: { children: React.ReactNode }) {
  return children
}
