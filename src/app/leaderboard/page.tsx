/* eslint-disable @next/next/no-img-element */
import LeaderboardTable from '@/components/LeaderboardTable'
import { PLAYERS } from '@/lib/golf-data'

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-bg-deep">

      {/* Tournament Header */}
      <div className="relative overflow-hidden" style={{ height: 'clamp(160px, 20vw, 220px)' }}>
        <img
          src="https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1920&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(7,13,24,0.38) 0%, rgba(7,13,24,0.90) 100%)' }} />

        <div className="relative h-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center gap-2 py-6">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-sans font-semibold text-sm" style={{ color: '#c4992a' }}>
              <span className="w-2 h-2 rounded-full bg-gold live-dot inline-block" />
              EN VIVO
            </span>
            <span className="font-sans text-xs text-gray-soft">Última actualización: hace 30s</span>
          </div>
          <h1 className="font-display font-bold text-ivory" style={{ fontSize: 'clamp(22px, 3.5vw, 40px)', lineHeight: 1.1 }}>
            TPC Sawgrass Amateur 2025
          </h1>
          <p className="font-sans text-sm text-gray-soft">
            📅 12–14 Mar 2025 &nbsp;·&nbsp; 🏌️ Ronda 1 de 3 &nbsp;·&nbsp; Par 72 &nbsp;·&nbsp; TPC Sawgrass
          </p>
        </div>
      </div>
      <div className="gold-divider" />

      {/* Table */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
        <LeaderboardTable players={PLAYERS} />
      </div>

    </div>
  )
}
