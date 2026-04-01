import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politica de reembolsos — Golfers+',
  description: 'Politica de reembolsos y cancelaciones de Golfers+.',
  openGraph: {
    title: 'Politica de reembolsos — Golfers+',
    description: 'Politica de reembolsos de Golfers+.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function ReembolsosLayout({ children }: { children: React.ReactNode }) {
  return children
}
