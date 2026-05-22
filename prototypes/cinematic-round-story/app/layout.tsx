import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cinematic Round Story · prototype',
  description: 'Prototipo localhost — no se deploya. Validar el WOW con golfistas reales antes de migrar a la app principal.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-ink-900 text-bone-100 overflow-hidden">
        {children}
      </body>
    </html>
  )
}
