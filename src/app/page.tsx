import type { Metadata } from 'next'
import '@/components/home/marketing.css'
import { clashDisplay, satoshi } from '@/components/home/fonts'
import Hero from '@/components/home/Hero'
import Game from '@/components/home/Game'
import CoachSteps from '@/components/home/CoachSteps'
import Compete from '@/components/home/Compete'
import Features from '@/components/home/Features'
import Plans from '@/components/home/Plans'
import FinalCta from '@/components/home/FinalCta'
import RevealObserver from '@/components/home/RevealObserver'

/**
 * Home pública de Golfers+ — "Se gana con la mente".
 * Estática (sin fetch en servidor): el HTML se cachea en edge. El widget PGA
 * (PgaBroadcast) y el mini-juego se hidratan en el cliente; si el feed PGA cae,
 * el widget no se renderiza (CERO FALLOS — la home queda perfecta igual).
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://golfersplus.vercel.app'),
  title: 'Golfers+ — Se gana con la mente',
  description:
    'Anota tus rondas, sigue los torneos en vivo y entrena tu juego con un coach que te muestra dónde mejorar. El golf, pensado en serio. +180 canchas en LatAm.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    siteName: 'Golfers+',
    title: 'Golfers+ — Se gana con la mente',
    description:
      'Anota tus rondas, sigue los torneos en vivo y entrena tu juego con un coach que te muestra dónde mejorar.',
    images: [{ url: '/home/og.jpg', width: 1200, height: 630, alt: 'Golfers+' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Golfers+ — Se gana con la mente',
    description:
      'Anota tus rondas, sigue los torneos en vivo y entrena tu juego con un coach que te muestra dónde mejorar.',
    images: ['/home/og.jpg'],
  },
}

export default function Home() {
  return (
    <div className={`home-mkt ${clashDisplay.variable} ${satoshi.variable}`}>
      {/* CERO FALLOS: sin JS el RevealObserver no corre y las secciones .rv
          quedarían en opacity:0. El @media (scripting:none) lo borra el
          minificador de CSS, así que el override va inline en <noscript>
          (lo permite style-src 'unsafe-inline'; no pasa por el bundler). */}
      <noscript>
        <style
          dangerouslySetInnerHTML={{
            __html: '.home-mkt .rv{opacity:1 !important;transform:none !important}',
          }}
        />
      </noscript>
      <Hero />
      <Game />
      <CoachSteps />
      <Compete />
      <Features />
      <FinalCta />
      <Plans />
      <RevealObserver />
    </div>
  )
}
