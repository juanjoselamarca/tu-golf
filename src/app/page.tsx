import Link from 'next/link'
import HeroSection  from '@/components/HeroSection'
import StatsSection from '@/components/StatsSection'

const FEATURES = [
  {
    icon:  '📱',
    title: 'Live Scoring',
    desc:  'Registra score hoyo a hoyo desde tu celular. Leaderboard en tiempo real para que todos sigan la ronda.',
    href:  '/demo',
    cta:   'Ver demo',
  },
  {
    icon:  '📊',
    title: 'Índice Dual',
    desc:  'Tu índice oficial + tu rendimiento real calculado por Golfers+. Sabes exactamente dónde estás y hacia dónde vas.',
    href:  '/indices',
    cta:   'Cómo funciona',
  },
  {
    icon:  '🤖',
    title: 'tAIger+',
    desc:  'Coach IA que conoce tu juego y te dice exactamente qué practicar. Análisis de patrones y plan de mejora personalizado.',
    href:  '/register',
    cta:   'Probar gratis',
  },
]

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

export default function Home() {
  return (
    <div>
      {/* ── Hero ──────────────────────────────────────── */}
      <HeroSection />

      {/* ── Stats (social proof) ──────────────────────── */}
      <StatsSection />

      {/* ── Feature highlights ────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center mb-10 md:mb-16">
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl text-ivory mb-4">
            Todo para mejorar tu juego
          </h2>
          <p className="font-sans text-gray-soft text-base md:text-lg max-w-2xl mx-auto">
            Tres herramientas diseñadas para el golfista amateur que quiere jugar mejor
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl p-6 md:p-8 transition-all duration-300 hover:scale-[1.02]"
              style={{
                background: 'rgba(14,28,47,0.7)',
                border: '1px solid rgba(196,153,42,0.12)',
              }}
            >
              <span className="text-3xl mb-4 block">{f.icon}</span>
              <h3 className="font-display font-bold text-xl text-ivory mb-3">
                {f.title}
              </h3>
              <p className="font-sans text-sm text-gray-soft leading-relaxed mb-6">
                {f.desc}
              </p>
              <Link
                href={f.href}
                className="inline-flex items-center font-sans text-sm font-semibold transition-colors duration-200"
                style={{ color: '#c4992a' }}
              >
                {f.cta} <span className="ml-1 group-hover:translate-x-1 transition-transform duration-200">&rarr;</span>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Cómo funciona ─────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-28">

        <div className="text-center mb-8 md:mb-20">
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl text-ivory mb-4">
            Mucho más fácil que jugar golf
          </h2>
          <p className="font-sans text-gray-soft text-base md:text-lg">
            Configura tu ronda y empieza a jugar en segundos
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

      {/* ── Golf Intelligence Labs ────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <Link
          href="/indices"
          className="block rounded-2xl p-6 md:p-10 transition-all duration-300 hover:scale-[1.01]"
          style={{
            background: 'linear-gradient(135deg, rgba(14,28,47,0.8), rgba(14,28,47,0.5))',
            border: '1px solid rgba(196,153,42,0.2)',
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <span
                className="inline-flex items-center gap-2 px-3 py-1 mb-4 text-[10px] font-mono font-bold uppercase tracking-widest rounded-full"
                style={{ background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.25)', color: '#c4992a' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                LABS
              </span>
              <h2 className="font-display font-bold text-2xl md:text-3xl text-ivory mb-2">
                La ciencia detrás de tu juego
              </h2>
              <p className="font-sans text-sm md:text-base text-gray-soft max-w-lg">
                Descubre cómo funciona el Índice Dual de Golfers+ y por qué es más útil que el hándicap tradicional para mejorar.
              </p>
            </div>
            <span
              className="font-sans font-semibold text-sm md:text-base whitespace-nowrap"
              style={{ color: '#c4992a' }}
            >
              Explorar &rarr;
            </span>
          </div>
        </Link>
      </section>

      {/* ── CTA ───────────────────────────────────────── */}
      <section className="bg-bg-card">
        <div className="gold-divider" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-24 text-center">
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl text-ivory mb-6">
            Empieza a jugar diferente
          </h2>
          <p className="font-sans text-gray-soft text-base md:text-lg mb-8">
            Únete gratis y empieza a entender tu juego hoy.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 font-sans font-bold text-lg px-12 py-4 transition-all duration-200 hover:brightness-110 active:scale-95 shadow-lg"
              style={{ background: '#c4992a', color: '#070d18', borderRadius: '10px' }}
            >
              Crear cuenta gratis
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 font-sans font-semibold text-base px-8 py-4 transition-all duration-200 hover:bg-gold/10 active:scale-95"
              style={{ border: '1px solid #c4992a', color: '#c4992a', borderRadius: '10px' }}
            >
              Ver demo
            </Link>
          </div>
          <p className="font-sans text-xs text-ivory/40 tracking-wide">
            Sin tarjeta &middot; Sin descarga &middot; En español
          </p>
        </div>
        <div className="gold-divider" />
      </section>
    </div>
  )
}
