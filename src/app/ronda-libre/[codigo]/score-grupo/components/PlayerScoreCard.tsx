'use client'

import type { ReactNode } from 'react'
import { esJuegoConPlata } from '@/golf/formats/juegos-con-plata'
import { estaFueraDelHoyo, hoyosConX, type HoyosFuera } from '@/golf/formats/skins/fuera-del-hoyo'
import { scoreChipStyle, scoreFgVar } from '@/lib/score-tokens'
import { formatearHandicap } from '@/golf/handicap-index-range'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { handicapQueJuega } from '@/golf/core/rules'
import { formatVsPar } from '@/golf/share/vs-par'
import type { TotalesDeTarjeta } from '@/golf/ronda-libre/progreso-de-ronda'
import type { FormatoJuego, HoleData, Jugador, ModoJuego } from '@/types/ronda'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'
import { chipLabelCorto } from './chip-label'
import { puedeSumarGolpe, puedeRestarGolpe } from '@/golf/ronda-libre/golpes-por-hoyo'

interface PlayerScoreCardProps {
  jugador: Jugador
  playerScores: Record<number, number> | undefined
  currentHole: number
  par: number
  holeData: HoleData
  totals: TotalesDeTarjeta
  played: number
  /** HCP que puntúa, el que se muestra (18h) y el de los puntos de golpe. */
  hcp: number
  displayHcp: number | undefined
  dotHcp: number
  siAllocByHole: Record<number, number>
  ordenHoyos: readonly number[]
  holeDataMap: Record<number, HoleData>
  totalHoles: number
  modoJuego: ModoJuego
  formatoJuego: FormatoJuego
  showNetStableford: boolean
  /** A1 anti-toque: hay un cambio esperando el segundo tap en este jugador/hoyo. */
  pending: boolean
  onChange: (delta: number) => void
  theme: ScorerTheme
  /** Acción junto al nombre (Timba libre: "Retirar"). */
  accion?: ReactNode
  /** Skins: hoyos con X de este jugador. */
  fuera?: HoyosFuera
  /** Skins: la tecla X («Fuera del hoyo»). Sin ella (cualquier otro formato) la tecla no aparece. */
  onFueraDelHoyo?: () => void
}

