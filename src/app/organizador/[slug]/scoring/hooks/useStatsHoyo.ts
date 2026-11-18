// Guardado de las stats opcionales del hoyo (putts / fairway / GIR) del scorer del organizador.
// Separado de `useScoreEntry`. Lleva aquí, y no en la tabla, qué hoyos tienen stats que no se guardaron: la tabla
// se desmonta al colapsar "Estadísticas" y con ella se perdía la marca de fallo.
//
// Los fallos se guardan POR RONDA y con la foto que no llegó: lo tocado de una tarjeta se suelta al abrir otra, así
// que sin la foto el "toca para reintentar" de vuelta en A mandaba nada y decía que se guardó (el GIR se perdía).

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'
import { resolveLegacyPlayerName } from '@/golf/leaderboard/board-rules'
import { enviarHoyo, leerTocadas, type HoleStatPatch, type StatsTocadas, type VersionesEnviadas } from './envio-hoyo'

/** Fairway y GIR se tocan varias veces seguidas (el botón rota): se envía sólo el valor final. */
export const ESPERA_ENVIO_STAT_MS = 600

/** Golpe que el organizador acaba de mandar al hoyo (`ronda:hoyo`), mientras la pantalla todavía no lo refleja o el
 *  envío no terminó. `null` = el hoyo queda sin golpe (deshacer de un hoyo que estaba vacío). */
export type GrossEscrito = Map<string, { valor: number | null }>

/** Hoyos con stats sin guardar, por ronda, con la foto que no llegó. */
type Fallidas = ReadonlyMap<string, ReadonlyMap<number, HoleStatPatch>>

interface Args {
  tournament: ScoringTournament | null
  selectedId: string | null
  players: ScoringPlayer[]
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  currentScores: Record<number, number>
  parDelHoyo: (hole: number) => number
  tarjetaLista: (roundId: string) => boolean
  statsTocadasRef: MutableRefObject<StatsTocadas>
  grossEscritoRef: MutableRefObject<GrossEscrito>
  fotoStatsDelHoyo: (roundId: string, hole: number, patch?: HoleStatPatch) => { foto: HoleStatPatch; versiones: VersionesEnviadas }
  confirmarStats: (roundId: string, hole: number, versiones: VersionesEnviadas) => void
  showWarning: (titulo: string, mensaje: string) => void
}

const NINGUNO: ReadonlySet<number> = new Set()
const SIN_FALLIDAS: Fallidas = new Map()

