// src/app/torneo/[slug]/components/TournamentResults.tsx
//
// Resultados oficiales de un torneo cerrado: 1° y 2° gross/neto + stats
// (promedio de campo, eagles, birdies). Layout compacto premium.

import type { TournamentResultados } from '../types'

export interface TournamentResultsProps {
  resultados: TournamentResultados
}

export function TournamentResults({ resultados }: TournamentResultsProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: '24px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        {resultados.grossWinner && (
          <div style={{ background: '#f8f9fa', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>1° Gross</div>
            <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '15px', color: '#1a1a2e', fontWeight: 700 }}>{resultados.grossWinner.name}</div>
            <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '22px', color: '#c4992a', fontWeight: 700, marginTop: '2px' }}>{resultados.grossWinner.score}</div>
          </div>
        )}
        {resultados.netoWinner && (
          <div style={{ background: '#f8f9fa', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>1° Neto</div>
            <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '15px', color: '#1a1a2e', fontWeight: 700 }}>{resultados.netoWinner.name}</div>
            <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '22px', color: '#c4992a', fontWeight: 700, marginTop: '2px' }}>{resultados.netoWinner.score}</div>
          </div>
        )}
      </div>

      {(resultados.grossSecond || resultados.netoSecond) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          {resultados.grossSecond && (
            <div style={{ background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>2° Gross</div>
              <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '14px', color: '#1a1a2e', fontWeight: 600 }}>{resultados.grossSecond.name} <span style={{ color: '#4a5568' }}>({resultados.grossSecond.score})</span></div>
            </div>
          )}
          {resultados.netoSecond && (
            <div style={{ background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>2° Neto</div>
              <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '14px', color: '#1a1a2e', fontWeight: 600 }}>{resultados.netoSecond.name} <span style={{ color: '#4a5568' }}>({resultados.netoSecond.score})</span></div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', padding: '12px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Promedio</div>
          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '20px', color: '#c4992a', fontWeight: 700 }}>{resultados.avgField.toFixed(1)}</div>
        </div>
        <div style={{ width: '1px', background: '#e2e8f0', alignSelf: 'stretch' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Eagles</div>
          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '20px', color: '#c4992a', fontWeight: 700 }}>{resultados.totalEagles}</div>
        </div>
        <div style={{ width: '1px', background: '#e2e8f0', alignSelf: 'stretch' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Birdies</div>
          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '20px', color: '#c4992a', fontWeight: 700 }}>{resultados.totalBirdies}</div>
        </div>
      </div>
    </div>
  )
}