/** Tarjeta de UN jugador en el scorer de grupo (stroke play / stableford / match play). */
export function PlayerScoreCard({
  jugador: j, playerScores, currentHole, par, holeData, totals, played, hcp, displayHcp, dotHcp,
  siAllocByHole, ordenHoyos, holeDataMap, totalHoles, modoJuego, formatoJuego, showNetStableford, pending, onChange, theme, accion,
  fuera, onFueraDelHoyo,
}: PlayerScoreCardProps) {
  const playerScore = playerScores?.[currentHole]
  // Skins: X en este hoyo. No es un número: se muestra la X y no hay chip, neto ni puntos.
  const conX = estaFueraDelHoyo(fuera, currentHole)
  const cuantasX = hoyosConX(fuera, ordenHoyos).length
  const displayScore = conX ? 'X' : playerScore ?? par
  const diff = playerScore != null ? playerScore - par : 0
  const { gross, vsPar, out, inn } = totals
  const chipStyle = playerScore != null ? scoreChipStyle(playerScore, par) : null
  const siAllocThisHole = siAllocByHole[currentHole] ?? holeData.stroke_index
  // Timba libre y Skins (`esJuegoConPlata`): ni HCP, ni neto, ni golpes recibidos genéricos. Su neto es otro
  // (diferencia del más bajo) y lo calcula el motor de cada juego; acá solo se anotan golpes (spec, "Para el PR C").
  const esTimba = esJuegoConPlata(formatoJuego)
  const muestraNeto = showNetStableford && !esTimba
  const strokesThisHole = esTimba ? 0 : strokesRecibidosEnHoyo(dotHcp, siAllocThisHole, totalHoles)
  const netScoreThisHole = playerScore != null ? playerScore - strokesThisHole : null
  // Stableford muestra puntos en gross Y en neto; en gross el handicap no entra en juego
  // (`handicapQueJuega`). `showNetStableford` sigue gobernando lo NETO (HCP, net, golpes).
  const isStableford = formatoJuego === 'stableford'
  const muestraTotales = muestraNeto || isStableford
  const hcpJuego = handicapQueJuega(modoJuego, hcp)
  const stablefordPts = playerScore != null ? puntosStablefordHoyo(playerScore, par, hcpJuego, siAllocThisHole, totalHoles) : null

  // Running net/stableford totals
  let runningStableford = 0
  let runningNetVsPar = 0
  if (muestraTotales) {
    for (const h of ordenHoyos) {
      const s = playerScores?.[h]
      if (s != null) {
        const hd = holeDataMap[h]
        if (hd) {
          const si = siAllocByHole[h] ?? hd.stroke_index
          runningStableford += puntosStablefordHoyo(s, hd.par, hcpJuego, si, totalHoles)
          runningNetVsPar += (s - strokesRecibidosEnHoyo(hcpJuego, si, totalHoles)) - hd.par
        }
      }
    }
  }

  return (
    <div style={{
      background: theme.card,
      borderRadius: '14px',
      border: `1px solid ${theme.border}`,
      padding: '12px 14px',
    }}>
      {/* Player name + running total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>{j.nombre}</div>
            {accion}
          </div>
          {muestraNeto && played > 0 && (
            <div style={{ fontSize: '10px', color: theme.textFaint, marginTop: '1px' }}>
              HCP {formatearHandicap(displayHcp ?? hcp)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', flexDirection: 'column', gap: '2px' }}>
          {played > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* Solo X hasta ahora (skins): sin golpes no hay «=0 E» que mostrar, solo el contador de X. */}
                {gross > 0 && (
                  <span style={{ fontSize: '10px', color: theme.textFaint, fontFamily: '"DM Mono", monospace' }}>
                    {out > 0 ? `${out}` : ''}{out > 0 && inn > 0 ? '+' : ''}{inn > 0 ? `${inn}` : ''}={gross}
                  </span>
                )}
                {gross > 0 && (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: scoreFgVar(vsPar) }}>
                    {formatVsPar(vsPar)}
                  </span>
                )}
                {cuantasX > 0 && (
                  // Hoyos con X: no suman golpes (ni par al vs par); se cuentan aparte, en palabras («1 fuera», no «1X»,
                  // que se lee como multiplicador) y separados del total por una línea.
                  <span style={{
                    fontSize: '11px', fontWeight: 600, color: theme.textMuted, whiteSpace: 'nowrap',
                    ...(gross > 0 && { paddingLeft: '6px', borderLeft: `1px solid ${theme.border}` }),
                  }}>
                    {cuantasX} fuera
                  </span>
                )}
              </div>
              {muestraTotales && (
                <span style={{ fontSize: '10px', color: formatoJuego === 'stableford' ? 'var(--brand-on-bg)' : '#60A5FA' }}>
                  {/*
                    El neto se escribe con el MISMO formateador que el bruto de dos
                    líneas más arriba (`formatVsPar`). El signo a mano de antes daba
                    "Net: +0" en par, y en golf el par se escribe "E": el marcador en
                    vivo de la misma ronda ya lo escribe así, así que la app se
                    contradecía a sí misma entre dos pantallas de la misma vuelta.
                  */}
                  {formatoJuego === 'stableford' ? `${runningStableford} pts` : `Net: ${formatVsPar(runningNetVsPar)}`}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* A1 anti-toque: aviso cuando hay pending confirm para este jugador/hoyo */}
      {pending && (
        <div style={{
          textAlign: 'center', marginBottom: '8px',
          fontSize: '11px', fontWeight: 600, color: 'var(--brand-on-bg)',
          background: 'rgba(196,153,42,0.12)',
          border: '1px solid rgba(196,153,42,0.35)',
          borderRadius: '8px', padding: '6px 10px',
          animation: 'livePulse 1.2s ease-in-out infinite',
        }}>
          Toca otra vez para cambiar el score
        </div>
      )}

      {/* Score + controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        {/* Minus button */}
        <button
          onClick={() => onChange(-1)}
          disabled={!puedeRestarGolpe(playerScore)}
          style={{
            width: '52px', height: '52px', borderRadius: '14px',
            fontSize: '24px', fontWeight: 300,
            background: pending ? 'rgba(196,153,42,0.2)' : 'var(--bg)',
            color: theme.text,
            border: pending ? '1px solid rgba(196,153,42,0.55)' : `1px solid ${theme.buttonBorder}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation', userSelect: 'none',
            opacity: puedeRestarGolpe(playerScore) ? 1 : 0.3,
            transition: 'background 0.2s, border 0.2s',
          }}
        >
          {'−'}
        </button>

        {/* Score display */}
        <div style={{ textAlign: 'center', minWidth: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <div style={{
              fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace',
              fontSize: '42px', fontWeight: 700, lineHeight: 1,
              color: playerScore != null || conX ? theme.scoreText : theme.scoreDimmed,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {displayScore}
            </div>
            {modoJuego !== 'gross' && strokesThisHole > 0 && (
              <span data-testid="golpes-recibidos-genericos" style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px',
                alignSelf: 'flex-start', marginTop: '6px',
              }}>
                {Array.from({ length: strokesThisHole }, (_, i) => (
                  <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c4992a' }} />
                ))}
              </span>
            )}
          </div>
          {/* Chip */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
            {conX && (
              <div style={{ fontSize: '11px', fontWeight: 600, color: theme.text }}>Fuera del hoyo</div>
            )}
            {playerScore != null && chipStyle && (
              <div style={{
                padding: '2px 10px', borderRadius: '12px',
                fontSize: '10px', fontWeight: 500,
                ...chipStyle,
                display: 'inline-block',
              }}>
                {chipLabelCorto(diff)}
              </div>
            )}
            {muestraTotales && playerScore != null && (
              <div style={{
                padding: '2px 8px', borderRadius: '10px',
                fontSize: '9px', fontWeight: 600,
                background: formatoJuego === 'stableford' ? 'rgba(196,153,42,0.15)' : 'rgba(96,165,250,0.15)',
                color: formatoJuego === 'stableford' ? 'var(--brand-on-bg)' : '#60A5FA',
                border: `1px solid ${formatoJuego === 'stableford' ? 'rgba(196,153,42,0.3)' : 'rgba(96,165,250,0.3)'}`,
                display: 'inline-block',
              }}>
                {formatoJuego === 'stableford'
                  ? `${stablefordPts} pts`
                  : `Net: ${netScoreThisHole != null ? formatVsPar(netScoreThisHole - par) : '—'}`}
              </div>
            )}
          </div>
        </div>

        {/* Plus button */}
        <button
          onClick={() => onChange(1)}
          disabled={!puedeSumarGolpe(playerScore)}
          style={{
            width: '52px', height: '52px', borderRadius: '14px',
            fontSize: '24px', fontWeight: 600,
            background: pending ? '#d4a843' : theme.gold,
            color: 'var(--brand-dark)',
            border: pending ? '2px solid rgba(255,255,255,0.6)' : 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation', userSelect: 'none',
            opacity: puedeSumarGolpe(playerScore) ? 1 : 0.3,
            transition: 'background 0.2s, border 0.2s',
          }}
        >
          +
        </button>

        {/* Skins: tecla X («Fuera del hoyo»). Marca el hoyo sin golpes; con valor anotado pide el 2º toque (A1). */}
        {onFueraDelHoyo && (
          <button
            type="button"
            onClick={onFueraDelHoyo}
            aria-label="Fuera del hoyo"
            aria-pressed={conX}
            style={{
              // 8 px más de aire que entre − y +: la X no es un golpe más, y un dedo apurado no la toca por el +.
              marginLeft: '8px',
              width: '48px', height: '52px', borderRadius: '14px',
              fontSize: '20px', fontWeight: 700,
              fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace',
              background: conX ? theme.text : 'var(--bg)',
              color: conX ? 'var(--bg)' : theme.text,
              border: pending ? '1px solid rgba(196,153,42,0.55)' : `1px solid ${conX ? theme.text : theme.buttonBorder}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'manipulation', userSelect: 'none',
              transition: 'background 0.2s, border 0.2s',
            }}
          >
            X
          </button>
        )}
      </div>
    </div>
  )
}
