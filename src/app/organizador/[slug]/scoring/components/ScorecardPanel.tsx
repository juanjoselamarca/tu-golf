// Tarjeta del jugador seleccionado: totales en vivo, grilla de scores por hoyo,
// stats opcionales (colapsable) y finalización de la ronda.

import { useState } from 'react'
import { presentacionHandicapInscrito } from '@/golf/handicap-index-range'
import { isStablefordFormat, resolveFormatoJuego } from '@/golf/formats'
import type { CourseHole } from '@/golf/leaderboard/types'
import { resolveLegacyPlayerName } from '@/golf/leaderboard/board-rules'
import type { ScoringTournament } from '@/lib/data/tournaments/scoring'
import { isClosedRoundStatus } from '../hooks/useScoringData'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'
import { getScoreResult, SCORE_STYLES } from '@/golf/core/colors'
import { HoleStatsTable } from './HoleStatsTable'
import { AvisoJugadorSinTarjeta, casoSinTarjeta } from './AvisoJugadorSinTarjeta'
import { rotuloEstado, textoAvisoHoyo, textoBotonCierre } from './texto-guardado'
import type { EstadoHoyo } from '../hooks/estado-hoyos'

/** Cómo se marca la celda de un hoyo que no está en la base tal como se ve. Tokens light/dark (globals.css). */
const MARCA_ESTADO: Record<EstadoHoyo, { bg: string; border: string; fg: string; glifo: string } | null> = {
  limpio: null,
  guardando: { bg: 'var(--surface-soft)', border: '2px dashed var(--text-2)', fg: 'var(--text-2)', glifo: '···' },
  sin_confirmar: { bg: 'var(--status-open-bg)', border: '2px solid var(--status-open-fg)', fg: 'var(--status-open-fg)', glifo: '!' },
  rechazado: { bg: 'var(--error-bg)', border: '2px solid var(--error-border)', fg: 'var(--error-fg)', glifo: '✕' },
}
import type { useCrearTarjeta } from '../hooks/useCrearTarjeta'

// Paleta del scorer del organizador — usa colores Garmin canónicos (T1 resuelta).
function scoreBackground(gross: number, par: number) {
  const s = SCORE_STYLES[getScoreResult(gross, par)]
  return s.bg
}

function scoreBorder(gross: number, par: number) {
  const s = SCORE_STYLES[getScoreResult(gross, par)]
  return `${s.borderWidth} solid ${s.border}`
}

/** Color del neto según va bajo (verde), sobre (rojo) o al par jugado. */
function colorNetoVsPar(netoVsPar: number): string {
  if (netoVsPar < 0) return 'var(--status-live-fg)'
  if (netoVsPar > 0) return 'var(--status-closed-fg)'
  return 'var(--text)'
}

interface ScorecardPanelProps {
  tournament: ScoringTournament
  courseHoles: CourseHole[]
  holeCount: number
  entry: UseScoreEntryReturn
  /** Torneo cerrado o publicado: la tarjeta se lee pero no se edita (el servidor rechazaría cada golpe). */
  soloLectura?: boolean
  /** "Crear su tarjeta" para el jugador sin tarjeta en la ronda en juego. */
  crearTarjeta?: ReturnType<typeof useCrearTarjeta>
  /** Ronda que se está viendo y si es la vigente: en una ronda pasada no se ofrece crear tarjeta. */
  ronda?: { numero: number; vigente: boolean }
}

