import type { Metadata } from 'next'
import './marketing.css'
import Hero from './components/Hero'

/**
 * Landing v2 (preview). Se construye y valida acá ANTES de swapear a `/`.
 * No indexable mientras está en preview. El Navbar global queda encima.
 * Próximas fases: PGA broadcast, juego, coach, compete, features, planes, CTA.
 */
export const metadata: Metadata = {
  title: 'Golfers+ — Se gana con la mente',
  robots: { index: false, follow: false },
}

export default function HomeV2() {
  return (
    <div className="home-mkt">
      <Hero />
    </div>
  )
}
