// src/app/torneo/[slug]/components/TournamentResults.tsx
//
// Resultados oficiales de un torneo cerrado: 1° y 2° gross/neto + stats
// (promedio de campo, eagles, birdies). Layout compacto premium.
// Tokens CSS para theme-awareness (dark mode).

import type { TournamentResultados, TeamPodiumEntry } from '../types'

export interface TournamentResultsProps {
  resultados: TournamentResultados
}

/** Podio de parejas para torneos por equipos (scramble/foursome/best_ball). */
function TeamPodium({ podium }: { podium: TeamPodiumEntry[] }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: '24px' }} />
      <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Podio de parejas</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {podium.map((t) => (
          <div key={t.pos} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--bg-surface, #f8f9fa)', border: `1px solid ${t.pos === 1 ? 'rgba(196,153,42,0.35)' : 'var(--border, #e2e8f0)'}`, borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '22px', fontWeight: 700, color: t.pos === 1 ? 'var(--brand-on-bg, #c4992a)' : 'var(--text-3, #94a3b8)', minWidth: '30px' }}>{t.pos}°</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '15px', color: 'var(--text, #1a1a2e)', fontWeight: 700 }}>{t.name}</div>
              {t.members && <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '12px', color: 'var(--text-2, #64748b)', marginTop: '2px' }}>{t.members}</div>}
            </div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '20px', color: 'var(--brand-on-bg, #c4992a)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{t.score}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TournamentResults({ resultados }: TournamentResultsProps) {
  if (resultados.teamPodium && resultados.teamPodium.length > 0) {
    return <TeamPodium podium={resultados.teamPodium} />
  }
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: '24px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        {resultados.grossWinner && (
          <div style={{ background: 'var(--bg-surface, #f8f9fa)', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>1° Gross</div>
            <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '15px', color: 'var(--text, #1a1a2e)', fontWeight: 700 }}>{resultados.grossWinner.name}</div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '20px', color: 'var(--brand-on-bg, #c4992a)', fontWeight: 700, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>{resultados.grossWinner.score}</div>
          </div>
        )}
        {resultados.netoWinner && (
          <div style={{ background: 'var(--bg-surface, #f8f9fa)', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>1° Neto</div>
            <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '15px', color: 'var(--text, #1a1a2e)', fontWeight: 700 }}>{resultados.netoWinner.name}</div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '20px', color: 'var(--brand-on-bg, #c4992a)', fontWeight: 700, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>{resultados.netoWinner.score}</div>
          </div>
        )}
      </div>

      {(resultados.grossSecond || resultados.netoSecond) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          {resultados.grossSecond && (
            <div style={{ background: 'var(--bg-surface, #f8f9fa)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '10px', padding: '12px 16px' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>2° Gross</div>
              <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '14px', color: 'var(--text, #1a1a2e)', fontWeight: 600 }}>{resultados.grossSecond.name} <span style={{ color: 'var(--text-2, #4a5568)' }}>({resultados.grossSecond.score})</span></div>
            </div>
          )}
          {resultados.netoSecond && (
            <div style={{ background: 'var(--bg-surface, #f8f9fa)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '10px', padding: '12px 16px' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>2° Neto</div>
              <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '14px', color: 'var(--text, #1a1a2e)', fontWeight: 600 }}>{resultados.netoSecond.name} <span style={{ color: 'var(--text-2, #4a5568)' }}>({resultados.netoSecond.score})</span></div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', padding: '12px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Promedio</div>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '18px', color: 'var(--brand-on-bg, #c4992a)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{resultados.avgField.toFixed(1)}</div>
        </div>
        <div style={{ width: '1px', background: 'var(--border, #e2e8f0)', alignSelf: 'stretch' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Eagles</div>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '18px', color: 'var(--brand-on-bg, #c4992a)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{resultados.totalEagles}</div>
        </div>
        <div style={{ width: '1px', background: 'var(--border, #e2e8f0)', alignSelf: 'stretch' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Birdies</div>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '18px', color: 'var(--brand-on-bg, #c4992a)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{resultados.totalBirdies}</div>
        </div>
      </div>
    </div>
  )
}
