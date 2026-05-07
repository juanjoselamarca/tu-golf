import Link from 'next/link'
import { Smartphone, TrendingUp, Trophy } from '@/components/icons'
import { TaigerIcon } from '@/components/icons/TaigerIcon'
import HeroSection  from '@/components/HeroSection'
import StatsSection from '@/components/StatsSection'

const FEATURES = [
  {
    icon:  <Smartphone size={24} />,
    title: 'Scoring en tiempo real',
    desc:  'Tu score, visible para todos. Al instante.',
    href:  '/demo',
    cta:   'Ver demo',
  },
  {
    icon:  <TrendingUp size={24} />,
    title: 'Tu indice, completo',
    desc:  'El handicap oficial mas tu rendimiento real en cancha.',
    href:  '/indices',
    cta:   'Cómo funciona',
  },
  {
    icon:  <TaigerIcon size={24} />,
    title: 'Tu coach personal',
    desc:  'Analiza tus patrones y te dice donde estan tus golpes.',
    href:  '/register',
    cta:   'Probar gratis',
  },
]

const STEPS = [
  {
    icon:  <Trophy size={24} />,
    title: 'Crea la competencia',
    desc:  'Nombre, cancha, categorías y jugadores. Sin papel ni complicaciones.',
  },
  {
    icon:  <Smartphone size={24} />,
    title: 'Cada jugador marca en su celular',
    desc:  'Score hoyo a hoyo desde cualquier celular. Sin descargar nada.',
  },
  {
    icon:  <TrendingUp size={24} />,
    title: 'Ranking en vivo para todos',
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
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl mb-4" style={{ color: 'var(--text)' }}>
            Todo para mejorar tu juego
          </h2>
          <p className="font-sans text-base md:text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-2)' }}>
            Tres herramientas diseñadas para el golfista amateur que quiere jugar mejor
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl p-6 md:p-8 transition-all duration-300 hover:scale-[1.02]"
              style={{
                backgroundColor: '#0e1c2f',
                backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.02), rgba(0,0,0,0.05))',
                border: '1px solid rgba(196,153,42,0.18)',
              }}
            >
              <span className="mb-4 flex items-center text-gold">{f.icon}</span>
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
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl mb-4" style={{ color: 'var(--text)' }}>
            Mucho más fácil que jugar golf
          </h2>
          <p className="font-sans text-base md:text-lg" style={{ color: 'var(--text-2)' }}>
            Configura tu ronda y empieza a jugar en segundos
          </p>
        </div>

        <div className="relative grid md:grid-cols-3 gap-x-12 gap-y-10 md:gap-y-16">

          {/* Horizontal connector line (desktop) */}
          <div
            className="hidden md:block absolute"
            style={{
              top:        '28px',
              left:       '12%',
              right:      '12%',
              height:     '1px',
              background: 'linear-gradient(to right, transparent, rgba(196,153,42,0.35) 20%, rgba(196,153,42,0.35) 80%, transparent)',
            }}
          />

          {STEPS.map((s) => (
            <div key={s.title} className="relative flex flex-col">

              {/* Icon only — the vertical order of the cards already communicates sequence */}
              <div className="relative mb-5 flex items-center">
                <span
                  className="flex items-center justify-center text-gold rounded-full"
                  style={{
                    width:      '56px',
                    height:     '56px',
                    background: 'rgba(14,28,47,0.9)',
                    border:     '1px solid rgba(196,153,42,0.35)',
                    filter:     'drop-shadow(0 0 6px rgba(196,153,42,0.3))',
                  }}
                >
                  {s.icon}
                </span>
              </div>

              <h3 className="font-display font-bold text-xl mb-3" style={{ color: 'var(--text)' }}>
                {s.title}
              </h3>
              <p className="font-sans text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Golf Intelligence Labs (theme-aware) ──────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <Link
          href="/indices"
          className="labs-card block rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.005] group"
        >
          <div className="grid md:grid-cols-5 gap-8 md:gap-10 p-8 md:p-12 items-center">
            {/* ── Left: copy + CTA ──────────────────── */}
            <div className="md:col-span-3 flex flex-col">
              <span
                className="labs-pill inline-flex items-center gap-2 px-3.5 py-1.5 mb-5 self-start text-[11px] font-mono font-bold uppercase tracking-[0.22em] rounded-full"
              >
                <span className="w-2 h-2 rounded-full live-dot labs-pill-dot" />
                Golfers+ Labs
              </span>
              <h2
                className="font-display font-bold text-3xl md:text-4xl mb-4"
                style={{ color: 'var(--text)', lineHeight: 1.1 }}
              >
                La ciencia detrás de tu juego
              </h2>
              <p
                className="font-sans text-base md:text-lg mb-7 max-w-xl"
                style={{ color: 'var(--text-2)', lineHeight: 1.55 }}
              >
                Tu hándicap oficial cuenta una historia.{' '}
                <strong className="labs-strong">El Índice Dual</strong>{' '}
                revela cuántos strokes están ocultos en tu juego real — y cuáles son.
              </p>
              <span
                className="inline-flex items-center gap-2 self-start px-6 py-3 font-sans font-bold text-sm md:text-base rounded-lg transition-all duration-200 group-hover:gap-3.5 shadow-lg"
                style={{ backgroundColor: '#c4992a', color: '#0e1c2f' }}
              >
                Explorar el laboratorio
                <span style={{ fontSize: '1.05em' }}>→</span>
              </span>
            </div>

            {/* ── Right: Indice Dual viz ──────────── */}
            <div className="md:col-span-2">
              <div className="labs-viz relative rounded-xl p-5 md:p-6">
                {/* Sparkline header */}
                <div className="flex items-end justify-between mb-5">
                  <span
                    className="text-[10px] font-mono uppercase tracking-[0.18em]"
                    style={{ color: 'var(--text-2)' }}
                  >
                    Evolución · 8 rondas
                  </span>
                  <svg width="84" height="22" viewBox="0 0 84 22" aria-hidden="true">
                    <defs>
                      <linearGradient id="labsSpark" x1="0" x2="1">
                        <stop offset="0%" stopColor="var(--text-3)" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="#c4992a" />
                      </linearGradient>
                    </defs>
                    <polyline
                      points="0,16 12,14 24,17 36,11 48,12 60,7 72,5 82,3"
                      fill="none"
                      stroke="url(#labsSpark)"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <circle cx="82" cy="3" r="2.4" fill="#c4992a" />
                  </svg>
                </div>

                {/* Indice oficial */}
                <div className="mb-4">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span
                      className="text-[10px] font-mono uppercase tracking-[0.18em]"
                      style={{ color: 'var(--text-2)' }}
                    >
                      Índice oficial
                    </span>
                    <span
                      className="font-mono text-xl font-bold"
                      style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}
                    >
                      14.5
                    </span>
                  </div>
                  <div className="labs-bar-track h-1.5 rounded-full overflow-hidden">
                    <div
                      className="labs-bar-official h-full rounded-full"
                      style={{ width: '72%' }}
                    />
                  </div>
                </div>

                {/* Indice Golfers+ Dual */}
                <div className="mb-4">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span
                      className="text-[10px] font-mono uppercase tracking-[0.18em] labs-strong"
                    >
                      Índice Dual
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="font-mono text-xl font-bold labs-strong"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        12.8
                      </span>
                      <span
                        className="font-mono text-[10px] font-semibold labs-delta"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        −1.7
                      </span>
                    </div>
                  </div>
                  <div className="labs-bar-track h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: '64%',
                        background: 'linear-gradient(90deg, #c4992a 0%, #e8b94a 100%)',
                      }}
                    />
                  </div>
                </div>

                {/* Caption */}
                <p
                  className="labs-caption text-[11px] font-sans pt-3"
                  style={{ color: 'var(--text-2)', lineHeight: 1.5 }}
                >
                  <span className="labs-strong" style={{ fontWeight: 600 }}>1.7 strokes</span>{' '}
                  que el sistema oficial no ve.
                </p>
              </div>
            </div>
          </div>
        </Link>
      </section>

      {/* ── CTA ───────────────────────────────────────── */}
      <section style={{ background: 'var(--bg-surface)' }}>
        <div className="gold-divider" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-24 text-center">
          <h2
            className="font-display font-bold text-3xl md:text-4xl lg:text-5xl mb-6"
            style={{ color: 'var(--text)' }}
          >
            Empieza a jugar diferente
          </h2>
          <p
            className="font-sans text-base md:text-lg mb-8"
            style={{ color: 'var(--text-2)' }}
          >
            Únete gratis y empieza a entender tu juego hoy.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 font-sans font-bold text-lg px-12 py-4 transition-all duration-200 hover:brightness-110 active:scale-95 shadow-lg"
              style={{ background: '#c4992a', color: '#0e1c2f', borderRadius: '10px' }}
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
          <p
            className="font-sans text-xs tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            Sin tarjeta &middot; Sin descarga &middot; En español
          </p>
        </div>
        <div className="gold-divider" />
      </section>
    </div>
  )
}
