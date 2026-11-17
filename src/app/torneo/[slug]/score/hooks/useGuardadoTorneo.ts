'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { addToast } from '@/hooks/useToast'
import { useScoreSync } from '@/hooks/useScoreSync'
import { leerRespaldoPendiente } from '@/lib/ronda/respaldo-local'
import { grossPorHoyo, puntajeDeHoyo } from '@/golf/core/hole-scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import type { CourseHole } from '@/golf/leaderboard/types'
import { fetchRoundHoleScores, type ScoringPlayer, type ScoringTournament } from '@/lib/data/tournaments/scoring'
import { avisoSinAcceso, clasificarRespuestaScore, esSinAcceso, type AvisoSinAcceso, type ResultadoGuardadoTorneo } from './acceso-guardado'

export type EstadoGuardado = 'idle' | 'saving' | 'saved' | 'offline' | 'error' | 'sin_acceso'

/** Intentos por hoyo ante red caída / 5xx / 429, con espera creciente (400 ms, 800 ms). */
export const INTENTOS_POR_HOYO = 3
const ESPERA_BASE_MS = 400

const estaOnline = () => typeof navigator === 'undefined' || navigator.onLine

export interface UseGuardadoTorneoArgs {
  slug: string
  tournament: ScoringTournament | null
  /** Jugador elegido en "¿Quién eres?" (undefined mientras no elige). */
  player: ScoringPlayer | undefined
  /** La tarjeta ACTIVA del jugador (`useRondaActivaDelJugador`); clave del respaldo local. */
  roundId: string | null
  /** La cancha de la ronda está resuelta: sin ella no se escribe (el neto saldría de otra cancha). */
  contextoListo: boolean
  hoyosRonda: CourseHole[]
  holeCount: number
  courseHcpDe: (player: ScoringPlayer) => number
  /** Tarjeta cerrada o torneo que todavía/ya no acepta scores: no se escribe. */
  bloqueado: boolean
  guestId: string | null
  guestToken: string | null
  /** La ronda se cerró mientras se anotaba: recargar el roster (puede venir la siguiente). */
  onRondaCerrada: () => void
  /** El invitado guardó todos los hoyos (modal de registro). */
  onInvitadoCompleto: () => void
}

/**
 * Guardado del scorer del torneo: carga de la tarjeta (servidor + respaldo local), envío por hoyo
 * a `/api/game`, cola local y reenvío al reconectar o al volver a abrir la tarjeta.
 *
 * Respuestas del servidor (fuente única `clasificarRespuestaScore`):
 * - 409 → la tarjeta/torneo no acepta más: se descarta la cola con un aviso.
 * - 401/403 → el servidor no reconoce a quien anota: aviso con salida (`avisoSinAcceso`), SIN
 *   "reintentando" y con la cola conservada; se reenvía sola al volver a abrir la tarjeta.
 * - red/5xx/429 → reintenta y deja la cola para el próximo `online`.
 *
 * La cola sólo se marca enviada con la MISMA tarjeta que se envió (`marcarSincronizado(enviados)`):
 * un hoyo anotado mientras viajaba otro, o uno que falló antes, nunca queda marcado sin llegar.
 */
