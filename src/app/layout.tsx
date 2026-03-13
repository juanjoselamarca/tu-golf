import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import { ToastContainer } from '@/hooks/useToast'

const playfair = Playfair_Display({
  subsets:  ['latin'],
  weight:   ['700', '900'],
  variable: '--font-playfair',
  display:  'swap',
})

const dmSans = DM_Sans({
  subsets:  ['latin'],
  weight:   ['400', '500', '600'],
  variable: '--font-dm-sans',
  display:  'swap',
})

export const metadata: Metadata = {
  title: 'Tu Golf — Live Scoring para Torneos Amateur',
  description:
    'Plataforma de live scoring para torneos amateur de golf. Organiza, juega y sigue tus torneos en tiempo real.',
  keywords: ['golf', 'torneo', 'live scoring', 'amateur', 'puntaje'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${playfair.variable} ${dmSans.variable}`}>
      <body>
        <Navbar />
        <ToastContainer />
        <main className="min-h-screen">{children}</main>

        {/* Footer */}
        <footer className="bg-bg-deep pt-1">
          <div className="gold-divider" />
          <div className="py-10 text-center">
            <p className="font-display text-xl mb-2">
              <span className="text-ivory">Tu</span>
              <span className="text-gold"> Golf</span>
            </p>
            <p className="text-gray-soft text-sm font-sans">
              © {new Date().getFullYear()} Tu Golf · Hecho para el golf amateur
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
