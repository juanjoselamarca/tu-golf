import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Iniciar sesion — Golfers+',
  description: 'Inicia sesion en Golfers+ para acceder a tu scoring, estadisticas y coach IA de golf.',
  openGraph: {
    title: 'Iniciar sesion — Golfers+',
    description: 'Accede a tu cuenta de Golfers+.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