export function useStatsHoyo({
  tournament, selectedId, players, getActiveRound, currentScores, parDelHoyo, tarjetaLista, statsTocadasRef,
  grossEscritoRef, fotoStatsDelHoyo, confirmarStats, showWarning,
}: Args) {
  const [fallidas, setFallidas] = useState<Fallidas>(SIN_FALLIDAS)
  /** Espejo de `fallidas` para leerlo sin el closure del render (un envío y un reintento en el mismo tick). */
  const fallidasRef = useRef<Fallidas>(SIN_FALLIDAS)
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

  const marcar = useCallback((roundId: string, hole: number, fotoFallida: HoleStatPatch | null) => {
    const prev = fallidasRef.current
    const deRonda = prev.get(roundId)
    if (!fotoFallida && !deRonda?.has(hole)) return
    const hoyos = new Map(deRonda)
    if (fotoFallida) hoyos.set(hole, { ...deRonda?.get(hole), ...fotoFallida })
    else hoyos.delete(hole)
    const next = new Map(prev)
    if (hoyos.size) next.set(roundId, hoyos)
    else next.delete(roundId)
    fallidasRef.current = next
    setFallidas(next)
  }, [])

  /** Stats que fallaron en el hoyo y que lo tocado de la tarjeta ya no trae (se soltó al cambiar de jugador). */
  const faltantes = useCallback(
    (roundId: string, hole: number, presentes: HoleStatPatch): HoleStatPatch => {
      const guardada = fallidasRef.current.get(roundId)?.get(hole)
      if (!guardada) return {}
      return Object.fromEntries(Object.entries(guardada).filter(([k]) => !(k in presentes))) as HoleStatPatch
    },
    [],
  )

  /** Foto del hoyo para un envío: lo tocado + lo que falló antes y ya no está tocado, con `patch` encima. */
  const fotoParaEnviar = useCallback(
    (roundId: string, hole: number, patch: HoleStatPatch = {}) => {
      const presentes = leerTocadas(statsTocadasRef.current, roundId, hole).foto
      return fotoStatsDelHoyo(roundId, hole, { ...faltantes(roundId, hole, { ...presentes, ...patch }), ...patch })
    },
    [statsTocadasRef, fotoStatsDelHoyo, faltantes],
  )

  /** Lo mismo sin fijar nada (para el deshacer). */
  const leerParaEnviar = useCallback(
    (roundId: string, hole: number) => {
      const { foto, versiones } = leerTocadas(statsTocadasRef.current, roundId, hole)
      return { foto: { ...faltantes(roundId, hole, foto), ...foto }, versiones }
    },
    [statsTocadasRef, faltantes],
  )

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
        // tres toasts apilados justo cuando el organizador tiene menos tiempo para leerlos. Con el nombre: el
        // envío diferido de A puede fallar con la tarjeta de B abierta.
        avisados.current.add(aviso)
        const jugador = players.find((p) => p.id === playerId)
        const nombre = jugador ? resolveLegacyPlayerName(jugador) : 'un jugador'
        showWarning('No se guardó', `Las estadísticas de ${nombre} en el hoyo ${hole} no quedaron registradas. Reintenta desde su tarjeta.`)
      }
      if (res.ok) avisados.current.delete(aviso)
      if (ultimoEnvio.current.get(clave) === id) marcar(roundId, hole, res.ok ? null : foto)
      return res.ok
    },
    [tournament, players, parDelHoyo, confirmarStats, showWarning, marcar],
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

  /** Golpe con que sale un envío de stats: el último que se mandó al hoyo, si todavía no está en pantalla (un
   *  deshacer en vuelo); si no, el de la pantalla. Sin esto, un GIR tocado durante el deshacer volvía a escribir el
   *  golpe deshecho con una secuencia más nueva, y la base quedaba con él. */
  const grossDelHoyo = useCallback(
    (roundId: string, hole: number) => {
      const escrito = grossEscritoRef.current.get(`${roundId}:${hole}`)
      return escrito ? escrito.valor : (scoresRef.current[hole] ?? null)
    },
    [grossEscritoRef],
  )

  /** Fija `patch` y lo envía YA con la foto del hoyo (putts al salir del campo, reintento). Multi-ronda: contra la
   *  ronda ACTIVA, no `rounds[0]`. */
  const saveHoleStat = useCallback(
    async (hole: number, patch: HoleStatPatch): Promise<boolean> => {
      const d = destino(hole)
      if (!d) return false
      const { foto, versiones } = fotoParaEnviar(d.roundId, hole, patch)
      if (Object.keys(foto).length === 0) {
        // Reintento sin nada que mandar: se dice, no se finge un guardado.
        marcar(d.roundId, hole, null)
        showWarning('Nada que reenviar', `El hoyo ${hole} no tiene estadísticas pendientes. Si faltan, márcalas de nuevo.`)
        return false
      }
      const gross = grossDelHoyo(d.roundId, hole)
      if (gross == null) return false
      return enviar(d.roundId, d.playerId, hole, gross, foto, versiones)
    },
    [destino, fotoParaEnviar, grossDelHoyo, enviar, marcar, showWarning],
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
        const gross = grossDelHoyo(d.roundId, hole)
        if (gross == null) return
        const { foto, versiones } = leerParaEnviar(d.roundId, hole)
        void enviar(d.roundId, d.playerId, hole, gross, foto, versiones)
      }
      pendientes.current.set(clave, { timer: setTimeout(salir, ESPERA_ENVIO_STAT_MS), enviar: salir })
    },
    [destino, fotoStatsDelHoyo, grossDelHoyo, leerParaEnviar, enviar],
  )

  /** Envía ya lo que estaba esperando. Se llama ANTES de soltar la tarjeta (cambio de jugador, cerrar) y antes de
   *  cualquier escritura del hoyo (deshacer, cerrar la tarjeta): el envío diferido tiene que salir ANTES, o su
   *  secuencia más nueva pisa esa escritura en el servidor. */
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
  useEffect(() => {
    // iOS suspende los timers con la app en segundo plano: lo que esperaba sale al irse.
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') enviarPendientesRef.current()
    }
    document.addEventListener('visibilitychange', alOcultar)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      enviarPendientesRef.current()
    }
  }, [])

  /** Al abrir la tarjeta de la ronda: lo que falló vuelve a quedar tocado (se ve en pantalla y viaja al reintentar). */
  const retomarFallidas = useCallback(
    (roundId: string) => {
      for (const [hole, foto] of fallidasRef.current.get(roundId) ?? []) fotoStatsDelHoyo(roundId, hole, foto)
    },
    [fotoStatsDelHoyo],
  )

  /** El golpe del hoyo se guardó con la foto de stats: lo que estaba fallido viajó con él. */
  const statsGuardadas = useCallback((roundId: string, hole: number) => marcar(roundId, hole, null), [marcar])

  const roundId = getActiveRound(players.find((p) => p.id === selectedId))?.id ?? null
  const deRonda = roundId ? fallidas.get(roundId) : undefined
  const statsFallidas = useMemo<ReadonlySet<number>>(() => (deRonda ? new Set(deRonda.keys()) : NINGUNO), [deRonda])

  return {
    saveHoleStat, cambiarStat, enviarPendientes, statsGuardadas, statsFallidas, fotoParaEnviar, leerParaEnviar,
    retomarFallidas,
  }
}
