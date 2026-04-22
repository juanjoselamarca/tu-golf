'use client'

import { useState } from 'react'
import { calcularGWI, probResultadoHoyo } from '@/golf/stats/gwi'
import type { JugadorGWIInput, GWIResult } from '@/golf/stats/gwi'
import type { ModoJuego } from '@/golf/core/rules'
import { Trophy, BarChart3, Zap, Target, AlertTriangle, MapPin, Dices } from '@/components/icons'

interface HoleInfo { numero: number; par: number }

interface Props {
  jugadores:       JugadorGWIInput[]
  hoyosRestantes:  number
  totalHoyos:      number
  modoJuego:       ModoJuego
  holesInfo?:      HoleInfo[]
  nextHoleNumber?: number
}

const MODO_LABEL: Record<ModoJuego, string> = {
  gross: 'Gross',
  neto:  'Neto',
}

const MEDALS = ['1.', '2.', '3.']

function TendenciaIcon({ t }: { t: GWIResult['tendencia'] }) {
  if (t === 'up')   return <span style={{ color: '#22c55e', fontSize: '13px' }}>↑</span>
  if (t === 'down') return <span style={{ color: '#dc2626', fontSize: '13px' }}>↓</span>
  return <span style={{ color: '#94a8c0', fontSize: '13px' }}>→</span>
}

function VolatilityBadge({ v }: { v: GWIResult['volatilidad'] }) {
  const cfg = v === 'baja'
    ? { icon: <Target size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />, label: 'Consistente', color: 'rgba(22,163,74,0.15)', border: 'rgba(22,163,74,0.3)', text: '#86efac' }
    : v === 'media'
    ? { icon: <Zap size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />, label: 'Volátil',     color: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.3)',  text: '#fde047' }
    : { icon: <Dices size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />, label: 'Imprevisible',color: 'rgba(249,115,22,0.12)',border: 'rgba(249,115,22,0.3)', text: '#fdba74' }
  return (
    <span style={{
      fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
      background: cfg.color, border: `1px solid ${cfg.border}`, color: cfg.text,
      display: 'inline-flex', alignItems: 'center',
    }}>
      {cfg.icon}{cfg.label}
    </span>
  )
}

