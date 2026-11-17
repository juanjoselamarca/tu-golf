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
import {
  avisoSinAcceso, clasificarRespuestaScore, esSinAcceso, STATUS_CON_CODE,
  type AvisoSinAcceso, type LecturaRespuestaScore, type MotivoSinAcceso, type ResultadoGuardadoTorneo,
} from './acceso-guardado'

export type EstadoGuardado = 'idle' | 'saving' | 'saved' | 'offline' | 'error' | 'sin_acceso'

/** Intentos por hoyo ante red caída / 5xx / 429, con espera creciente (400 ms, 800 ms). */
export const INTENTOS_POR_HOYO = 3
const ESPERA_BASE_MS = 400

const estaOnline = () => typeof navigator === 'undefined' || navigator.onLine

type Golpes = Record<number, number>

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
 * - 401/403 → aviso con salida (`avisoSinAcceso`), SIN "reintentando" y con la cola conservada;
 *   se reenvía sola al volver a abrir la tarjeta. Un 403 `guest_not_owner` se reintenta una vez sin
 *   headers de invitado (guestId viejo en un teléfono que hoy anota con cuenta).
 * - red/5xx/429 → reintenta y deja la cola para el próximo `online`.
 *
 * Lo que el servidor ya tiene (`confirmadosRef`: lo leído al cargar + cada "ok") no se vuelve a
 * mandar: el respaldo local guarda la tarjeta ENTERA, y reenviarla completa en cada hoyo eran
 * decenas de POST por minuto por jugador (429 y avisos falsos, como el 04-oct-2026). La cola sólo
 * se marca enviada cuando todo el respaldo coincide con lo confirmado.
 */
