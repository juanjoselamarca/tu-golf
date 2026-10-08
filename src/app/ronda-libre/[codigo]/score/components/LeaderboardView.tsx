'use client'

import MiniLeaderboard from '@/components/MiniLeaderboard'
import GWILeaderboard from '@/components/GWILeaderboard'
import { hayGWIParaMostrar, hoyosJugadosGWI } from '@/golf/stats/gwi'
import type { GwiDelScorer } from '../hooks/useGwiLeaderboard'
import type { HoleData, ModoJuego, FormatoJuego } from '@/types/ronda'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface LeaderboardViewProps {
  codigo: string
  parMap: Record<number, number>
  currentUserId: string | null
  totalHoles: number
  modoJuego: ModoJuego
  formatoJuego: FormatoJuego
  playerHcp: Record<string, number>
  holeDataMap: Record<number, HoleData>
  hoyos: readonly number[]
  gwi: GwiDelScorer
  theme: ScorerTheme
  /** Golpes locales de los jugadores anotados en este teléfono: se ven al instante. */
  scoresLocales: Record<string, Record<number, number>>
}

/** Vista "Leaderboard" del scorer (multi-jugador): en cancha + GWI. Vuelve sola a los 10s. */
export function LeaderboardView({
  codigo, parMap, currentUserId, totalHoles, modoJuego, formatoJuego, playerHcp, holeDataMap, hoyos, gwi, theme, scoresLocales,
}: LeaderboardViewProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>
        En cancha
      </div>
      <MiniLeaderboard
        codigoRonda={codigo}
        parMap={parMap}
        currentUserId={currentUserId}
        totalHoles={totalHoles}
        modoJuego={modoJuego}
        formatoJuego={formatoJuego}
        hcpMap={playerHcp}
        siMap={Object.fromEntries(Object.entries(holeDataMap).map(([k, v]) => [k, v.stroke_index]))}
        hoyos={hoyos}
        scoresLocales={scoresLocales}
      />
      {/* GWI — same as spectator view */}
      {hayGWIParaMostrar(gwi.jugadores) && (
        <div style={{ marginTop: '12px' }}>
          <GWILeaderboard
            results={gwi.results}
            hoyosRestantes={totalHoles - hoyosJugadosGWI(gwi.jugadores)}
            totalHoyos={totalHoles}
            modoJuego={modoJuego}
          />
        </div>
      )}
      <div style={{ fontSize: '9px', color: theme.textFaint, textAlign: 'center', marginTop: '8px' }}>
        Vuelve a Scorecard en 10s
      </div>
    </div>
  )
}
