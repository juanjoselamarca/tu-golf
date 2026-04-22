import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans, DM_Mono, Cormorant_Garamond } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import Navbar from '@/components/Navbar'
import { ToastContainer } from '@/hooks/useToast'
import { PWAInstallBanner } from '@/components/PWAInstallBanner'
import { LiveBadge } from '@/components/ui/LiveBadge'
import { SystemStatusBanner } from '@/components/SystemStatusBanner'
import { PostHogProvider } from '@/components/PostHogProvider'
import { OfflineBanner } from '@/components/OfflineBanner'
import { ThemeProvider } from '@/contexts/ThemeContext'
import dynamic from 'next/dynamic'
const FedegolfSync = dynamic(() => import('@/components/FedegolfSync'), { ssr: false })

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
  openGraph: {
    title: 'Golfers+ — Tu golf, potenciado por IA',
    description: 'Scoring en vivo, coach IA con psicologia deportiva y leaderboard interactivo. Gratis.',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Golfers+ — Tu golf, potenciado por IA',
    description: 'Scoring en vivo, coach IA y leaderboard interactivo.',
  },
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

        <link rel="preload" as="image" href="https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1200&q=75" />
      </head>
      <body>
        <ThemeProvider>
        <PostHogProvider>
        <OfflineBanner />
        <SystemStatusBanner />
        <Navbar />
        <ToastContainer />
        <PWAInstallBanner />
        {/* LiveBadge: pill inline bajo la topbar — NO renderiza si no hay ronda
            activa. Reemplaza LiveRoundIndicator (floating que pisaba 14 pantallas).
            Audit P1. */}
        <div className="live-bar flex justify-end px-3 pt-1" style={{ minHeight: 0 }}>
          <LiveBadge />
        </div>
        <FedegolfSync />
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
            <nav style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Link href="/terminos" style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}>
                Términos y Condiciones
              </Link>
              <Link href="/privacidad" style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}>
                Privacidad
              </Link>
              <Link href="/reembolsos" style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}>
                Reembolsos
              </Link>
            </nav>
          </div>
        </footer>
        </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
