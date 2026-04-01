import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Índices de golf — Golfers+',
  description: 'Consulta y calcula tu índice de golf (handicap). Sistema WHS con datos actualizados.',
  openGraph: {
    title: 'Índices de golf — Golfers+',
    description: 'Consulta y calcula tu índice de golf (handicap).',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function IndicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
