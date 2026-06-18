// Barra de probabilidad GWI del match play. Verbatim del monolito.
import { calcularGWIMatch } from '@/golf/stats/gwi-match'
import type { MatchResult } from '@/golf/formats/match-play'
import type { RondaLibre } from '@/types/ronda'

export function MatchGwiPanel({ ronda, mr, courseHcpMap }: { ronda: RondaLibre; mr: MatchResult; courseHcpMap: Record<string, number> }) {
  const jug = ronda.ronda_libre_jugadores
  const gwi = calcularGWIMatch({
    nombreA: jug[0].nombre,
    nombreB: jug[1].nombre,
    handicapA: courseHcpMap[jug[0].id] ?? 0,
    handicapB: courseHcpMap[jug[1].id] ?? 0,
    holesUp: mr.state,
    holesRemaining: mr.holesRemaining,
    roundsCountA: 10,
    roundsCountB: 10,
  })
  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', fontFamily: '"DM Mono", monospace', letterSpacing: '0.08em' }}>GWI&trade;</span>
        <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>Probabilidad de ganar el match</span>
      </div>
      {/* Probability bar */}
      <div style={{ display: 'flex', height: '28px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg)' }}>
        {gwi.probA > 0 && (
          <div style={{
            width: `${gwi.probA}%`, background: 'rgba(22,163,74,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, color: '#16a34a',
            transition: 'width 0.5s ease',
          }}>
            {gwi.probA >= 15 ? `${gwi.probA}%` : ''}
          </div>
        )}
        {gwi.probTie > 0 && (
          <div style={{
            width: `${gwi.probTie}%`, background: 'rgba(107,114,128,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', fontWeight: 600, color: 'var(--text-2)',
            transition: 'width 0.5s ease',
          }}>
            {gwi.probTie >= 10 ? `${gwi.probTie}%` : ''}
          </div>
        )}
        {gwi.probB > 0 && (
          <div style={{
            width: `${gwi.probB}%`, background: 'rgba(220,38,38,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, color: '#dc2626',
            transition: 'width 0.5s ease',
          }}>
            {gwi.probB >= 15 ? `${gwi.probB}%` : ''}
          </div>
        )}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>{jug[0].nombre.split(' ')[0]}</span>
        {gwi.probTie > 5 && <span style={{ fontSize: '10px', color: 'var(--text-2)' }}>Empate</span>}
        <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 600 }}>{jug[1].nombre.split(' ')[0]}</span>
      </div>
      {/* Narrative */}
      <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '6px', textAlign: 'center', fontStyle: 'italic' }}>
        {gwi.narrativa}
      </div>
    </div>
  )
}
