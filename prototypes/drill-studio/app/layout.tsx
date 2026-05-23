import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Drill Studio · Golfers+',
  description: 'Prototipo localhost — no se deploya. Cada plan del coach con su animación 3D editorial.',
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
