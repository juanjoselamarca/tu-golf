/**
 * useFinalizeRonda — orquestador de finalizar/descartar ronda libre (scorer
 * individual).
 *
 * Extraído desde page.tsx (Task 6 del scorer-refactor, 14-may-2026). Desde
 * oct-2026 el acceso a datos vive en `@/lib/data/ronda-libre-finalizar`
 * (compartido con el scorer de grupo): guard de "¿ya finalizada?", ratings
 * del tee, INSERT idempotente en historical_rounds, recálculo de índice y
 * nivel. Acá queda sólo la orquestación propia de esta pantalla (toasts,
 * coach, modal final).
 *
 * REGLA: NO modificar formulas, columnas de historical_rounds, ni logica WHS.
 */

'use client'

import { useRef, useState } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { addToast } from '@/hooks/useToast'
import { finalizarRondaLibre } from '@/lib/data/ronda-libre-scores'
import { PLAZO_CARGA_SCORER_MS } from '@/lib/data/ronda-libre-scorer'
import { conTimeout } from '@/lib/red/con-timeout'
import {
  fetchRondaParaCierre,
  PLAZO_GUARDAR_TARJETA_MS,
  RONDA_NO_EXISTE,
  avisarAlCoachRondaNueva,
  fetchIndicesDeUsuario,
  guardarTarjetaEnHistorial,
  recalcularIndiceGolfers,
  actualizarNivelDelJugador,
  type RatingsPorTee,
} from '@/lib/data/ronda-libre-finalizar'
import { haptic } from '@/lib/ronda/helpers'
import { avisoDeIndicesAlFinalizar } from '@/lib/ronda/aviso-indices-ronda'
import { esMiTarjeta } from '@/golf/ronda-libre/permisos'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { armarTarjetaHistorica, completarHoyosSinMarcarConPar, hoyosSinMarcar } from '@/golf/ronda-libre/tarjeta-historica'
import { hoyosSinTerminarDeJugador, matchDeLaRonda } from '@/golf/ronda-libre/match-de-la-ronda'
import { saveScores as lsSave, limpiarCopiaLocalDeRonda } from '@/lib/ronda/score-storage'
import { captureError } from '@/lib/error-tracking'
import { descartarRondaLibre, esRechazoDelCierre } from '@/lib/data/ronda-libre-cierre'
import { AVISO_FINALIZAR_SIN_SERVIDOR, AVISO_FINALIZAR_MATCH_SIN_SESION, AVISO_RONDA_NO_EXISTE } from '@/components/ronda/finalizar-copy'
import { MS_ANTES_DE_ARMAR } from '@/components/ronda/ConfirmarFinalizarHoja'
import type { ResultadoGuardado } from './useScoreSave'
import type { HoleData, RondaLibre } from '@/types/ronda'

/** Con plazo: con la base colgada la lectura no termina y el botón quedaba en "Finalizando...". */
function leerRondaParaCierre(supabase: ReturnType<typeof createClient>, codigo: string) {
  return conTimeout(fetchRondaParaCierre(supabase, codigo), PLAZO_CARGA_SCORER_MS).catch(() => null)
}

interface UseFinalizeRondaOptions {
  ronda: RondaLibre | null
  activeJugadorId: string | null
  scores: Record<string, Record<number, number>>
  parMap: Record<number, number>
  /**
   * Par y SI por hoyo y course handicap de scoring por jugador (los del scorer): el
   * match se recalcula al cerrar con los golpes FRESCOS de la base, no con el estado
   * local (el scorer individual no refresca la tarjeta del rival).
   */
  holeDataMap: Record<number, HoleData>
  playerHcp: Record<string, number>
  codigo: string
  /**
   * Neto no calculable en este teléfono (`netoNoDisponibleSinSesion`, #511): en match
   * play no se finaliza (el match y los hoyos a rellenar dependen del handicap).
   */
  netoNoDisponible?: boolean
  /** Cuenta de quien anota, ya resuelta al cargar: preguntarla acá iría a la red justo al cerrar. */
  authUserId: string | null
  /** Guardado inmediato y esperado (sin debounce): la tarjeta tiene que estar en la base antes de cerrar. */
  guardarAhora: (jugadorId: string, holeScores: Record<number, number>) => Promise<ResultadoGuardado>
  /** Avisa al guardado que Finalizar corre: un "Ronda finalizada" de otro guardado no avisa ni redirige. */
  marcarFinalizando: (enCurso: boolean) => void
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
  setHistoricalRoundId: React.Dispatch<React.SetStateAction<string | null>>
  onDiscardSuccess?: () => void
  onFinalizeError?: (msg: string) => void
}