export function ScorecardPanel({ tournament, courseHoles, holeCount, entry, soloLectura: torneoSoloLectura = false, crearTarjeta, ronda = { numero: 1, vigente: true } }: ScorecardPanelProps) {
  // Mismo rótulo y formato que el panel de jugadores: Índice en WHS, HCP en el resto.
  const presentacionHcp = presentacionHandicapInscrito(tournament.hcp_calc_mode)
  const [showStats, setShowStats] = useState(false)
  const {
    selectedPlayer, selectedRound, holes, currentScores, vista, cierre,
    allFilled, parJugado, grossTotal, outGross, inGross, netTotal,
    stablefordPtsAt, saveScore, finalizeRound, selectedId, reintentarGuardado,
  } = entry

  if (!selectedPlayer) return null

  // Hoyos de esta tarjeta que no están en la base tal como se ven (con texto, no sólo color: se lee al sol).
  const avisos = holes.filter((h) => vista[h]?.estado === 'sin_confirmar' || vista[h]?.estado === 'rechazado')
  const cierreEsta = cierre != null && cierre.roundId === selectedRound?.id

  const roundClosed = isClosedRoundStatus(selectedRound?.status)
  // Sin tarjeta en la ronda en juego no hay dónde guardar: la grilla no se edita y el aviso ofrece crearla.
  const sinTarjeta = !selectedRound
  const soloLectura = torneoSoloLectura || sinTarjeta
  // Mientras la tarjeta carga (o se cierra) la grilla no se edita: "lo que había" todavía no se sabe.
  const bloqueada = soloLectura || !entry.editable
  // Quien no juega esta ronda (WD/DQ/pendiente, o no jugó una ronda pasada) no tiene tarjeta por llenar: sin grilla.
  // Con el torneo cerrado o publicado no se crea tarjeta: el aprobado sin ella "no jugó la ronda N" (antes
  // quedaba una grilla vacía sin explicación, Fable #829).
  const sinGrilla = sinTarjeta && casoSinTarjeta(selectedPlayer.status, ronda.vigente, !torneoSoloLectura) !== 'crear'

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: 'var(--text)' }}>{resolveLegacyPlayerName(selectedPlayer)}</span>
          <span style={{ color: 'var(--text-2)', fontSize: '13px', marginLeft: '10px' }}>{presentacionHcp.rotulo} {selectedPlayer.handicap_at_registration != null ? presentacionHcp.formatear(selectedPlayer.handicap_at_registration) : '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
          {holeCount === 18 && grossTotal > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-2)', fontFamily: '"DM Mono", monospace', alignSelf: 'center' }}>
              {outGross}+{inGross}
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '2px' }}>GROSS</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', fontFamily: '"DM Mono", monospace' }}>{grossTotal || '—'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '2px' }}>NET</div>
            {/* netTotal son GOLPES netos (gross − golpes recibidos), igual que GROSS:
                se muestra como golpes. Antes se formateaba como vs par ("+30" para
                38 gross con 8 golpes recibidos). El color sí compara contra el par
                jugado, que es lo que le dice al organizador si va bajo o sobre. */}
            <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: '"DM Mono", monospace', color: colorNetoVsPar(netTotal - parJugado) }}>
              {grossTotal ? netTotal : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '2px' }}>vs PAR</div>
            <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: '"DM Mono", monospace', color: 'var(--text-2)' }}>
              {grossTotal ? (() => {
                const vp = grossTotal - parJugado
                return vp <= 0 ? String(vp) : `+${vp}`
              })() : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* "No juega"/"no jugó" se dice siempre; "Crear su tarjeta" solo con el torneo recibiendo golpes. */}
      {sinTarjeta && (sinGrilla || crearTarjeta) && (
        <AvisoJugadorSinTarjeta
          nombre={resolveLegacyPlayerName(selectedPlayer)} status={selectedPlayer.status} ronda={ronda} admiteTarjetas={!torneoSoloLectura}
          creando={crearTarjeta?.creando ?? false} resultado={crearTarjeta?.resultado ?? null}
          crear={() => { void crearTarjeta?.crear() }}
        />
      )}

      {!sinGrilla && (<>
      {/* Grilla de scores — scroll horizontal en mobile 390px para mantener
           touch targets >= 44px (dedo con guante en cancha). */}
      <div style={{ padding: '20px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, minmax(44px, 1fr))', gap: '8px', minWidth: '396px' }}>
        {holes.map((holeNum) => {
          const hole = courseHoles.find((h) => h.numero === holeNum)
          const par = hole?.par ?? 4
          const gross = currentScores[holeNum]
          const haScore = gross != null
          const estadoHoyo = vista[holeNum]?.estado ?? 'limpio'
          const marca = MARCA_ESTADO[estadoHoyo]

          return (
            <div
              key={holeNum}
              style={{
                background: marca?.bg ?? (haScore ? scoreBackground(gross, par) : 'var(--surface-soft)'),
                border: marca?.border ?? (haScore ? scoreBorder(gross, par) : '1px solid var(--surface-border)'),
                borderRadius: '8px',
                padding: '8px 4px',
                textAlign: 'center',
                minWidth: '44px',
                minHeight: '44px',
                animation: estadoHoyo === 'rechazado' ? 'pulse 1s ease-in-out 3' : 'none',
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '2px' }}>H{holeNum}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>P{par}</div>
              <input
                type="number"
                min={1}
                max={19}
                inputMode="numeric"
                defaultValue={gross ?? ''}
                key={`${selectedId}-${holeNum}-${gross}`}
                readOnly={bloqueada}
                aria-label={`Golpes del hoyo ${holeNum}${marca ? ` (${rotuloEstado(estadoHoyo)?.toLowerCase()})` : ''}`}
                onBlur={(e) => { if (!bloqueada) saveScore(holeNum, e.target.value) }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  textAlign: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  padding: '4px 0',
                  minHeight: '28px',
                  cursor: bloqueada ? 'default' : 'text',
                  appearance: 'textfield',
                }}
                placeholder="—"
              />
              {marca && (
                <div style={{ fontSize: '12px', fontWeight: 700, color: marca.fg, lineHeight: 1 }} aria-hidden="true">{marca.glifo}</div>
              )}
              {haScore && isStablefordFormat(resolveFormatoJuego(tournament)) && (() => {
                const pts = stablefordPtsAt(holeNum, gross)
                return (
                  <div style={{ fontSize: '12px', color: pts >= 2 ? 'var(--status-live-fg)' : pts === 1 ? 'var(--brand-on-bg)' : 'var(--text-2)', fontWeight: 600, marginTop: '2px' }}>
                    {pts} pt{pts !== 1 ? 's' : ''}
                  </div>
                )
              })()}
            </div>
          )
        })}
        </div>
      </div>

      {avisos.length > 0 && (
        <div role="status" style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {avisos.map((h) => {
            const v = vista[h]
            const marca = MARCA_ESTADO[v.estado]!
            return (
              <button key={h} type="button" onClick={() => reintentarGuardado(selectedRound?.id)}
                style={{ minHeight: '44px', borderRadius: '8px', border: marca.border, background: marca.bg, color: marca.fg, fontSize: '14px', fontWeight: 600, textAlign: 'left', padding: '8px 12px', cursor: 'pointer' }}>
                {textoAvisoHoyo(h, v)} · Reintentar
              </button>
            )
          })}
        </div>
      )}

      {/* Estadísticas adicionales (colapsable) */}
      <div style={{ borderTop: '1px solid var(--surface-soft)' }}>
        <button
          type="button"
          onClick={() => setShowStats(!showStats)}
          style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-2)', fontSize: '13px' }}
        >
          <span style={{ transition: 'transform 200ms', transform: showStats ? 'rotate(90deg)' : 'rotate(0)', display: 'inline-block' }}>▶</span>
          Estadísticas adicionales — Putts · Fairway · GIR (opcional)
        </button>
        {showStats && (
          <fieldset disabled={bloqueada} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <HoleStatsTable courseHoles={courseHoles} entry={entry} />
          </fieldset>
        )}
      </div>

      </>)}
      {sinGrilla && <div style={{ height: 16 }} />}

      {/* Finalizar */}
      {allFilled && !roundClosed && !soloLectura && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => { void finalizeRound() }}
            disabled={cierre != null}
            style={{
              background: 'var(--brand-on-bg)',
              color: 'var(--bg)',
              fontWeight: 700,
              fontSize: '15px',
              padding: '12px 28px',
              minHeight: '44px',
              borderRadius: '8px',
              border: 'none',
              cursor: cierre ? 'not-allowed' : 'pointer',
              opacity: cierre ? 0.8 : 1,
            }}
          >
            {textoBotonCierre(cierre, cierreEsta)}
          </button>
        </div>
      )}
      {roundClosed && (
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(22,163,74,0.2)', background: 'var(--status-live-bg)', textAlign: 'center', color: 'var(--status-live-fg)', fontSize: '14px' }}>
          ✓ Ronda finalizada
        </div>
      )}
    </div>
  )
}
