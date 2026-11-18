// Guardado de las stats opcionales del hoyo (putts / fairway / GIR) del scorer del organizador.
// Separado de `useScoreEntry`. Lleva aquí, y no en la tabla, qué hoyos tienen stats que no se guardaron: la tabla
// se desmonta al colapsar "Estadísticas" y con ella se perdía la marca de fallo.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'
import { enviarHoyo, leerTocadas, type HoleStatPatch, type StatsTocadas, type VersionesEnviadas } from './envio-hoyo'

/** Fairway y GIR se tocan varias veces seguidas (el botón rota): se envía sólo el valor final. */
export const ESPERA_ENVIO_STAT_MS = 600

interface Args {
  tournament: ScoringTournament | null
  selectedId: string | null
  players: ScoringPlayer[]
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  currentScores: Record<number, number>
  parDelHoyo: (hole: number) => number
  tarjetaLista: (roundId: string) => boolean
  statsTocadasRef: MutableRefObject<StatsTocadas>
  fotoStatsDelHoyo: (roundId: string, hole: number, patch?: HoleStatPatch) => { foto: HoleStatPatch; versiones: VersionesEnviadas }
  confirmarStats: (roundId: string, hole: number, versiones: VersionesEnviadas) => void
  showWarning: (titulo: string, mensaje: string) => void
}

const NINGUNO: ReadonlySet<number> = new Set()

