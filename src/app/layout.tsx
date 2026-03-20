import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans, DM_Mono, Cormorant_Garamond } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import { ToastContainer } from '@/hooks/useToast'
import { PWAInstallBanner } from '@/components/PWAInstallBanner'

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

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  variable: '--font-cormorant',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Golfers+ — Tu golf, potenciado por IA',
  description: 'La única plataforma en español que convierte los datos de tu golf en trabajo mental específico. Scoring en vivo, análisis estadístico y coaching IA.',
  keywords: ['golf', 'golfers plus', 'scoring golf', 'handicap', 'torneos amateur', 'coach golf IA', 'chile', 'tAIger'],
  // M13: PWA-ready
  applicationName: 'Golfers+',
  appleWebApp: {
    capable:         true,
    statusBarStyle:  'black-translucent',
    title:           'Golfers+',
  },
  formatDetection: { telephone: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${playfair.variable} ${dmSans.variable} ${dmMono.variable} ${cormorant.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#070d18" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <link rel="preload" as="image" href="https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1200&q=75" />
      </head>
      <body>
        <Navbar />
        <ToastContainer />
        <PWAInstallBanner />
        <main className="min-h-screen">{children}</main>

        {/* Footer */}
        <footer style={{ background: 'var(--bg-surface)', paddingTop: '1px' }}>
          <div style={{ height: '1px', background: 'var(--border)' }} />
          <div className="py-10 text-center">
            <p className="font-display text-xl mb-2">
              <span style={{ color: 'var(--text)' }}>Golfers</span>
              <span style={{ color: '#c4992a' }}>+</span>
            </p>
            <p style={{ color: 'var(--text-2)', fontSize: '14px' }}>
              © {new Date().getFullYear()} Golfers+ · Diseñado para el golf amateur en Latinoamérica
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
