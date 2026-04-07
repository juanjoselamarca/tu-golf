import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recuperar contraseña — Golfers+',
  description: 'Recupera el acceso a tu cuenta de Golfers+. Te enviaremos un enlace para crear una nueva contraseña.',
}

export default function RecuperarLayout({ children }: { children: React.ReactNode }) {
  return children
}
