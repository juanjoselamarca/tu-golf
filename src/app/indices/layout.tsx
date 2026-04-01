import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Indices de handicap — Golfers+',
  description: 'Consulta y calcula tu indice de handicap de golf. Sistema WHS con datos actualizados.',
  openGraph: {
    title: 'Indices de handicap — Golfers+',
    description: 'Consulta y calcula tu indice de handicap de golf.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function IndicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
