import type { Metadata } from 'next'
import './marketing.css'
import Hero from './components/Hero'
import Game from './components/Game'
import CoachSteps from './components/CoachSteps'
import Compete from './components/Compete'
import Features from './components/Features'
import Plans from './components/Plans'
import FinalCta from './components/FinalCta'
import RevealObserver from './components/RevealObserver'

/**
 * Landing v2 (preview). Se construye y valida acá ANTES de swapear a `/`.
 * No indexable mientras está en preview. El Navbar global queda encima.
 * Pendiente: mini-juego interactivo "Pega tu tiro" (Fase 5).
 */
export const metadata: Metadata = {
  title: 'Golfers+ — Se gana con la mente',
  robots: { index: false, follow: false },
}

export default function HomeV2() {
  return (
    <div className="home-mkt">
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
