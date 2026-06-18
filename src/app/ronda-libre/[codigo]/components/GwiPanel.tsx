// Panel GWI (probabilidad de ganar en vivo) para formatos individuales. Verbatim del monolito.
import GWILeaderboard from '@/components/GWILeaderboard'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { RondaLibre } from '@/types/ronda'

export function GwiPanel({ ronda, gwiInputs }: { ronda: RondaLibre; gwiInputs: JugadorGWIInput[] }) {
  return (
    <>
      <div style={{ padding: '8px 12px', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', fontFamily: '"DM Mono", monospace', letterSpacing: '0.08em' }}>GWI&trade;</span>
          <span style={{ fontSize: '11px', color: 'var(--text-2)' }}>Probabilidad de ganar en tiempo real</span>
          <a href="/indices" style={{ fontSize: '10px', color: 'rgba(196,153,42,0.6)', textDecoration: 'none', marginLeft: 'auto' }}>Saber m&aacute;s</a>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '4px', lineHeight: 1.4 }}>
          El Golf Win Index calcula la probabilidad de victoria de cada jugador usando su score actual, historial y patrones de juego. Se actualiza hoyo a hoyo.
        </div>
      </div>
      <GWILeaderboard
        jugadores={gwiInputs}
        hoyosRestantes={ronda.holes - Math.max(...gwiInputs.map(j => j.hoyosCompletados), 0)}
        totalHoyos={ronda.holes}
        modoJuego={ronda.modo_juego || 'gross'}
      />
    </>
  )
}
