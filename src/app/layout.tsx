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
  // M13: PWA-ready
  applicationName: 'Tu Golf',
  appleWebApp: {
    capable:         true,
    statusBarStyle:  'black-translucent',
    title:           'Tu Golf',
  },
  formatDetection: { telephone: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${playfair.variable} ${dmSans.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#070d18" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
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