export default function GWILeaderboard({
  jugadores, hoyosRestantes, totalHoyos, modoJuego, holesInfo, nextHoleNumber,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [secondsAgo] = useState(0)

  const hoyosJugados = totalHoyos - hoyosRestantes

  // Not enough data
  if (hoyosJugados < 3) {
    return (
      <div style={{ background: '#0e1c2f', borderRadius: '12px', padding: '20px', marginBottom: '12px', border: '1px solid rgba(196,153,42,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '15px', color: '#edeae4' }}><Trophy size={15} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Probabilidades de Ganar</span>
          <span style={{ background: 'rgba(196,153,42,0.12)', border: '1px solid rgba(196,153,42,0.25)', color: '#c4992a', fontSize: '11px', padding: '2px 8px', borderRadius: '8px' }}>{MODO_LABEL[modoJuego]}</span>
        </div>
        <div style={{ textAlign: 'center', padding: '16px', color: '#94a8c0', fontSize: '13px' }}>
          <BarChart3 size={13} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Las probabilidades estarán disponibles a partir del hoyo 3
        </div>
        <div style={{ height: '4px', background: 'rgba(196,153,42,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(hoyosJugados / 3) * 100}%`, background: '#c4992a', borderRadius: '2px', transition: 'width 0.5s ease' }} />
        </div>
      </div>
    )
  }

  const results = calcularGWI(jugadores, totalHoyos)
  if (!results || results.length === 0) {
    return (
      <div style={{ background: '#0e1c2f', borderRadius: '12px', padding: '20px', marginBottom: '12px', border: '1px solid rgba(196,153,42,0.12)' }}>
        <div style={{ textAlign: 'center', padding: '16px', color: '#94a8c0', fontSize: '13px' }}>
          Sin datos de jugadores para calcular probabilidades
        </div>
      </div>
    )
  }
  const sorted  = [...results].sort((a, b) => b.winProbability - a.winProbability)
  if (sorted.length === 0) return null

  const nextHole = holesInfo?.find(h => h.numero === nextHoleNumber)
  const isFinale = hoyosRestantes > 0 && hoyosRestantes <= 3

  return (
    <div style={{ background: '#0e1c2f', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px', border: '1px solid rgba(196,153,42,0.15)' }}>

      {/* Header */}
      <div style={{ background: 'rgba(196,153,42,0.06)', borderBottom: '1px solid rgba(196,153,42,0.12)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '15px', color: '#edeae4', fontWeight: 700 }}><Trophy size={15} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Probabilidades de Ganar</span>
          <span style={{ background: 'rgba(196,153,42,0.12)', border: '1px solid rgba(196,153,42,0.25)', color: '#c4992a', fontSize: '11px', padding: '2px 8px', borderRadius: '8px' }}>{MODO_LABEL[modoJuego]}</span>
        </div>
        <span style={{ fontSize: '11px', color: '#94a8c0' }}>
          Hoyo {hoyosJugados}/{totalHoyos}
          {secondsAgo > 0 && ` · hace ${secondsAgo}s`}
        </span>
      </div>

      {/* Drama box */}
      {isFinale && (
        <div style={{ margin: '12px', padding: '12px 16px', background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.3)', borderRadius: '10px' }}>
          <div style={{ fontSize: '13px', color: '#c4992a', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Zap size={13} /> RECTA FINAL</div>
          <div style={{ fontSize: '12px', color: '#94a8c0' }}>
            {sorted[0] && `${sorted[0].nombre} lidera con ${sorted[0].winProbability}% de probabilidad.`}
            {sorted[1] && sorted[1].winProbability > 20 && ` ${sorted[1].nombre} tiene ${sorted[1].winProbability}% — aún está en juego.`}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '4px 0 8px' }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 70px 36px', padding: '6px 16px', borderBottom: '1px solid rgba(122,143,168,0.1)' }}>
          <span style={{ fontSize: '10px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pos</span>
          <span style={{ fontSize: '10px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Jugador</span>
          <span style={{ fontSize: '10px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Win%</span>
          <span />
        </div>

        {sorted.map((r, i) => {
          const isExpanded = expandedId === r.id
          const barClass   = i === 0 ? 'gwi-bar gwi-bar-leader' : i === 1 ? 'gwi-bar gwi-bar-second' : 'gwi-bar gwi-bar-other'

          return (
            <div key={r.id} style={{ borderBottom: '1px solid rgba(122,143,168,0.06)' }}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                style={{
                  width: '100%', background: i === 0 ? 'rgba(196,153,42,0.04)' : 'none',
                  border: 'none', cursor: 'pointer', padding: '10px 16px',
                  display: 'grid', gridTemplateColumns: '36px 1fr 70px 36px', alignItems: 'center', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '16px' }}>{MEDALS[i] ?? i + 1}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: i === 0 ? 700 : 500, color: '#edeae4' }}>{r.nombre}</span>
                    <VolatilityBadge v={r.volatilidad} />
                  </div>
                  {/* Probability bar */}
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', height: '8px', overflow: 'hidden', width: '100%', maxWidth: '180px' }}>
                    <div className={barClass} style={{ width: `${r.winProbability}%` }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '1.4rem', fontWeight: 700, color: i === 0 ? '#c4992a' : '#edeae4', lineHeight: 1 }}>
                    {r.winProbability}%
                  </div>
                  {r.winProbability > 80 && (
                    <div style={{ fontSize: '9px', color: '#c4992a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>FAVORITO</div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <TendenciaIcon t={r.tendencia} />
                </div>
              </button>

              {/* Expanded breakdown */}
              {isExpanded && (
                <div style={{ padding: '0 16px 14px', background: 'rgba(7,13,24,0.3)' }}>
                  {/* Breakdown pills */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {r.breakdown.situacion.peso > 0 && (
                      <span style={{ fontSize: '11px', background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.2)', color: '#c4992a', padding: '2px 8px', borderRadius: '10px' }}>
                        {r.breakdown.situacion.peso}% score
                      </span>
                    )}
                    {r.breakdown.historico.peso > 0 && (
                      <span style={{ fontSize: '11px', background: 'rgba(26,79,214,0.1)', border: '1px solid rgba(26,79,214,0.2)', color: '#93c5fd', padding: '2px 8px', borderRadius: '10px' }}>
                        {r.breakdown.historico.peso}% historial
                      </span>
                    )}
                    {r.breakdown.cancha.peso > 0 && r.breakdown.cancha.confianza > 0 && (
                      <span style={{ fontSize: '11px', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)', color: '#86efac', padding: '2px 8px', borderRadius: '10px' }}>
                        {r.breakdown.cancha.peso}% cancha
                      </span>
                    )}
                  </div>
                  {/* Narrativa */}
                  {r.narrativa && (
                    <div style={{ fontSize: '12px', color: '#c4992a', marginBottom: '6px', fontStyle: 'italic' }}>
                      &ldquo;{r.narrativa}&rdquo;
                    </div>
                  )}
                  {/* Pattern warning */}
                  {r.breakdown.patrones.valor > 1 && (
                    <div style={{ fontSize: '11px', color: '#fcd34d', marginBottom: '4px' }}>
                      <AlertTriangle size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Patrón: colapso back 9 detectado
                    </div>
                  )}
                  {/* HCP info */}
                  <div style={{ fontSize: '11px', color: '#94a8c0' }}>
                    HCP {r.breakdown.handicapInfo.handicap}
                    {hoyosRestantes > 0 && ` · ±${r.breakdown.handicapInfo.sigma} strokes en ${hoyosRestantes} hoyos`}
                    {' · '}{r.breakdown.handicapInfo.label}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Next hole probabilities */}
      {nextHole && holesInfo && hoyosRestantes > 0 && (
        <div style={{ borderTop: '1px solid rgba(122,143,168,0.1)', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            <MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />PRÓXIMO HOYO: H{nextHole.numero} · Par {nextHole.par}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: '11px', color: '#94a8c0', borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <td style={{ paddingRight: '12px', paddingBottom: '4px' }} />
                  {['Eagle','Birdie','Par','Bogey','Doble+'].map(h => (
                    <td key={h} style={{ textAlign: 'center', paddingBottom: '4px', minWidth: '42px' }}>{h}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jugadores.map(j => {
                  const p = probResultadoHoyo(j.handicapIndex, nextHole.par)
                  return (
                    <tr key={j.id}>
                      <td style={{ paddingRight: '12px', color: '#edeae4', fontWeight: 600, whiteSpace: 'nowrap' }}>{j.nombre}</td>
                      <td style={{ textAlign: 'center', color: '#93c5fd' }}>{p.eagle}%</td>
                      <td style={{ textAlign: 'center', color: '#86efac' }}>{p.birdie}%</td>
                      <td style={{ textAlign: 'center', color: '#edeae4' }}>{p.par}%</td>
                      <td style={{ textAlign: 'center', color: '#fcd34d' }}>{p.bogey}%</td>
                      <td style={{ textAlign: 'center', color: '#fca5a5' }}>{p.masDoble + p.doble}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
