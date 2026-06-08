import type { Metadata } from 'next'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
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

// ISR — contadores reales cacheados en edge, refresco horario (igual que `/`).
// Cliente anon directo (NO el SSR client con cookies(), que forzaría dynamic
// rendering y rompería el ISR).
export const revalidate = 3600

/**
 * Conteo real de canchas para la proofbar del CTA: canchas root activas
 * (sin sufijos DAMAS/VARONES). Si Supabase falla devolvemos 0 y FinalCta
 * oculta el ítem en vez de mostrar "0 canchas" (CERO FALLOS de credibilidad).
 */
async function getCourseCount(): Promise<number> {
  try {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    )
    const { count } = await supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('activa', true)
      .is('parent_id', null)
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function HomeV2() {
  const courses = await getCourseCount()
  return (
    <div className="home-mkt">
      <Hero />
      <Game />
      <CoachSteps />
      <Compete />
      <Features />
      <Plans />
      <FinalCta courses={courses} />
      <RevealObserver />
    </div>
  )
}