export interface UseFinalizeRondaResult {
  finalizeRound: () => Promise<void>
  discardRound: () => Promise<void>
  confirmFinalize: boolean
  setConfirmFinalize: React.Dispatch<React.SetStateAction<boolean>>
  /** Finalizar en curso (guardar, historial, índice): el botón lo muestra y no acepta otro toque. */
  finalizando: boolean
  confirmDiscard: boolean
  setConfirmDiscard: React.Dispatch<React.SetStateAction<boolean>>
  discarding: boolean
  roundDone: boolean
  setRoundDone: React.Dispatch<React.SetStateAction<boolean>>
  finalScore: { gross: number; totalPar: number }
}

export function useFinalizeRonda(opts: UseFinalizeRondaOptions): UseFinalizeRondaResult {
  const {
    ronda, activeJugadorId, scores, parMap, holeDataMap, playerHcp, codigo, authUserId, netoNoDisponible = false,
    guardarAhora, marcarFinalizando, setScores, setHasUnsaved, setHistoricalRoundId,
    onDiscardSuccess,
  } = opts

  const [roundDone, setRoundDone] = useState(false)
  const [finalScore, setFinalScore] = useState({ gross: 0, totalPar: 0 })
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  // Un solo finalizar en vuelo: el segundo toque confirma, un tercero y cuarto
  // rápidos (o un reintento con mala señal) no deben correr el flujo dos veces.
  const finalizandoRef = useRef(false)
  const [finalizando, setFinalizando] = useState(false)
  /** La ronda ya no existe (la descartó quien la creó): avisa, borra las copias locales y saca al jugador. */
  const salirPorRondaBorrada = () => {
    addToast({ ...AVISO_RONDA_NO_EXISTE, type: 'info' })
    limpiarCopiaLocalDeRonda(codigo)
    onDiscardSuccess?.()
  }

  // Cuándo se armó "Descartar": un doble toque no puede borrar la ronda (es irreversible).
  const descarteArmadoEn = useRef(0)

  const discardRound = async () => {
    if (!ronda || discarding) return
    if (!confirmDiscard) {
      descarteArmadoEn.current = Date.now()
      setConfirmDiscard(true)
      haptic([20, 40, 20])
      setTimeout(() => setConfirmDiscard(false), 5000)
      return
    }
    if (Date.now() - descarteArmadoEn.current < MS_ANTES_DE_ARMAR) return
    setDiscarding(true)
    haptic(30)
    // noExiste: el servidor ya la borró (un intento anterior cuya respuesta se perdió). Es un descarte hecho.
    const { error, noExiste } = await descartarRondaLibre(createClient(), codigo)
    if (error && !noExiste) { setDiscarding(false); setConfirmDiscard(false); addToast({ title: error, type: 'error' }); return }
    limpiarCopiaLocalDeRonda(codigo)
    addToast({ title: 'Ronda descartada', type: 'info' })
    onDiscardSuccess?.()
  }

  const finalizeRound = async () => {
    if (!ronda || !activeJugadorId || finalizandoRef.current) return
    if (netoNoDisponible && ronda.formato_juego === 'match_play') {
      addToast({ ...AVISO_FINALIZAR_MATCH_SIN_SESION, type: 'info', duration: 7000 })
      return
    }
    if (!confirmFinalize) {
      setConfirmFinalize(true)
      haptic(15)
      return
    }
    setConfirmFinalize(false)
    haptic(30)
    finalizandoRef.current = true
    marcarFinalizando(true)
    setFinalizando(true)
    try {
      await finalizarUnaVez(ronda, activeJugadorId)
    } finally {
      finalizandoRef.current = false
      marcarFinalizando(false)
      setFinalizando(false)
    }
  }

  const finalizarUnaVez = async (ronda: RondaLibre, activeJugadorId: string, segundaPasada = false): Promise<void> => {

    // Ronda ya cerrada por otro dispositivo/jugador (en match play pasa siempre que el
    // ganador cierra primero: la ronda se cierra cuando cada tarjeta tiene los hoyos que
    // el match exige). No se reescriben los golpes ni se vuelve a cerrar, pero la tarjeta
    // propia SÍ se guarda en el historial (idempotente): antes este camino volvía sin
    // guardarla y el perdedor se quedaba sin la ronda.
    //
    // Una sola lectura trae el estado y las tarjetas frescas de todos. Si falla (sin
    // señal) NO se sigue con la copia local: el match saldría mal y se rellenarían con
    // par hoyos no jugados, también en el estado local y en localStorage. Se avisa y
    // "Finalizar" queda disponible para reintentar, sin haber tocado nada.
    const supabase = createClient()
    const fresca = await leerRondaParaCierre(supabase, codigo)
    if (!fresca) {
      void captureError(new Error('fetchRondaParaCierre sin datos'), { context: 'finalize-ronda.tarjetas-frescas', level: 'warning', meta: { codigo } })
      addToast({ title: 'Sin conexión', message: 'No pudimos leer la ronda. Vuelve a finalizar en un momento.', type: 'error' })
      return
    }
    if (fresca.estado === RONDA_NO_EXISTE) { salirPorRondaBorrada(); return }
    const yaFinalizada = fresca.estado === 'finalizada'
    if (yaFinalizada) addToast({ title: 'Esta ronda ya fue finalizada', type: 'info' })

    // Bug fix 30-abr-2026: el ultimo hoyo en par no se persistia. La UI mostraba
    // par como placeholder visual (sensacion de registrado), pero el state era
    // undefined porque sin tap +/- nunca se disparaba handleScoreChange. Y como
    // goToNextHole no corre en el ultimo hoyo, el auto-fill no aplicaba.
    // Detectar todos los hoyos sin marcar y rellenarlos con par antes de guardar.
    // Sólo los hoyos DE ESTA RONDA: una de 9 desde el 10 no recibe hoyos 1..9.
    const totalHolesForSave = ronda.holes ?? 18
    const hoyos = hoyosDeLaRonda(ronda.hoyo_inicio, totalHolesForSave)
    const currentScores = scores[activeJugadorId] ?? {}
    // Match play: los hoyos que el rival concedió y los posteriores a decidirse el
    // match no se jugaron: no se inventan con par (el historial los estima con par neto).
    //
    // El match se arma con la tarjeta del rival tal como está EN LA BASE: la copia
    // local puede no tener sus últimos hoyos y entonces el match "no estaba decidido"
    // y se rellenaban con par hoyos que nunca se jugaron (revisión Fable #502). La
    // tarjeta propia es la local (puede tener cambios sin guardar).
    const hoyosConSi = Object.values(holeDataMap).map(h => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index }))
    const matchCon = (porJugador: Record<string, Record<string | number, number> | null | undefined>) =>
      matchDeLaRonda({ ronda, scoresPorJugador: porJugador, hoyos: hoyosConSi, courseHcpPorJugador: playerHcp })
    const scoresPorJugador: Record<string, Record<string | number, number>> = {
      ...Object.fromEntries(fresca.jugadores.map(j => [j.id, j.scores ?? {}])),
      [activeJugadorId]: currentScores,
    }
    const match = matchCon(scoresPorJugador)
    const sinTerminar = (jugadorId: string, m = match) => hoyosSinTerminarDeJugador(m, ronda.ronda_libre_jugadores, jugadorId)
    const { scores: playerScores, rellenados } = completarHoyosSinMarcarConPar(currentScores, hoyos, parMap, sinTerminar(activeJugadorId))
    if (rellenados.length > 0) {
      setScores(prev => ({ ...prev, [activeJugadorId]: playerScores }))
      lsSave(codigo, activeJugadorId, playerScores)
    }
    // La tarjeta llega a la base ANTES de seguir: el guardado normal espera 500 ms
    // (debounce) y corría en paralelo, así que con mala señal el cierre leía la
    // tarjeta sin el último hoyo (la ronda no se cerraba) o la cerraba antes de que
    // llegara (el último golpe quedaba fuera de la tarjeta compartida). Sin servidor
    // no se sigue: los golpes quedan en el teléfono y "Finalizar" se reintenta.
    if (!yaFinalizada) {
      const guardado = await guardarAhora(activeJugadorId, playerScores)
      if (guardado === 'sin_conexion') { addToast({ ...AVISO_FINALIZAR_SIN_SERVIDOR, type: 'error', duration: 7000 }); return }
      // Sin permiso o tarjeta rechazada: el guardado ya avisó; no se cierra nada a su nombre.
      if (guardado === 'sin_permiso' || guardado === 'rechazado') return
      // La borraron entre la lectura y el guardado (el guardado ya limpió las copias locales).
      if (guardado === 'no_existe') { salirPorRondaBorrada(); return }
      // La cerró otro entre la lectura y el guardado (el ganador del match): se vuelve a
      // empezar. La segunda pasada lee las tarjetas FINALES y toma el camino "ya finalizada"
      // (historial sí, cierre no). Con la lectura de antes el match podía no estar decidido
      // y se rellenaban con par hoyos que no se jugaron (mismo defecto que la revisión #502).
      // Una sola vez: si la base aún no la muestra cerrada, se avisa y "Finalizar" se reintenta.
      // El par que rellenó ESTA pasada se deshace: si el match final no rellena nada,
      // quedaba en el teléfono y al reabrir la tarjeta mostraba hoyos que no se jugaron.
      if (guardado === 'finalizada') {
        if (rellenados.length > 0) {
          setScores(prev => ({ ...prev, [activeJugadorId]: currentScores }))
          lsSave(codigo, activeJugadorId, currentScores)
        }
        if (!segundaPasada) return finalizarUnaVez(ronda, activeJugadorId, true)
        addToast({ ...AVISO_FINALIZAR_SIN_SERVIDOR, type: 'error', duration: 7000 })
        return
      }
    }
    if (!yaFinalizada) void trackEvent(supabase, authUserId, 'ronda_completada', { codigo })

    // Save to historical_rounds — posicional en orden de juego (ver tarjeta-historica).
    // holes_played = hoyos REALMENTE jugados (no el config de la ronda).
    // Sin esto, una ronda de 15/18 se guardaba como "18 hoyos" y el diferencial WHS salia mal.
    const tarjeta = armarTarjetaHistorica({ scores: playerScores, hoyos, roundHoles: totalHolesForSave, parMap })
    if (tarjeta.holesPlayed === 0) {
      // Sin scores = no tiene sentido crear historial. Usar "Descartar ronda".
      addToast({ title: 'Sin hoyos jugados', message: 'Usa "Descartar ronda" si no quieres guardarla.', type: 'info' })
      setRoundDone(true)
      setHasUnsaved(false)
      return
    }
    const activePlayer = ronda.ronda_libre_jugadores.find(p => p.id === activeJugadorId)
    // Historial: sólo si la tarjeta es de quien finaliza (`esMiTarjeta`, fuente única
    // con el scorer de grupo). La de otra cuenta la guarda su dueño desde la ronda
    // terminada ("Guardar en mi historial"); la de un invitado no es de nadie con
    // historial (antes entraba al historial de quien anotaba y movía su índice).
    const historicalUserId = esMiTarjeta(activePlayer, authUserId) ? activePlayer.user_id : null
    let historialFallo = false
    // La tarjeta tal como quedó en el historial (con los hoyos estimados) para el modal final.
    let tarjetaGuardada = tarjeta
    if (!historicalUserId) {
      addToast({
        title: activePlayer?.user_id
          ? `${activePlayer.nombre} puede guardar esta tarjeta en su historial desde su cuenta`
          : 'La tarjeta de un invitado no se guarda en ningún historial',
        type: 'info',
      })
    } else try {
      // Match play ("Ganó 3&2"), ajuste WHS de los hoyos sin terminar y equipo: todo
      // dentro de `guardarTarjetaEnHistorial` (fuente única con los otros dos caminos).
      const ratingsPorTee: RatingsPorTee = new Map()
      const guardado = await guardarTarjetaEnHistorial(supabase, {
        ronda, jugador: activePlayer ?? { id: activeJugadorId, tees: null }, userId: historicalUserId,
        scores: playerScores, scoresPorJugador: { ...scoresPorJugador, [activeJugadorId]: playerScores },
        hoyos, parMap, ratingsPorTee, conId: true,
      })
      if (guardado.status !== 'error') tarjetaGuardada = guardado.tarjeta
      // No guardada (RLS, red…): no se anuncia "Ronda guardada" ni se recalcula el
      // índice sobre un historial que no cambió. Los golpes siguen en la tarjeta.
      if (guardado.status === 'error') {
        void captureError(guardado.error, { context: 'finalize-ronda.historial', meta: { codigo, jugadorId: activeJugadorId } })
        addToast({
          title: 'No pudimos guardar la ronda en tu historial',
          message: 'Tus golpes quedaron en la tarjeta. Vuelve a finalizar en un momento.',
          type: 'error',
        })
        historialFallo = true
        throw new Error('historial-no-guardado')
      }
      // Ya estaba guardada (reintento, u otro dispositivo): queda la primera. Se
      // registra para poder auditar si difieren.
      if (guardado.status === 'duplicada') {
        void captureError(new Error('historical_rounds duplicada'), { context: 'finalize-ronda.historial.duplicada', level: 'info', meta: { codigo, jugadorId: activeJugadorId } })
      }
      if (guardado.status === 'insertada' && guardado.id) {
        setHistoricalRoundId(guardado.id)
        // Cerebro v2: el coach aprende de la ronda (plan-outcome). No bloquea.
        avisarAlCoachRondaNueva(guardado.id)
      }

      // ── Task 2.8: capturar índice ANTES del recálculo ──
      // El índice no bloquea el cierre: cada paso tiene plazo y, vencido, sigue.
      const indicesAntes = await conTimeout(fetchIndicesDeUsuario(supabase, historicalUserId), PLAZO_CARGA_SCORER_MS).catch(() => null)

      // Recalcular Indice Golfers+ con retry exponencial (no bloquea la finalización)
      const rpcSucceeded = await conTimeout(recalcularIndiceGolfers(supabase, historicalUserId, { reintentos: 3 }), PLAZO_GUARDAR_TARJETA_MS).catch(() => false)

      // ── Task 2.8: los dos índices DESPUÉS y el aviso (Federación y Golfers+) ──
      const indicesDespues = rpcSucceeded
        ? await conTimeout(fetchIndicesDeUsuario(supabase, historicalUserId), PLAZO_CARGA_SCORER_MS).catch(() => null)
        : null
      addToast(avisoDeIndicesAlFinalizar(indicesAntes, indicesDespues, rpcSucceeded))

      void actualizarNivelDelJugador(supabase, historicalUserId).catch(() => {})

      // Detectar patrones del dueno de la sesion (tAIger+ patterns es del usuario logged-in)
      if (authUserId) {
        fetch('/api/taiger/patterns', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(() => {}).catch(() => {})
      }
    } catch { /* don't block finalization */ }

    // La tarjeta propia no quedó en el historial: no se cierra la ronda ni se pasa
    // a la pantalla final, para que "Finalizar" se pueda reintentar.
    if (historialFallo) return

    // Check if ALL players have completed all holes -> finalize round
    // Guard: verificar que la ronda no fue finalizada por otro jugador simultaneamente
    const freshRonda = yaFinalizada ? { estado: 'finalizada', jugadores: [] } : await leerRondaParaCierre(supabase, codigo)
    if (!freshRonda) {
      // Lectura fallida: NO se cierra la ronda para todos (`[].every` daba true).
      // Se avisa y se sale: si seguía a la pantalla final, la ronda quedaba abierta sin
      // que nadie lo supiera. Reintentar es seguro: el historial es idempotente.
      void captureError(new Error('fetchRondaParaCierre sin datos'), { context: 'finalize-ronda.cierre', level: 'warning', meta: { codigo } })
      addToast({ ...AVISO_FINALIZAR_SIN_SERVIDOR, type: 'error', duration: 7000 })
      return
    } else if (freshRonda.estado === 'finalizada') {
      // Otro jugador ya finalizo — no duplicar
      setRoundDone(true)
    } else {
      // Completa = todos los hoyos de la ronda anotados, salvo los que el match no exige.
      // Match recalculado con lo que hay ahora en la base (incluida mi tarjeta recién guardada).
      const matchAlCerrar = matchCon({ ...Object.fromEntries(freshRonda.jugadores.map(j => [j.id, j.scores ?? {}])), [activeJugadorId]: playerScores })
      const allDone = freshRonda.jugadores.length > 0 && freshRonda.jugadores.every(j => {
        const excluir = new Set(sinTerminar(j.id, matchAlCerrar))
        return hoyosSinMarcar(j.scores ?? {}, hoyos.filter(h => !excluir.has(h))).length === 0
      })
      if (allDone) {
        // RPC: cierra solo si sigue en_curso (sin carrera), valida quién puede y,
        // si ESTA llamada la cerró, manda el "Resultado final" a los seguidores.
        const { error: finErr } = await finalizarRondaLibre(supabase, codigo, { jugadorId: activeJugadorId ?? undefined })
        // Sin una respuesta firme (sin red, plazo vencido, 5xx) no sabemos si cerró: no se
        // pasa a "terminada" en falso. Reintentar es seguro: devuelve P0002 si ya había cerrado.
        if (finErr && !esRechazoDelCierre(finErr)) {
          void captureError(finErr, { context: 'finalize-ronda.finalizar_ronda_libre', level: 'warning', meta: { codigo } })
          addToast({ ...AVISO_FINALIZAR_SIN_SERVIDOR, type: 'error', duration: 7000 })
          return
        }
        if (finErr) void captureError(finErr, { context: 'finalize-ronda.finalizar_ronda_libre', meta: { codigo } })
      }
    }

    // Modal final: la misma tarjeta que quedó en el historial (relleno del último
    // hoyo en par y hoyos de match play estimados incluidos).
    let finalTotalPar = 0
    tarjetaGuardada.hoyos.forEach((h, i) => { if (tarjetaGuardada.scores[i] != null) finalTotalPar += parMap[h] ?? 4 })
    setFinalScore({ gross: tarjetaGuardada.totalGross, totalPar: finalTotalPar })
    setRoundDone(true)
    setHasUnsaved(false)
  }

  return {
    finalizeRound,
    discardRound,
    confirmFinalize,
    setConfirmFinalize,
    finalizando,
    confirmDiscard,
    setConfirmDiscard,
    discarding,
    roundDone,
    setRoundDone,
    finalScore,
  }
}
