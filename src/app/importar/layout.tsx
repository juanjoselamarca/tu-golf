import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Importar ronda — Golfers+',
  description: 'Importa tus rondas de golf desde otras plataformas a Golfers+.',
}

export default function ImportarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#070d18',
        color: '#edeae4',
      }}
    >
      {children}
    </div>
  )
}