export function useGuardadoTorneo(args: UseGuardadoTorneoArgs) {
  const { slug, tournament, player, roundId, contextoListo, hoyosRonda, holeCount, courseHcpDe, bloqueado, guestId, guestToken, onRondaCerrada, onInvitadoCompleto } = args
  const scoreSync = useScoreSync(slug, roundId)

  const [currentScores, setCurrentScores] = useState<Golpes>({})
  const [savedHoles, setSavedHoles] = useState<Set<number>>(new Set())
  const [isOnline, setIsOnline] = useState(true)
  const [saveStatus, setSaveStatus] = useState<EstadoGuardado>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  /** El servidor no acepta a quien anota (401/403): aviso honesto con salida, sin "reintentando". */
  const [sinAcceso, setSinAcceso] = useState<AvisoSinAcceso | null>(null)
  /** El torneo dejó de aceptar scores (cerrado/cancelado): tarjeta deshabilitada y UN aviso. */
  const [torneoInactivo, setTorneoInactivo] = useState(false)
  /** Tarjeta cuya carga terminó (lo del servidor ya está en `confirmadosRef`). */
  const [tarjetaCargada, setTarjetaCargada] = useState<string | null>(null)

  /** Golpes que el servidor ya tiene en ESTA tarjeta (hoyo → gross). */
  const confirmadosRef = useRef<Golpes>({})
  /** Golpes viajando ahora (hoyo → gross): otro envío no los duplica. */
  const enVueloRef = useRef<Map<number, number>>(new Map())
  /** Tarjeta con un reenvío en curso (por tarjeta: el de la anterior no bloquea a la nueva). */
  const reenvioEnCursoRef = useRef<string | null>(null)
  /** Tarjeta abierta ahora: lo que vuelve de un envío de otra tarjeta no toca la pantalla. */
  const tarjetaVigenteRef = useRef<string | null>(roundId)
  /** Un 403 `guest_not_owner` se resolvió sin headers de invitado: el teléfono anota con cuenta. */
  const sinHeadersInvitadoRef = useRef(false)
  /** Tarjeta cuyo reenvío al abrir ya arrancó (uno por apertura). */
  const reenviadoAlAbrirRef = useRef<string | null>(null)
  const anotaComoInvitado = useCallback(() => !!guestId && !!guestToken && !sinHeadersInvitadoRef.current, [guestId, guestToken])

  // Al cambiar de tarjeta (otro jugador u otra ronda) todo lo visible y lo confirmado es de la anterior.
  useEffect(() => {
    tarjetaVigenteRef.current = roundId
    confirmadosRef.current = {}
    enVueloRef.current = new Map()
    // Cada tarjeta prueba de nuevo con los headers de invitado y vuelve a reenviar al abrirse
    // (A → "Cambiar jugador" → A sin recargar). Hasta que cargue no se sabe qué tiene el servidor.
    sinHeadersInvitadoRef.current = false
    reenviadoAlAbrirRef.current = null
    setTarjetaCargada(null)
    setSavedHoles(new Set())
    setSinAcceso(null)
    setSaveError(null)
    setSaveStatus('idle')
  }, [roundId])

  /* ── Carga de la tarjeta: lo del servidor + lo que quedó en el teléfono sin confirmar ── */
  useEffect(() => {
    // "Cambiar jugador": la tarjeta queda vacía hasta elegir de nuevo.
    if (!player) { setCurrentScores({}); return }
    let cancelled = false
    void (async () => {
      if (!roundId) { setCurrentScores({}); return }
      const map: Golpes = {}
      try {
        const data = await fetchRoundHoleScores(createClient(), roundId)
        Object.assign(map, grossPorHoyo(data))
      } catch (e) {
        void captureError(e, { context: 'torneo.score.loadScores', meta: { slug, roundId } })
      }
      if (cancelled) return
      confirmadosRef.current = { ...confirmadosRef.current, ...map }
      // Lo pendiente (offline / guardado fallido) se mezcla para que ningún golpe se pierda al recargar.
      const pendiente = leerRespaldoPendiente(slug, roundId)
      if (pendiente) {
        Object.entries(pendiente).forEach(([h, g]) => { map[Number(h)] = Number(g) })
        // No pisa el aviso de "sin acceso": ese golpe NO se está reintentando.
        setSaveStatus(prev => prev === 'sin_acceso' ? prev : estaOnline() ? 'error' : 'offline')
      }
      setCurrentScores(map)
      setTarjetaCargada(roundId)
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

  const postScore = useCallback(async (body: object, conInvitado: boolean): Promise<LecturaRespuestaScore> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (conInvitado && guestId && guestToken) {
      headers['x-guest-id'] = guestId
      headers['x-guest-token'] = guestToken
    }
    const res = await fetch('/api/game', { method: 'POST', headers, body: JSON.stringify(body) })
    const code = STATUS_CON_CODE.includes(res.status)
      ? ((await res.json().catch(() => ({}))) as { code?: string }).code
      : undefined
    return clasificarRespuestaScore(res.status, code)
  }, [guestId, guestToken])

  /** Envía UN hoyo y lo registra como confirmado / en vuelo. */
  const enviarHoyo = useCallback(async (
    tourneyId: string, ronda: string, holeNumber: number, gross: number, par: number, netScore: number, points: number,
  ): Promise<ResultadoGuardadoTorneo> => {
    const body = { action: 'upsert_score', tournament_id: tourneyId, round_id: ronda, hole_number: holeNumber, par, gross_score: gross, net_score: netScore, points }
    const enVuelo = enVueloRef.current
    enVuelo.set(holeNumber, gross)
    try {
      for (let intento = 1; intento <= INTENTOS_POR_HOYO; intento++) {
        try {
          const conInvitado = anotaComoInvitado()
          let r = await postScore(body, conInvitado)
          if (r === 'invitado_no_dueno' || r === 'invitado_token_invalido') {
            // Token roto → "tu acceso de invitado ya no sirve". Token sano con la tarjeta de otro →
            // "esta tarjeta no está a tu nombre" (eligió mal en "¿Quién eres?"; su acceso está bien).
            const motivo = r === 'invitado_token_invalido' ? 'invitado_sin_acceso' : 'sin_permiso'
            if (!conInvitado) return motivo
            // UNA vez sin headers de invitado: si el teléfono tiene sesión con cuenta, entra por ahí.
            r = await postScore(body, false)
            if (r === 'ok') sinHeadersInvitadoRef.current = true
            else if (r === 'sin_sesion' || r === 'invitado_no_dueno' || r === 'invitado_token_invalido') return motivo
          }
          if (r !== 'reintentar') {
            if (r === 'ok' && tarjetaVigenteRef.current === ronda) {
              confirmadosRef.current[holeNumber] = gross
              // Llegó un valor que ya no es el anotado (reintento viejo que entró después de la
              // corrección): el servidor quedó con el viejo. La cola vuelve a pendiente para que el
              // valor vigente se reenvíe aunque ya se hubiera marcado enviada.
              const local = scoreSync.obtenerLocal()
              if (local && local[holeNumber] !== undefined && local[holeNumber] !== gross) scoreSync.guardarLocal(local)
            }
            return r
          }
        } catch {
          // red caída: se reintenta
        }
        if (intento < INTENTOS_POR_HOYO) await new Promise(res => setTimeout(res, ESPERA_BASE_MS * intento))
      }
      return 'error'
    } finally {
      if (enVuelo.get(holeNumber) === gross) enVuelo.delete(holeNumber)
    }
  }, [postScore, anotaComoInvitado, scoreSync])

  const marcarSinAcceso = useCallback((motivo: MotivoSinAcceso) => {
    setSaveStatus('sin_acceso')
    setSinAcceso(avisoSinAcceso({ slug, motivo, jugadorId: player?.id }))
  }, [slug, player?.id])

  /** Hoyos del respaldo que el servidor no tiene y que no están viajando. */
  const porEnviar = useCallback((local: Golpes): Golpes => {
    const out: Golpes = {}
    for (const [h, g] of Object.entries(local)) {
      const hoyo = Number(h)
      if (confirmadosRef.current[hoyo] === g || enVueloRef.current.get(hoyo) === g) continue
      out[hoyo] = g
    }
    return out
  }, [])

  /** El respaldo coincide entero con lo confirmado: se marca enviado sin tocar la red. */
  const cerrarSiTodoConfirmado = useCallback((local: Golpes | null): boolean => {
    if (!local) return true
    const todo = Object.entries(local).every(([h, g]) => confirmadosRef.current[Number(h)] === g)
    if (todo) scoreSync.marcarSincronizado(local)
    return todo
  }, [scoreSync])

  /**
   * Reenvía SÓLO lo que falta de la cola local (al reconectar, al abrir la tarjeta, o tras un "ok"
   * con hoyos sin confirmar). Devuelve false si no pudo arrancar porque ya hay uno en curso.
   * `avisar`: toast "Sincronizado" (no cuando lo dispara el guardado de un hoyo).
   */
  const reenviarPendientes = useCallback(async (opciones: { avisar?: boolean } = {}): Promise<boolean> => {
    const avisar = opciones.avisar ?? true
    if (!tournament || !roundId || !player || !contextoListo) return true
    if (!scoreSync.tienePendientes()) return true
    if (reenvioEnCursoRef.current === roundId) return false
    const local = scoreSync.obtenerLocal()
    if (!local) return true
    reenvioEnCursoRef.current = roundId
    const vigente = () => tarjetaVigenteRef.current === roundId
    let otraVuelta = false
    try {
      const faltan = porEnviar(local)
      let failed = 0
      let enviados = 0
      for (const [h, g] of Object.entries(faltan)) {
        const holeNumber = Number(h)
        const p = puntajeDe(holeNumber, g, player)
        if (!p) return true
        const resultado = await enviarHoyo(tournament.id, roundId, holeNumber, g, p.par, p.neto, p.puntos)
        if (resultado === 'closed') {
          // Tarjeta cerrada: lo pendiente no tiene a dónde ir. Se descarta y se recarga el roster.
          // Si ya se cambió de tarjeta, el aviso y la recarga serían sobre otra: sólo se descarta.
          scoreSync.marcarSincronizado()
          if (!vigente()) return true
          addToast({ type: 'error', title: 'Ronda cerrada', message: 'El organizador cerró esta ronda. Los scores pendientes no se guardaron.', duration: 6000 })
          onRondaCerrada()
          return true
        }
        if (resultado === 'inactive') {
          scoreSync.marcarSincronizado()
          setTorneoInactivo(true)
          if (!vigente()) return true
          addToast({ type: 'error', title: 'Torneo cerrado', message: 'El torneo ya no acepta scores. Los scores pendientes no se guardaron.', duration: 6000 })
          return true
        }
        if (esSinAcceso(resultado)) {
          // La cola se conserva: se reenvía al volver a abrir la tarjeta con acceso.
          if (vigente()) marcarSinAcceso(resultado)
          return true
        }
        if (resultado !== 'ok') failed++
        else {
          enviados++
          if (vigente()) setSavedHoles(prev => new Set(prev).add(holeNumber))
        }
      }
      if (!vigente()) return true
      if (failed === 0) {
        if (cerrarSiTodoConfirmado(local)) {
          setSinAcceso(null)
          setSaveStatus('saved')
          if (avisar && enviados > 0) addToast({ type: 'success', title: 'Sincronizado', message: `${enviados} hoyos guardados`, duration: 3000 })
        }
        // Se anotó otro hoyo mientras se reenviaba: la cola cambió y puede faltar algo.
        otraVuelta = scoreSync.tienePendientes() && Object.keys(porEnviar(scoreSync.obtenerLocal() ?? {})).length > 0
      } else {
        setSaveStatus('error')
      }
    } finally {
      if (reenvioEnCursoRef.current === roundId) reenvioEnCursoRef.current = null
    }
    if (otraVuelta) await reenviarPendientes({ avisar })
    return true
  }, [tournament, roundId, player, contextoListo, scoreSync, porEnviar, puntajeDe, enviarHoyo, onRondaCerrada, marcarSinAcceso, cerrarSiTodoConfirmado])

  /** Guarda el hoyo anotado (onBlur del input). */
  const guardarHoyo = useCallback(async (holeNumber: number, value: string) => {
    const gross = parseInt(value)
    if (isNaN(gross) || gross < 1 || gross > 20 || !tournament || !player || !roundId || bloqueado || torneoInactivo) return
    // Sin la cancha de la ronda resuelta NO se escribe: el neto quedaría con el par/slope de otra cancha.
    if (!contextoListo) return
    const p = puntajeDe(holeNumber, gross, player)
    if (!p) return

    // Antes de terminar la carga, `currentScores` todavía no tiene lo que quedó en el teléfono:
    // guardar sólo este hoyo pisaría ese respaldo y se perderían golpes sin enviar.
    const pendienteSinCargar = tarjetaCargada === roundId ? null : leerRespaldoPendiente(slug, roundId)
    const nextScores = { ...(pendienteSinCargar ?? {}), ...currentScores, [holeNumber]: gross }
    setCurrentScores(nextScores)
    scoreSync.guardarLocal(nextScores)

    if (!isOnline) {
      setSaveStatus('offline')
      return
    }

    setSaveStatus('saving')
    setSaveError(null)
    const resultado = await enviarHoyo(tournament.id, roundId, holeNumber, gross, p.par, p.neto, p.puntos)
    // Se cambió de tarjeta mientras viajaba: el respaldo de ESA tarjeta se maneja abajo vía su
    // propio scoreSync, pero la pantalla ya es de otra.
    const vigente = tarjetaVigenteRef.current === roundId
    if (resultado === 'closed') {
      // La ronda se cerró mientras se escribía: no se encola (no hay a dónde) y se recarga el roster.
      scoreSync.marcarSincronizado()
      if (!vigente) return
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
    if (!vigente) return
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
      // Cola al día → se marca sin red. Si falta algo que no está viajando, se manda SÓLO eso.
      const local = scoreSync.obtenerLocal()
      // Antes de terminar la carga no se sabe qué tiene el servidor: el reenvío al abrir lo cubre.
      if (tarjetaCargada === roundId && !cerrarSiTodoConfirmado(local) && Object.keys(porEnviar(local ?? {})).length > 0) {
        void reenviarPendientes({ avisar: false })
      }
      if (anotaComoInvitado() && Object.keys(nextScores).length >= holeCount) onInvitadoCompleto()
      return
    }
    setSaveStatus('error')
    addToast({ type: 'error', title: `Error hoyo ${holeNumber}`, message: 'Score guardado localmente. Se sincronizará al recuperar la conexión.', duration: 6000 })
    setSaveError(`Error guardando hoyo ${holeNumber}. Reintentando al reconectar.`)
  }, [tournament, player, roundId, bloqueado, torneoInactivo, contextoListo, puntajeDe, scoreSync, currentScores, isOnline, enviarHoyo, onRondaCerrada, marcarSinAcceso, cerrarSiTodoConfirmado, porEnviar, reenviarPendientes, holeCount, onInvitadoCompleto, anotaComoInvitado, tarjetaCargada, slug])

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
  // llegar. El candado de reenvío es POR TARJETA: uno de la tarjeta anterior todavía en curso no
  // bloquea este. Si lo bloquea uno de ESTA misma tarjeta, ese ya está mandando la cola (y repasa
  // lo anotado mientras tanto), así que darlo por hecho es correcto.
  // Espera a que termine la carga: antes no se sabe qué tiene el servidor y se reenviaría todo.
  const listo = !!tournament && !!roundId && !!player && contextoListo && tarjetaCargada === roundId
  useEffect(() => {
    if (!listo || !roundId || reenviadoAlAbrirRef.current === roundId || !estaOnline()) return
    reenviadoAlAbrirRef.current = roundId
    void reenviarPendientes()
  }, [listo, roundId, reenviarPendientes])

  /** Hoyos en la cola local (badge "Offline — N en cola" / "Reintentando (N)"). */
  const hoyosEnCola = useCallback(() => Object.keys(scoreSync.obtenerLocal() ?? {}).length, [scoreSync])

  return {
    currentScores, savedHoles, isOnline, saveStatus, saveError, limpiarSaveError: () => setSaveError(null),
    sinAcceso, torneoInactivo, guardarHoyo, hoyosEnCola,
  }
}
