import Link from 'next/link'
import { redirect } from 'next/navigation'
import HeroSection  from '@/components/HeroSection'
import StatsSection from '@/components/StatsSection'
import { createClient } from '@/utils/supabase/server'

const STEPS = [
  {
    num:   '01',
    icon:  '🏆',
    title: 'Crea tu torneo en 2 minutos',
    desc:  'Nombre, cancha, categorías y jugadores. Sin papel ni complicaciones.',
  },
  {
    num:   '02',
    icon:  '📱',
    title: 'Cada jugador marca en su celular',
    desc:  'Score hoyo a hoyo desde cualquier celular. Sin descargar nada.',
  },
  {
    num:   '03',
    icon:  '📊',
    title: 'Leaderboard en vivo para todos',
    desc:  'Posiciones en tiempo real. Comparte el link y todos siguen el torneo.',
  },
]

export default async function Home() {
  const supabase = await createClient()

  // Redirect logged-in users to dashboard
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  // Stats are now hardcoded in StatsSection (no DB query needed)

  return (
    <div>
      {/* ── Hero ──────────────────────────────────────── */}
      <HeroSection />

      {/* Demo link */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          href="/demo"
          style={{
            display: 'block',
            background: 'rgba(196,153,42,0.06)',
            border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '16px',
            padding: '16px',
            textDecoration: 'none',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#c4992a', background: 'rgba(196,153,42,0.15)', padding: '3px 10px', borderRadius: '10px', fontWeight: 600, letterSpacing: '0.08em' }}>
              ✦ VER DEMO EN VIVO
            </span>
          </div>
          <h2 className="font-display font-bold text-xl text-ivory mb-2">
            Explora un perfil completo de Golfers+
          </h2>
          <p className="font-sans text-sm text-gray-soft mb-4">
            30 rondas reales, GWI™ calculado, análisis de patrones. Sin crear cuenta.
          </p>
          <span style={{ color: '#c4992a', fontSize: '14px', fontWeight: 600 }}>
            Ver perfil demo →
          </span>
        </Link>
      </section>

      {/* ── Stats ─────────────────────────────────────── */}
      <StatsSection />

      {/* ── Cómo funciona ─────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-28">

        <div className="text-center mb-8 md:mb-20">
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl text-ivory mb-4">
            Tan simple como jugar golf
          </h2>
          <p className="font-sans text-gray-soft text-base md:text-lg">
            De la configuración al leaderboard en minutos
          </p>
        </div>

        <div className="relative grid md:grid-cols-3 gap-x-12 gap-y-10 md:gap-y-16">

          {/* Horizontal connector line (desktop) */}
          <div
            className="hidden md:block absolute"
            style={{
              top:        '44px',
              left:       '12%',
              right:      '12%',
              height:     '1px',
              background: 'linear-gradient(to right, transparent, rgba(196,153,42,0.35) 20%, rgba(196,153,42,0.35) 80%, transparent)',
            }}
          />

          {STEPS.map((s) => (
            <div key={s.num} className="relative flex flex-col">

              {/* Watermark number + icon */}
              <div className="relative mb-5 h-14 md:h-20 flex items-start">
                <span
                  className="font-display font-black text-[60px] md:text-[90px] leading-none select-none"
                  style={{ color: 'rgba(196,153,42,0.14)', lineHeight: 1 }}
                >
                  {s.num}
                </span>
                <span
                  className="absolute top-1 left-1 text-xl"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(196,153,42,0.5))' }}
                >
                  {s.icon}
                </span>
              </div>

              <h3 className="font-display font-bold text-xl text-ivory mb-3">
                {s.title}
              </h3>
              <p className="font-sans text-sm text-gray-soft leading-relaxed">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────── */}
      <section className="bg-bg-card">
        <div className="gold-divider" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-24 text-center">
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl text-ivory mb-6">
            Empieza a jugar diferente
          </h2>
          <p className="font-sans text-gray-soft text-base md:text-lg mb-10">
            Únete gratis. Sin tarjeta. Sin descargas. Tu primer torneo listo en menos de 2 minutos.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 font-sans font-bold text-lg px-12 py-4 transition-all duration-200 hover:brightness-110 active:scale-95"
            style={{ background: '#c4992a', color: '#070d18', borderRadius: '10px' }}
          >
            Crear cuenta gratis
          </Link>
        </div>
        <div className="gold-divider" />
      </section>
    </div>
  )
}
