import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terminos y condiciones — Golfers+',
  description: 'Terminos y condiciones de uso de la plataforma Golfers+.',
  openGraph: {
    title: 'Terminos y condiciones — Golfers+',
    description: 'Terminos de uso de Golfers+.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function TerminosLayout({ children }: { children: React.ReactNode }) {
  return children
}
