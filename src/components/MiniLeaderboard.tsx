'use client'
import { useState, useCallback } from 'react'
import { loadRondaLibre } from '@/lib/data/ronda-libre-live-api'
import { useLivePoll } from '@/hooks/ronda/useLivePoll'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { handicapQueJuega } from '@/golf/core/rules'
import { normalizeStrokeIndexMap } from '@/golf/core/stroke-index'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'

interface JugadorLB {
  id: string
  nombre: string
  user_id: string | null
  holesCompleted: number
  totalGross: number
  totalVsPar: number | null
  totalStableford: number
  totalNetVsPar: number | null
  lastHole: number | null
}

interface Props {
  codigoRonda: string
  parMap: Record<number, number>
  currentUserId: string | null
  totalHoles: number
  modoJuego?: ModoJuego
  formatoJuego?: FormatoJuego
  hcpMap?: Record<string, number>
  siMap?: Record<number, number>
  /** Hoyos jugados (`hoyosDeLaRonda`): el SI se rankea sólo sobre ellos. */
  hoyos?: readonly number[]
  /**
   * Golpes del jugador que anota EN ESTE teléfono (estado local del scorer). Pisan
   * a los del servidor: quien anota ve sus golpes al instante, aunque la ruta en
   * vivo (cacheada en el CDN) todavía no los traiga.
   */
  scoresPropios?: { jugadorId: string; scores: Record<string | number, number> } | null
}

type JugadorServidor = { id: string; nombre: string; user_id: string | null; scores: Record<string, number> }

/** Cada cuánto se consulta la ronda en la pestaña "Leaderboard" del scorer. */
const INTERVALO_MS = 20_000