export function useGuardadoTorneo(args: UseGuardadoTorneoArgs) {
  const { slug, tournament, player, roundId, contextoListo, hoyosRonda, holeCount, courseHcpDe, bloqueado, guestId, guestToken, onRondaCerrada, onInvitadoCompleto } = args
  const isGuest = !!guestId && !!guestToken
  const scoreSync = useScoreSync(slug, roundId)

  const [currentScores, setCurrentScores] = useState<Record<number, number>>({})
  const [savedHoles, setSavedHoles] = useState<Set<number>>(new Set())
  const [isOnline, setIsOnline] = useState(true)
  const [saveStatus, setSaveStatus] = useState<EstadoGuardado>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  /** El servidor no reconoce a quien anota (401/403): aviso honesto con salida, sin "reintentando". */
  const [sinAcceso, setSinAcceso] = useState<AvisoSinAcceso | null>(null)
  /** El torneo dejó de aceptar scores (cerrado/cancelado): tarjeta deshabilitada y UN aviso. */
  const [torneoInactivo, setTorneoInactivo] = useState(false)

  // Al cambiar de tarjeta (otro jugador u otra ronda), los "✓ guardado" y el aviso son de la anterior.
  useEffect(() => {
    setSavedHoles(new Set())
    setSinAcceso(null)
  }, [roundId])

  /* ── Carga de la tarjeta: lo del servidor + lo que quedó en el teléfono sin confirmar ── */
  useEffect(() => {
    // "Cambiar jugador": la tarjeta queda vacía hasta elegir de nuevo.
    if (!player) { setCurrentScores({}); return }
    let cancelled = false
    void (async () => {
      if (!roundId) { setCurrentScores({}); return }
      const map: Record<number, number> = {}
      try {
        const data = await fetchRoundHoleScores(createClient(), roundId)
        Object.assign(map, grossPorHoyo(data))
      } catch (e) {
        void captureError(e, { context: 'torneo.score.loadScores', meta: { slug, roundId } })
      }
      if (cancelled) return
      // Lo pendiente (offline / guardado fallido) se mezcla para que ningún golpe se pierda al recargar.
      const pendiente = leerRespaldoPendiente(slug, roundId)
      if (pendiente) {
        Object.entries(pendiente).forEach(([h, g]) => { map[Number(h)] = Number(g) })
        // No pisa el aviso de "sin acceso": ese golpe NO se está reintentando.
        setSaveStatus(prev => prev === 'sin_acceso' ? prev : estaOnline() ? 'error' : 'offline')
      }
      setCurrentScores(map)
    })()
    return () => { cancelled = true }
  }, [player, roundId, slug])

  /** Neto y puntos del hoyo con la cancha de LA RONDA (mismo cálculo al anotar y al reenviar). */
  const puntajeDe = useCallback((holeNumber: number, gross: number, jugador: ScoringPlayer) => {
    if (!tournament) return null
    const par = hoyosRonda.find(h => h.numero === holeNumber)?.par ?? 4
    const si = normalizedStrokeIndexByHole(hoyosRonda, holeCount)[holeNumber] ?? holeNumber
    const { neto, puntos } = puntajeDeHoyo({
      gross, par, courseHandicap: courseHcpDe(jugador), strokeIndex: si, holeCount,
      formato: tournament, modo: tournament.modo_juego,
    })
    return { par, neto, puntos }
  }, [tournament, hoyosRonda, holeCount, courseHcpDe])

  const enviarHoyo = useCallback(async (
    tourneyId: string, ronda: string, holeNumber: number, gross: number, par: number, netScore: number, points: number,
  ): Promise<ResultadoGuardadoTorneo> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (guestId && guestToken) {
      headers['x-guest-id'] = guestId
      headers['x-guest-token'] = guestToken
    }
    for (let intento = 1; intento <= INTENTOS_POR_HOYO; intento++) {
      try {
        const res = await fetch('/api/game', {
          method: 'POST', headers,
          body: JSON.stringify({ action: 'upsert_score', tournament_id: tourneyId, round_id: ronda, hole_number: holeNumber, par, gross_score: gross, net_score: netScore, points }),
        })
        // 409 y 401/403 no cambian reintentando: se devuelven al tiro. El `code` del 409
        // distingue la ronda cerrada (puede venir otra) del torneo inactivo.
        const code = res.status === 409 ? ((await res.json().catch(() => ({}))) as { code?: string }).code : undefined
        const resultado = clasificarRespuestaScore(res.status, code)
        if (resultado !== 'reintentar') return resultado
      } catch {
        // red caída: se reintenta
      }
      if (intento < INTENTOS_POR_HOYO) await new Promise(r => setTimeout(r, ESPERA_BASE_MS * intento))
    }
    return 'error'
  }, [guestId, guestToken])

  const marcarSinAcceso = useCallback((motivo: Parameters<typeof avisoSinAcceso>[0]['motivo']) => {
    setSaveStatus('sin_acceso')
    setSinAcceso(avisoSinAcceso({ esInvitado: isGuest, slug, motivo }))
  }, [isGuest, slug])

  /** Reenvía la cola local de la tarjeta (al reconectar, al abrirla, o tras un guardado con cola previa). */
  const reenviarPendientes = useCallback(async (): Promise<void> => {
    if (!tournament || !roundId || !player || !contextoListo) return
    if (!scoreSync.tienePendientes() || scoreSync.syncInProgressRef.current) return
    const pending = scoreSync.obtenerLocal()
    if (!pending) return
    scoreSync.syncInProgressRef.current = true
    let otraVuelta = false
    try {
      let failed = 0
      for (const [h, g] of Object.entries(pending)) {
        const holeNumber = Number(h)
        const p = puntajeDe(holeNumber, g, player)
        if (!p) return
        const resultado = await enviarHoyo(tournament.id, roundId, holeNumber, g, p.par, p.neto, p.puntos)
        if (resultado === 'closed') {
          // Tarjeta cerrada: lo pendiente no tiene a dónde ir. Se descarta y se recarga el roster.
          scoreSync.marcarSincronizado()
          addToast({ type: 'error', title: 'Ronda cerrada', message: 'El organizador cerró esta ronda. Los scores pendientes no se guardaron.', duration: 6000 })
          onRondaCerrada()
          return
        }
        if (resultado === 'inactive') {
          scoreSync.marcarSincronizado()
          setTorneoInactivo(true)
          addToast({ type: 'error', title: 'Torneo cerrado', message: 'El torneo ya no acepta scores. Los scores pendientes no se guardaron.', duration: 6000 })
          return
        }
        if (esSinAcceso(resultado)) {
          // La cola se conserva: se reenvía al volver a abrir la tarjeta con acceso.
          marcarSinAcceso(resultado)
          return
        }
        if (resultado !== 'ok') failed++
        else setSavedHoles(prev => new Set(prev).add(holeNumber))
      }
      if (failed === 0) {
        scoreSync.marcarSincronizado(pending)
        setSinAcceso(null)
        setSaveStatus('saved')
        addToast({ type: 'success', title: 'Sincronizado', message: `${Object.keys(pending).length} hoyos guardados`, duration: 3000 })
        // Se anotó otro hoyo mientras se reenviaba: la cola cambió y sigue pendiente.
        otraVuelta = scoreSync.tienePendientes()
      } else {
        setSaveStatus('error')
      }
    } finally {
      scoreSync.syncInProgressRef.current = false
    }
    if (otraVuelta) await reenviarPendientes()
  }, [tournament, roundId, player, contextoListo, scoreSync, puntajeDe, enviarHoyo, onRondaCerrada, marcarSinAcceso])

  /** Guarda el hoyo anotado (onBlur del input). */
  const guardarHoyo = useCallback(async (holeNumber: number, value: string) => {
    const gross = parseInt(value)
    if (isNaN(gross) || gross < 1 || gross > 20 || !tournament || !player || !roundId || bloqueado || torneoInactivo) return
    // Sin la cancha de la ronda resuelta NO se escribe: el neto quedaría con el par/slope de otra cancha.
    if (!contextoListo) return
    const p = puntajeDe(holeNumber, gross, player)
    if (!p) return

    // ¿Quedaba algo sin confirmar ANTES de este hoyo? Entonces su "ok" no confirma la tarjeta entera.
    const habiaPendiente = scoreSync.tienePendientes()
    const nextScores = { ...currentScores, [holeNumber]: gross }
    setCurrentScores(nextScores)
    scoreSync.guardarLocal(nextScores)

    if (!isOnline) {
      setSaveStatus('offline')
      return
    }

    setSaveStatus('saving')
    setSaveError(null)
    const resultado = await enviarHoyo(tournament.id, roundId, holeNumber, gross, p.par, p.neto, p.puntos)
    if (resultado === 'closed') {
      // La ronda se cerró mientras se escribía: no se encola (no hay a dónde) y se recarga el roster.
      scoreSync.marcarSincronizado()
      setSaveStatus('idle')
      addToast({ type: 'error', title: 'Ronda cerrada', message: 'El organizador cerró esta ronda. El score no se guardó.', duration: 6000 })
      onRondaCerrada()
      return
    }
    if (resultado === 'inactive') {
      scoreSync.marcarSincronizado()
      setSaveStatus('idle')
      if (!torneoInactivo) {
        setTorneoInactivo(true)
        addToast({ type: 'error', title: 'Torneo cerrado', message: 'El torneo ya no acepta scores. El score no se guardó.', duration: 6000 })
      }
      return
    }
    if (esSinAcceso(resultado)) {
      // Reintentar ahora no sirve, pero el golpe se CONSERVA en el teléfono: la carga lo vuelve a
      // mostrar y se reenvía solo al volver a abrir la tarjeta con acceso. El aviso dice eso.
      marcarSinAcceso(resultado)
      return
    }
    if (resultado === 'ok') {
      setSavedHoles(prev => new Set(prev).add(holeNumber))
      setSaveStatus('saved')
      setSinAcceso(null)
      if (habiaPendiente) void reenviarPendientes()
      else scoreSync.marcarSincronizado(nextScores)
      if (isGuest && Object.keys(nextScores).length >= holeCount) onInvitadoCompleto()
      return
    }
    setSaveStatus('error')
    addToast({ type: 'error', title: `Error hoyo ${holeNumber}`, message: 'Score guardado localmente. Se sincronizará al recuperar la conexión.', duration: 6000 })
    setSaveError(`Error guardando hoyo ${holeNumber}. Reintentando al reconectar.`)
  }, [tournament, player, roundId, bloqueado, torneoInactivo, contextoListo, puntajeDe, scoreSync, currentScores, isOnline, enviarHoyo, onRondaCerrada, marcarSinAcceso, reenviarPendientes, isGuest, holeCount, onInvitadoCompleto])

  /* ── Online/offline: los listeners se registran UNA vez y llaman a la versión vigente ── */
  const reenviarRef = useRef(reenviarPendientes)
  useEffect(() => { reenviarRef.current = reenviarPendientes }, [reenviarPendientes])
  useEffect(() => {
    const up = () => { setIsOnline(true); void reenviarRef.current() }
    const down = () => { setIsOnline(false); setSaveStatus('offline') }
    setIsOnline(estaOnline())
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  // Al abrir la tarjeta con conexión y cola pendiente (p. ej. golpes que quedaron en el teléfono tras
  // un 401 y el jugador volvió a entrar) se reenvía UNA vez por tarjeta: el evento `online` no va a
  // llegar. Una sola vez: los cambios de identidad del roster/cancha no disparan reenvíos repetidos.
  const listo = !!tournament && !!roundId && !!player && contextoListo
  const reenviadoAlAbrirRef = useRef<string | null>(null)
  useEffect(() => {
    if (!listo || !roundId || reenviadoAlAbrirRef.current === roundId) return
    reenviadoAlAbrirRef.current = roundId
    if (estaOnline()) void reenviarPendientes()
  }, [listo, roundId, reenviarPendientes])

  /** Hoyos en la cola local (badge "Offline — N en cola" / "Reintentando (N)"). */
  const hoyosEnCola = useCallback(() => Object.keys(scoreSync.obtenerLocal() ?? {}).length, [scoreSync])

  return {
    currentScores, savedHoles, isOnline, saveStatus, saveError, limpiarSaveError: () => setSaveError(null),
    sinAcceso, torneoInactivo, guardarHoyo, hoyosEnCola,
  }
}
