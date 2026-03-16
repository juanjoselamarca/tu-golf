import Link from 'next/link'
import HeroSection  from '@/components/HeroSection'
import StatsSection from '@/components/StatsSection'
import { createClient } from '@/utils/supabase/server'

const STEPS = [
  {
    num:   '01',
    icon:  '🏆',
    title: 'Crea tu torneo',
    desc:  'Configura nombre, cancha, categorías y jugadores en menos de 2 minutos.',
  },
  {
    num:   '02',
    icon:  '📱',
    title: 'Jugadores cargan su score',
    desc:  'Hoyo a hoyo desde el celular. Sin descargas, sin complicaciones.',
  },
  {
    num:   '03',
    icon:  '📊',
    title: 'Todos siguen en vivo',
    desc:  'Leaderboard actualizado en tiempo real. Comparte el link con quien quieras.',
  },
]

export default async function Home() {
  const supabase = await createClient()

  const [{ count: torneos }, { count: golfistas }] = await Promise.all([
    supabase.from('tournaments').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ])

  return (
    <div>
      {/* ── Hero ──────────────────────────────────────── */}
      <HeroSection />

      {/* ── Stats ─────────────────────────────────────── */}
      <StatsSection torneos={torneos ?? 0} golfistas={golfistas ?? 0} />

      {/* ── Cómo funciona ─────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28">

        <div className="text-center mb-20">
          <h2 className="font-display font-bold text-4xl lg:text-5xl text-ivory mb-4">
            Cómo funciona
          </h2>
          <p className="font-sans text-gray-soft text-lg">
            En 3 pasos tienes tu torneo en marcha
          </p>
        </div>

        <div className="relative grid md:grid-cols-3 gap-x-12 gap-y-16">

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
              <div className="relative mb-5 h-20 flex items-start">
                <span
                  className="font-display font-black text-[90px] leading-none select-none"
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h2 className="font-display font-bold text-4xl lg:text-5xl text-ivory mb-6">
            ¿Listo para tu próximo torneo?
          </h2>
          <p className="font-sans text-gray-soft text-lg mb-10">
            Crea tu cuenta gratis y organiza tu primer torneo en minutos.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 font-sans font-bold text-lg px-12 py-4 transition-all duration-200 hover:brightness-110 active:scale-95"
            style={{ background: '#c4992a', color: '#070d18', borderRadius: '4px' }}
          >
            Crear cuenta gratis
          </Link>
        </div>
        <div className="gold-divider" />
      </section>
    </div>
  )
}
