'use client'

import { useCallback, useRef, useState } from 'react'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { finalizarRondaLibre } from '@/lib/data/ronda-libre-scores'
import { conPlazoCancelable } from '@/lib/red/con-timeout'
import { clienteConSenal } from '@/lib/red/cliente-con-senal'
import { PLAZO_CARGA_SCORER_MS } from '@/lib/data/ronda-libre-scorer'
import { descartarRondaLibre, esRechazoDelCierre, RONDA_ERRCODE } from '@/lib/data/ronda-libre-cierre'
import {
  esRondaCerrada,
  fetchEstadoRondaLibre,
  RONDA_NO_EXISTE,
  guardarTarjetaEnHistorial,
  recalcularIndiceGolfers,
  actualizarNivelDelJugador,
  avisarAlCoachRondaNueva,
  esTarjetaDeRondaDescartada,
  type RatingsPorTee,
} from '@/lib/data/ronda-libre-finalizar'
import { haptic } from '@/lib/ronda/helpers'
import { AVISO_FINALIZAR_SIN_SERVIDOR, AVISO_MARCAS_SIN_ENVIAR, AVISO_RONDA_NO_EXISTE, AVISO_GRUPO_CAMBIO, AVISO_YA_NO_ESTAS_EN_LA_RONDA, AVISO_RONDA_YA_FINALIZADA } from '@/components/ronda/finalizar-copy'
import { limpiarCopiaLocalDeRonda, cerrarCopiaLocalAlFinalizar } from '@/lib/ronda/score-storage'
import { marcarRespaldosDeRondaCerrada } from '@/lib/ronda/respaldo-local'
import { confirmarRondaBorrada } from '@/lib/data/ronda-libre-estado'
import type { ResultadoEnvio } from './useGrupoScoreSave'
import { resolverEnvioDelCierre, subirDrivesAntesDeCerrar } from './cierre-compartido'
import { isSharedBallFormat } from '@/golf/formats'
import { anotaSinSerJugador } from '@/golf/ronda-libre/anotador-de-equipo'
import { esMiTarjeta } from '@/golf/ronda-libre/permisos'
import { equipoQueJuega, vaSoloPorEstructura } from '@/golf/ronda-libre/equipos-de-club'
import { completarHoyosSinMarcarConPar, completarEquiposSinMarcarConPar } from '@/golf/ronda-libre/tarjeta-historica'
import { hoyosQueNoSeRellenan } from '@/golf/ronda-libre/hoyos-sin-rellenar'
import type { MatchResult } from '@/golf/formats/match-play'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'
import type { RondaLibre } from '@/types/ronda'

/**
 * Qué cierre está en curso. Finalizar, descartar y «Terminar mi equipo» se excluyen (P0 24-nov): descartar con
 * «Finalizando…» borraba la ronda en pleno cierre, que caía en RONDA_NOT_FOUND. Es un ref y no el state: dos toques del
 * mismo tick ven el state viejo y correrían los dos. Queda tomado mientras navega (la pantalla se va); cualquier otra
 * salida lo suelta.
 */
export type CierreEnCurso = 'finalizar' | 'descartar' | 'terminar' | null

export interface FinalizeGrupo {
  finalizeRound: () => Promise<void>
  finalizing: boolean
  /** Hoja de confirmación abierta: queda así hasta que la persona decide. */
  confirmFinalize: boolean
  setConfirmFinalize: React.Dispatch<React.SetStateAction<boolean>>
  discardRound: () => Promise<void>
  discarding: boolean
  /** El servidor dijo que esta ronda ya no se descarta (P0002 o P0003 'ronda con tarjetas guardadas'): no se ofrece más. */
  descarteCerrado: boolean
  showDiscardConfirm: boolean
  setShowDiscardConfirm: React.Dispatch<React.SetStateAction<boolean>>
  /** El ref de exclusión (`CierreEnCurso`), para que «Terminar mi equipo» lo comparta. */
  cierreEnCurso: React.MutableRefObject<CierreEnCurso>
}

/**
 * Finalizar / descartar desde el scorer de GRUPO: rellena con par los hoyos
 * sin marcar DE LA RONDA (todas las tarjetas), guarda, escribe en el historial
 * SÓLO la tarjeta de quien anota (`esMiTarjeta`; idempotente),
 * recalcula índice y nivel sin bloquear, y cierra la ronda por la capa de
 * datos. El acceso a datos es el MISMO que usa el scorer individual
 * (`@/lib/data/ronda-libre-finalizar`).
 */
