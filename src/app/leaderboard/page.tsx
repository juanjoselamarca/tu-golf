/* eslint-disable @next/next/no-img-element */
import LeaderboardTable from '@/components/LeaderboardTable'
import { PLAYERS } from '@/lib/golf-data'

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-bg-deep">
      <div className="relative overflow-hidden" style={{ minHeight: 'clamp(240px, 34vw, 320px)' }}>
        <img
          src="https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1920&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(8,18,15,0.28) 0%, rgba(8,18,15,0.82) 62%, rgba(8,18,15,0.96) 100%)' }}
        />

        <div className="relative h-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center gap-3 py-8 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-sans font-semibold text-sm" style={{ color: '#c8a55a' }}>
              <span className="w-2 h-2 rounded-full bg-gold live-dot inline-block" />
              EN VIVO
            </span>
            <span className="font-sans text-xs text-gray-soft">Actualizacion automatica cada 30s</span>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'rgba(200,165,90,0.12)', border: '1px solid rgba(200,165,90,0.24)' }}>
            <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#9fb4aa' }}>
              Broadcast demo
            </span>
          </div>

          <h1 className="font-display font-bold text-ivory" style={{ fontSize: 'clamp(24px, 4vw, 42px)', lineHeight: 1.05 }}>
            TPC Sawgrass Amateur 2025
          </h1>

          <p className="font-sans text-sm text-gray-soft max-w-2xl">
            Sigue el tablero como una transmision deportiva: posicion, score, hoyo actual y tarjetas expandibles con lectura rapida desde movil o desktop.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
            {[
              { label: 'Cancha', value: 'TPC Sawgrass' },
              { label: 'Ronda', value: '1 de 3' },
              { label: 'Par', value: '72' },
              { label: 'Campo', value: '10 jugadores' },
            ].map((item) => (
              <div
                key={item.label}
                className="glass-card rounded-xl px-3 py-3"
                style={{ background: 'rgba(13,27,23,0.76)' }}
              >
                <div className="font-sans text-[11px] uppercase tracking-[0.12em]" style={{ color: '#9fb4aa' }}>
                  {item.label}
                </div>
                <div className="font-sans text-sm font-semibold text-ivory mt-1">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="gold-divider" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-7">
        <LeaderboardTable players={PLAYERS} />
      </div>
    </div>
  )
}