export function useStatsHoyo({
  tournament, selectedId, players, getActiveRound, currentScores, parDelHoyo, tarjetaLista, statsTocadasRef,
  fotoStatsDelHoyo, confirmarStats, showWarning,
}: Args) {
  /** Hoyos cuyo último envío de stats falló, de UNA ronda: lo que sigue tocado viaja de nuevo al reintentar. */
  const [fallidas, setFallidas] = useState<{ roundId: string | null; hoyos: ReadonlySet<number> }>({ roundId: null, hoyos: NINGUNO })
  /** Último envío de cada `ronda:hoyo`: sólo su resultado marca o desmarca el hoyo. */
  const ultimoEnvio = useRef(new Map<string, number>())
  const contador = useRef(0)
  /** Envíos esperando el fin de los toques (`ESPERA_ENVIO_STAT_MS`), por `ronda:hoyo`. */
  const pendientes = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; enviar: () => void }>())
  /** Hoyos que ya avisaron que sus stats no se guardaron: un aviso por jugador, ronda y hoyo, no uno por tap. */
  const avisados = useRef(new Set<string>())
  /** Golpes a la vista, leídos al salir un envío diferido (el golpe pudo cambiar durante la espera). */
  const scoresRef = useRef(currentScores)
  useEffect(() => {
    scoresRef.current = currentScores
  })

  const marcar = useCallback((roundId: string, hole: number, fallo: boolean) => {
    setFallidas((prev) => {
      const base = prev.roundId === roundId ? prev.hoyos : NINGUNO
      if (base.has(hole) === fallo) return prev.roundId === roundId ? prev : { roundId, hoyos: base }
      const hoyos = new Set(base)
      if (fallo) hoyos.add(hole)
      else hoyos.delete(hole)
      return { roundId, hoyos }
    })
  }, [])

  /** Envía lo tocado del hoyo. Devuelve si quedó guardado. */
  const enviar = useCallback(
    async (roundId: string, playerId: string, hole: number, gross: number, foto: HoleStatPatch, versiones: VersionesEnviadas) => {
      if (!tournament) return false
      const clave = `${roundId}:${hole}`
      const id = ++contador.current
      ultimoEnvio.current.set(clave, id)
      const res = await enviarHoyo({
        tournament_id: tournament.id, round_id: roundId, hole_number: hole, par: parDelHoyo(hole),
        gross_score: gross, ...foto,
      })
      if (res.ok && res.aplicado) confirmarStats(roundId, hole, versiones)
      const aviso = `${playerId}:${clave}`
      if (!res.ok && !avisados.current.has(aviso)) {
        // Un solo aviso por hoyo: putts, fairway y GIR son tres taps sobre el MISMO hoyo, y con la red caída eran
        // tres toasts apilados justo cuando el organizador tiene menos tiempo para leerlos.
        avisados.current.add(aviso)
        showWarning('No se guardó', `Las estadísticas del hoyo ${hole} no quedaron registradas. Reintenta.`)
      }
      if (res.ok) avisados.current.delete(aviso)
      if (ultimoEnvio.current.get(clave) === id) marcar(roundId, hole, !res.ok)
      return res.ok
    },
    [tournament, parDelHoyo, confirmarStats, showWarning, marcar],
  )

  /** Ronda y golpe del hoyo, si se puede guardar en él: tarjeta a la vista ya cargada y con golpe en el hoyo. */
  const destino = useCallback(
    (hole: number) => {
      if (!tournament || !selectedId) return null
      const gross = currentScores[hole]
      const round = getActiveRound(players.find((p) => p.id === selectedId))
      if (gross == null || !round || !tarjetaLista(round.id)) return null
      return { roundId: round.id, playerId: selectedId }
    },
    [tournament, selectedId, currentScores, players, getActiveRound, tarjetaLista],
  )

  /** Fija `patch` y lo envía YA con la foto del hoyo (putts al salir del campo, reintento). Multi-ronda: contra la
   *  ronda ACTIVA, no `rounds[0]`. */
  const saveHoleStat = useCallback(
    async (hole: number, patch: HoleStatPatch): Promise<boolean> => {
      const d = destino(hole)
      if (!d) return false
      const { foto, versiones } = fotoStatsDelHoyo(d.roundId, hole, patch)
      return enviar(d.roundId, d.playerId, hole, currentScores[hole], foto, versiones)
    },
    [destino, fotoStatsDelHoyo, enviar, currentScores],
  )

  /** Fija `patch` ya (viaja con cualquier envío del hoyo desde ahora) y envía cuando dejan de tocar. */
  const cambiarStat = useCallback(
    (hole: number, patch: HoleStatPatch) => {
      const d = destino(hole)
      if (!d) return
      fotoStatsDelHoyo(d.roundId, hole, patch)
      const clave = `${d.roundId}:${hole}`
      const previo = pendientes.current.get(clave)
      if (previo) clearTimeout(previo.timer)
      const salir = () => {
        pendientes.current.delete(clave)
        const gross = scoresRef.current[hole]
        if (gross == null) return
        const { foto, versiones } = leerTocadas(statsTocadasRef.current, d.roundId, hole)
        void enviar(d.roundId, d.playerId, hole, gross, foto, versiones)
      }
      pendientes.current.set(clave, { timer: setTimeout(salir, ESPERA_ENVIO_STAT_MS), enviar: salir })
    },
    [destino, fotoStatsDelHoyo, enviar, statsTocadasRef],
  )

  /** Envía ya lo que estaba esperando. Se llama ANTES de soltar la tarjeta (cambio de jugador, cerrar): después lo
   *  tocado de esa ronda ya no está. */
  const enviarPendientes = useCallback(() => {
    for (const { timer, enviar: salir } of [...pendientes.current.values()]) {
      clearTimeout(timer)
      salir()
    }
  }, [])
  const enviarPendientesRef = useRef(enviarPendientes)
  useEffect(() => {
    enviarPendientesRef.current = enviarPendientes
  })
  useEffect(() => () => enviarPendientesRef.current(), [])

  /** El golpe del hoyo se guardó con la foto de stats: lo que estaba fallido viajó con él. */
  const statsGuardadas = useCallback((roundId: string, hole: number) => marcar(roundId, hole, false), [marcar])

  const roundId = getActiveRound(players.find((p) => p.id === selectedId))?.id ?? null
  const statsFallidas = fallidas.roundId === roundId ? fallidas.hoyos : NINGUNO

  return { saveHoleStat, cambiarStat, enviarPendientes, statsGuardadas, statsFallidas }
}
