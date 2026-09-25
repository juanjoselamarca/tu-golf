import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Iniciar sesión — Golfers+',
  description: 'Inicia sesión en Golfers+ para acceder a tu scoring, estadísticas y coach IA de golf.',
  openGraph: {
    title: 'Iniciar sesión — Golfers+',
    description: 'Accede a tu cuenta de Golfers+.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