export function useFinalizeGrupo(input: {
  ronda: RondaLibre | null
  codigo: string
  /** Hoyos de la ronda en orden de juego — la misma lista que navega la página. */
  hoyos: readonly number[]
  scores: Record<string, Record<number, number>>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  parMap: Record<number, number>
  teamEquipos: EquipoDelScorer[]
  /** Bola compartida: completa con par los hoyos sin score del equipo (`useTeamScoreSave`). */
  completarEquiposConPar: (equipos: EquipoDelScorer[], hoyos: readonly number[], sinPar?: ReadonlyArray<{ id: string }>) => EquipoDelScorer[]
  /** Match play de la ronda (`useMatchPlayState`, A = primer jugador); `null` en otros formatos. */
  matchResult: MatchResult | null
  /**
   * Quién anota (sesión del teléfono, `useRondaGrupoData`). Antes se pedía `getUser()` al
   * servidor: con Auth caído volvía null y la ronda se cerraba SIN la tarjeta del marcador.
   */
  authUserId: string | null
  /**
   * Respalda y envía todo lo pendiente (jugadores y equipos) — `useGrupoScoreSave.saveAllScores`.
   * Finalizar no clasifica errores por su cuenta: usa los de este envío (P0001 confirmado con la
   * ronda, rechazos que descartan, P0002, sin respuesta).
   */
  enviarPendientes: (
    overrideScores?: Record<string, Record<number, number>>,
    opciones?: { reintentarRechazados?: boolean },
  ) => Promise<ResultadoEnvio>
  /**
   * Timba libre: retiros (sus hoyos no se rellenan con par) y el reenvío de los puntos especiales. Con marcas sin
   * enviar NO se cierra: después de cerrar la RPC las rechaza (P0002) y el juego quedaría sin esos puntos.
   */
  /** Timba libre (solo entonces): retiros, envío de marcas y el hoyo en pantalla (el único que se rellena con par). */
  timba?: { retiros: Readonly<Record<string, number>>; enviarMarcas: () => Promise<boolean>; hoyoEnPantalla: number }
}): FinalizeGrupo {
  const { ronda, codigo, hoyos, scores, setScores, parMap, teamEquipos, completarEquiposConPar, matchResult, authUserId, enviarPendientes, timba } = input
  const router = useRouter()

  const [finalizing, setFinalizing] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  // Finalizar, descartar y «Terminar mi equipo» se excluyen (`CierreEnCurso`).
  const cierreEnCurso = useRef<CierreEnCurso>(null)

  // El servidor dijo que esta ronda ya no se descarta (cerrada o con una tarjeta en un historial): no se ofrece más.
  const [descarteCerrado, setDescarteCerrado] = useState(false)

  const discardRound = useCallback(async () => {
    if (!ronda || discarding || descarteCerrado || cierreEnCurso.current) return
    cierreEnCurso.current = 'descartar'
    setDiscarding(true)
    setShowDiscardConfirm(false)
    haptic(30)
    let descartada = false
    try {
      // noExiste: un intento anterior ya la borró y la respuesta se perdió. Es un descarte hecho.
      const { error, noExiste, cerrada } = await descartarRondaLibre(createClient(), codigo)
      if (error && !noExiste) {
        if (cerrada) setDescarteCerrado(true)
        addToast({ type: 'error', title: 'No se descartó la ronda', message: error, duration: 5000 })
        return
      }
      descartada = true
      limpiarCopiaLocalDeRonda(codigo)
      router.push('/dashboard?discarded=1')
    } finally {
      if (!descartada) {
        cierreEnCurso.current = null
        setDiscarding(false)
      }
    }
  }, [ronda, discarding, descarteCerrado, codigo, router])

  const finalizeRound = async () => {
    if (!ronda || finalizing || cierreEnCurso.current) return
    if (!confirmFinalize) {
      setConfirmFinalize(true)
      haptic([20, 50, 20])
      return
    }
    // Se cierra la hoja: si no hay servidor, el aviso pide volver a tocar Finalizar.
    setConfirmFinalize(false)
    cierreEnCurso.current = 'finalizar'
    setFinalizing(true)
    haptic(30)
    // Mientras navega al resultado el botón sigue en "Finalizando" (no se toca dos veces). Cualquier otra
    // salida, incluida una excepción, lo libera: la pantalla nunca queda en "Finalizando" para siempre (y
    // la redirección de ronda cerrada de la página, que espera a Finalizar, puede seguir).
    const nav = { navegando: false }
    try {
      await finalizarUnaVez(ronda, nav)
    } catch (e) {
      void captureError(e instanceof Error ? e : new Error(String(e)), { context: 'score_grupo_finalize.excepcion', meta: { codigo } })
      addToast({ ...AVISO_FINALIZAR_SIN_SERVIDOR, type: 'error', duration: 7000 })
    } finally {
      if (!nav.navegando) {
        cierreEnCurso.current = null
        setFinalizing(false)
      }
    }
  }

  const finalizarUnaVez = async (ronda: RondaLibre, nav: { navegando: boolean }): Promise<void> => {
    const irA = (destino: string) => {
      nav.navegando = true
      router.push(destino)
    }
    const supabase = createClient()
    // Sin identidad o sin servidor no se cierra nada (caída 04-oct-2026): se avisa y se reintenta.
    const avisarSinServidor = () => addToast({ ...AVISO_FINALIZAR_SIN_SERVIDOR, type: 'error', duration: 7000 })
    if (!authUserId) { avisarSinServidor(); return }
    // Scramble / foursome siempre tienen equipos: si no están, no cargaron. Cerrar
    // dejaría el historial sin hoyos.
    if (isSharedBallFormat(ronda.formato_juego) && teamEquipos.length === 0) { avisarSinServidor(); return }
    // Guard: verificar que la ronda no fue finalizada por otro dispositivo/organizador
    let estado: string | null
    try {
      // Vencida, la lectura se cancela de verdad (el fetch se corta) y se avisa «sin servidor».
      estado = await conPlazoCancelable(s => fetchEstadoRondaLibre(clienteConSenal(supabase, s), codigo), PLAZO_CARGA_SCORER_MS)
    } catch {
      avisarSinServidor()
      return
    }
    if (estado === RONDA_NO_EXISTE) {
      addToast({ ...AVISO_RONDA_NO_EXISTE, type: 'info' })
      limpiarCopiaLocalDeRonda(codigo)
      irA('/dashboard')
      return
    }
    // Sin estado no hay respuesta del servidor: más abajo se rellenan hoyos con par,
    // y eso no se hace a ciegas.
    if (estado === null) { avisarSinServidor(); return }
    // Ya cerrada (otro dispositivo, el organizador o el ganador del match): igual que el individual,
    // no se reescriben golpes ni se vuelve a cerrar, pero la tarjeta propia SÍ va al historial
    // (idempotente) y se recalcula el índice: el mismo camino que si se cierra entre la lectura y el envío.
    // Lo que no subió sale del banner YA (no después del historial, que puede fallar o tardar) y se guarda.
    let rondaYaCerrada = esRondaCerrada(estado)
    if (rondaYaCerrada) {
      addToast({ ...AVISO_RONDA_YA_FINALIZADA, type: 'info' })
      marcarRespaldosDeRondaCerrada(codigo)
    }

    // Lo que dice el envío de Finalizar (`resolverEnvioDelCierre`): con `cerrada` (P0002) la tarjeta sigue al historial.
    const resolverEnvio = (envio: ResultadoEnvio) => resolverEnvioDelCierre(envio, { ronda, teamEquipos, codigo, avisarSinServidor })

    // Bug fix 30-abr-2026: si el último hoyo se jugó en par y el usuario no
    // tap +/-, el state queda undefined (la UI mostraba par como placeholder
    // visual, dándole sensación de registrado). goToNextHole sí auto-rellena
    // con par, pero en el último hoyo no hay siguiente. Detectar todos los
    // hoyos sin marcar y completarlos con par antes de persistir.
    // Sólo los hoyos DE ESTA RONDA: una de 9 desde el 10 no recibe hoyos 1..9.
    // Scramble / foursome (#602): la tarjeta que se anota es la del EQUIPO; las
    // individuales están vacías y NO se inventan con par (antes se guardaban 9-18
    // golpes falsos por jugador y el último hoyo del equipo quedaba sin score).
    const bolaCompartida = isSharedBallFormat(ronda.formato_juego)
    const filledScores: typeof scores = { ...scores }
    if (!bolaCompartida) {
      for (const j of ronda.ronda_libre_jugadores) {
        // Match play: los hoyos que el rival concedió y los posteriores a decidirse el
        // match no se jugaron: no se inventan con par (el historial los estima con par neto).
        // Timba: solo el hoyo en pantalla si alguien ya lo anotó (el resto sin score es "no jugó") y nunca desde el retiro.
        const noRellenar = hoyosQueNoSeRellenan({
          matchResult, jugadores: ronda.ronda_libre_jugadores, jugadorId: j.id, retiros: timba?.retiros, ordenHoyos: hoyos,
          esTimba: timba != null, hoyoEnPantalla: timba?.hoyoEnPantalla, scores,
        })
        const { scores: completos, rellenados } = completarHoyosSinMarcarConPar(filledScores[j.id] ?? {}, hoyos, parMap, noRellenar)
        if (rellenados.length > 0) filledScores[j.id] = completos
      }
    }
    let equiposFinales = teamEquipos
    if (rondaYaCerrada) {
      // Cerrada: el relleno con par es sólo para la tarjeta del historial; no se respalda ni se envía
      // (quedaría como pendiente y subiría con par si la ronda se reabre).
      if (bolaCompartida) equiposFinales = completarEquiposSinMarcarConPar(teamEquipos, hoyos, parMap).equipos
    } else {
      if (bolaCompartida) equiposFinales = completarEquiposConPar(teamEquipos, hoyos)
      else setScores(filledScores)
      // UN envío con la clasificación del scorer: respalda y marca pendiente todo (también las tarjetas
      // que el servidor rechazó antes), y P0001 se confirma con la ronda. Sin servidor (o sesión vencida)
      // lo pendiente sigue: no se cierra a medias (caída 04-oct-2026).
      const envio = resolverEnvio(await enviarPendientes(bolaCompartida ? undefined : filledScores, { reintentarRechazados: true }))
      if (envio === 'corta') return
      rondaYaCerrada = envio === 'cerrada'
      if (timba && !(await timba.enviarMarcas())) {
        addToast({ ...AVISO_MARCAS_SIN_ENVIAR, type: 'error', duration: 8000 })
        haptic([30, 60, 30])
        return
      }
      await subirDrivesAntesDeCerrar(supabase, codigo, 'score_grupo_finalize_drives')
    }

    // Historial: SÓLO la tarjeta de quien anota (`esMiTarjeta`, P0 01-oct-2026).
    // Antes se insertaba la de cada jugador con cuenta: la RLS de historical_rounds
    // (own_rounds) rechazaba las ajenas y la ronda NUNCA se cerraba. Los demás con
    // cuenta la guardan con "Guardar en mi historial" en la ronda terminada.
    const anotador = { id: authUserId }
    const ratingsPorTee: RatingsPorTee = new Map()
    for (const j of ronda.ronda_libre_jugadores) {
      if (!esMiTarjeta(j, anotador?.id)) continue
      // Ronda de equipos de club: el anotador va en el primer equipo solo por estructura, no jugó esa tarjeta.
      // No va a su historial, no mueve su índice ni se le avisa al coach.
      if (vaSoloPorEstructura(equiposFinales, j.id)) continue
      try {
        // Para Scramble/Foursome: usar score del equipo (es el score real de la ronda)
        let playerScores: Record<string | number, number> = filledScores[j.id] ?? {}
        if (bolaCompartida) {
          const equipoDelJugador = equipoQueJuega(equiposFinales, j.id)
          if (equipoDelJugador) playerScores = equipoDelJugador.scores
        }
        const guardado = await guardarTarjetaEnHistorial(supabase, {
          ronda, jugador: j, userId: j.user_id, scores: playerScores, scoresPorJugador: filledScores,
          hoyos, parMap, ratingsPorTee, retiradoDesde: timba?.retiros[j.id],
        })
        if (guardado.status === 'sin_hoyos') continue // no jugó ningún hoyo
        if (guardado.status === 'duplicada') {
          // Ya guardada (el jugador la finalizó desde su teléfono, o reintento):
          // queda la primera. Se registra para poder auditar si difieren. El índice se
          // recalcula igual: si el primer intento venció el plazo, nadie lo recalculó.
          void captureError(new Error('historical_rounds duplicada'), { context: 'score_grupo_finalize_historical.duplicada', level: 'info', meta: { codigo, jugadorId: j.id } })
        }
        if (guardado.status === 'error' && esTarjetaDeRondaDescartada(guardado)) {
          // P0001: la ronda o el jugador no están. Sólo con la ronda borrada de verdad (la descartaron
          // mientras se guardaba) no queda ronda que cerrar ni tarjeta que reintentar. Sin señal: no se limpia
          // nada, se reintenta. Viva o cerrada: al marcador lo sacaron de la ronda (borrado del torneo o
          // retiro); mover de grupo no da P0001 (sigue el mismo id). Reintentar falla igual.
          const veredicto = await confirmarRondaBorrada(supabase, codigo)
          if (veredicto === 'ronda_borrada') {
            addToast({ ...AVISO_RONDA_NO_EXISTE, type: 'info' })
            limpiarCopiaLocalDeRonda(codigo)
            irA('/dashboard')
            return
          }
          if (veredicto === 'sin_senal') { avisarSinServidor(); return }
          captureError(guardado.error, { context: 'score_grupo_finalize_historical', meta: { codigo, jugadorId: j.id, veredicto } })
          // Viva y a cargo del scorer (creó o administra la ronda): al recargar entra igual, su fila ya no está y
          // el cierre sale. Si no (anotaba como jugador, o la ronda ya está cerrada), no hay nada que recargar.
          const sigueACargo = veredicto === 'ronda_viva' && anotaSinSerJugador(ronda, authUserId)
          addToast({ ...(sigueACargo ? AVISO_GRUPO_CAMBIO : AVISO_YA_NO_ESTAS_EN_LA_RONDA), type: 'error', duration: 8000 })
          return
        }
        if (guardado.status === 'error') {
          // Sólo puede fallar la tarjeta PROPIA (las ajenas ya no se insertan). El botón se libera para
          // reintentar; con la ronda cerrada también se puede desde la ronda terminada ("Guardar en mi
          // historial"), adonde lleva la redirección de ronda cerrada de la página.
          captureError(guardado.error, { context: 'score_grupo_finalize_historical' })
          addToast({ type: 'error', title: 'Error guardando tu tarjeta', message: 'Tus scores están seguros. Intenta de nuevo.', duration: 5000 })
          return
        }

        // Recalcular índice y nivel del jugador (non-blocking). El error del
        // RPC se reporta (antes se descartaba con `.then(() => {})`): el RPC
        // es SECURITY DEFINER sin `EXCEPTION WHEN OTHERS`, así que lo que
        // falle en la BD llega hasta acá.
        // Tarjeta propia nueva: el coach aprende de la ronda, igual que en el individual.
        if (guardado.status === 'insertada' && guardado.id) avisarAlCoachRondaNueva(guardado.id)
        void recalcularIndiceGolfers(supabase, j.user_id, {
          context: 'score_grupo_finalize.calcular_indice',
          level: 'warning',
          meta: { codigo, userId: j.user_id },
        })
        void actualizarNivelDelJugador(supabase, j.user_id).catch(() => {})
      } catch { /* no bloquear finalización si falla un jugador */ }
    }

    // Cerrada por otro: no se vuelve a cerrar (si la reabrieron entre medio, se cerraría con golpes que no
    // subieron y se borrarían). Los respaldos ya se marcaron arriba.
    if (rondaYaCerrada) { irA(`/ronda-libre/${codigo}?finished=true`); return }

    // Finalizar ronda
    const { error: updateErr } = await finalizarRondaLibre(supabase, codigo, { jugadorId: ronda.ronda_libre_jugadores[0]?.id })
    if (updateErr && !esRechazoDelCierre(updateErr)) {
      // Sin una respuesta firme (sin red, plazo vencido, 5xx) no sabemos si cerró: no se
      // navega a "terminada" en falso. Reintentar es seguro: el historial es idempotente
      // y el cierre devuelve P0002 si ya cerró.
      captureError(updateErr, { context: 'score_grupo_finalize_update_estado', level: 'warning' })
      avisarSinServidor()
      return
    }
    // Cerrada por este finalizar: la copia del grupo ya subió entera y se borra; los respaldos sin subir
    // del scorer individual se marcan (no se borran). Cerrada por otro (P0002): lo pendiente se guarda.
    if (!updateErr) cerrarCopiaLocalAlFinalizar(codigo)
    else if (updateErr.code === RONDA_ERRCODE.FINALIZED) marcarRespaldosDeRondaCerrada(codigo)
    if (updateErr) {
      // Respuesta firme del servidor (ya cerrada, sin permiso): no hay nada que reintentar.
      captureError(updateErr, { context: 'score_grupo_finalize_update_estado' })
    }
    irA(`/ronda-libre/${codigo}?finished=true`)
  }

  return { finalizeRound, finalizing, confirmFinalize, setConfirmFinalize, discardRound, discarding, descarteCerrado, showDiscardConfirm, setShowDiscardConfirm, cierreEnCurso }
}