export default function MiniLeaderboard({ codigoRonda, parMap, currentUserId, totalHoles, modoJuego = 'gross', formatoJuego = 'stroke_play', hcpMap = {}, siMap = {}, hoyos, scoresPropios = null }: Props) {
  const [jugadoresServidor, setJugadoresServidor] = useState<JugadorServidor[] | null>(null)

  // Sin Supabase Realtime (incidente 04-oct-2026): polling a la ruta en vivo cacheable.
  const fetchLB = useCallback(async () => {
    const res = await loadRondaLibre(codigoRonda)
    // Un corte conserva lo que ya se mostraba; el próximo poll reintenta.
    if (res.status === 'ok') setJugadoresServidor(res.ronda.ronda_libre_jugadores as JugadorServidor[])
  }, [codigoRonda])
  useLivePoll(fetchLB, { intervalMs: INTERVALO_MS, enabled: !!codigoRonda })

  const jugadores = calcularJugadores()

  function calcularJugadores(): JugadorLB[] {
    if (!jugadoresServidor) return []
    const data = {
      ronda_libre_jugadores: jugadoresServidor.map(j =>
        scoresPropios && j.id === scoresPropios.jugadorId
          ? { ...j, scores: scoresPropios.scores as Record<string, number> }
          : j),
    }

    // SI normalizado a permutación 1..N para ALOCAR golpes (Σ == course handicap
    // aunque el SI de catálogo sea 18h-impar en 9h). No-op si ya es válido. El SI
    // que se muestra no se toca; esto sólo afecta el reparto de golpes de neto.
    const siAllocMap = normalizeStrokeIndexMap(siMap, totalHoles, hoyos)

    const jug: JugadorLB[] = data.ronda_libre_jugadores.map((j) => {
      const sc = j.scores ?? {}
      const entries = Object.entries(sc).filter(([, s]) => Number(s) > 0)
      const holesCompleted = entries.length
      const totalGross = entries.reduce((a, [, s]) => a + Number(s), 0)
      const parForPlayedHoles = entries.reduce((a, [h]) => a + (parMap[parseInt(h)] ?? 4), 0)
      const totalVsPar = holesCompleted > 0 ? totalGross - parForPlayedHoles : null
      // Neto y Stableford para sorting correcto
      // En gross el handicap no entra en juego (`handicapQueJuega`): Stableford gross = puntos contra el par.
      const hcp = handicapQueJuega(modoJuego, hcpMap[j.id] ?? 18)
      let totalStableford = 0
      let totalNetVsPar: number | null = null
      if (holesCompleted > 0) {
        let netSum = 0
        for (const [h, s] of entries) {
          const hNum = parseInt(h)
          const par = parMap[hNum] ?? 4
          const si = siAllocMap[hNum] ?? siMap[hNum] ?? hNum
          const strokes = strokesRecibidosEnHoyo(hcp, si, totalHoles)
          netSum += (Number(s) - strokes)
          totalStableford += puntosStablefordHoyo(Number(s), par, hcp, si, totalHoles)
        }
        totalNetVsPar = netSum - parForPlayedHoles
      }
      const holeNums = entries.map(([h]) => parseInt(h)).filter(n => !isNaN(n))
      const lastHole = holeNums.length > 0 ? Math.max(...holeNums) : null
      return { id: j.id, nombre: j.nombre, user_id: j.user_id ?? null, holesCompleted, totalGross, totalVsPar, totalStableford, totalNetVsPar, lastHole }
    })

    // Ordenar según modo de juego
    jug.sort((a, b) => {
      if (a.holesCompleted === 0 && b.holesCompleted === 0) return 0
      if (a.holesCompleted === 0) return 1
      if (b.holesCompleted === 0) return -1
      if (formatoJuego === 'stableford') return b.totalStableford - a.totalStableford // más puntos = mejor
      if (modoJuego === 'neto') return (a.totalNetVsPar ?? 0) - (b.totalNetVsPar ?? 0) // menos = mejor
      return (a.totalVsPar ?? 0) - (b.totalVsPar ?? 0) // gross: menos vs par = mejor
    })

    return jug
  }

  if (jugadores.length < 2) return null

  return (
    <div style={{ width: '100%', padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {jugadores.map((j, idx) => {
          const esYo = j.user_id === currentUserId
          const isLeading = idx === 0 && j.totalGross > 0
          const thruText = j.lastHole != null ? `H.${j.lastHole}` : '—'

          return (
            <div
              key={j.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderRadius: '10px', padding: '8px 12px',
                background: isLeading ? 'rgba(201,168,76,0.08)' : esYo ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isLeading ? 'rgba(201,168,76,0.2)' : esYo ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '12px', fontWeight: 700, width: '16px', textAlign: 'center',
                  color: isLeading ? '#c4992a' : 'rgba(255,255,255,0.3)',
                }}>{idx + 1}</span>
                <div>
                  <div style={{
                    fontSize: '13px', fontWeight: isLeading ? 600 : 400, lineHeight: 1.2,
                    color: isLeading ? 'var(--text)' : 'rgba(255,255,255,0.55)',
                  }}>
                    {j.nombre}
                    {esYo && <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', marginLeft: '6px' }}>tu</span>}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.2 }}>
                    {j.holesCompleted}/{totalHoles} · {thruText}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {j.totalGross > 0 ? (
                  <>
                    <div style={{
                      fontSize: '14px', fontWeight: 700, lineHeight: 1.2,
                      // Paleta Garmin: under-par = birdie celeste, par = dorado neutral, over-par = discreto
                      color: j.totalVsPar != null && j.totalVsPar < 0 ? '#14B3D9' : j.totalVsPar === 0 ? '#c4992a' : 'rgba(255,255,255,0.55)',
                    }}>{j.totalGross}</div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.2 }}>
                      {j.totalVsPar == null ? '–' : j.totalVsPar === 0 ? 'Par' : j.totalVsPar > 0 ? `+${j.totalVsPar}` : `${j.totalVsPar}`}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.15)' }}>–</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ textAlign: 'center', fontSize: '9px', color: 'rgba(255,255,255,0.15)', marginTop: '6px' }}>Actualiza cada 20 s</div>
    </div>
  )
}
