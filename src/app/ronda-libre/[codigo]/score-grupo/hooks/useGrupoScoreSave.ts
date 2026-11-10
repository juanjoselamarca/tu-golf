'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { saveRondaLibreScores, saveRondaEquiposScores, ERRCODE_SIN_RESPUESTA } from '@/lib/data/ronda-libre-scores'
import { RONDA_ERRCODE, esNoReintentable, esRechazoQueDescarta } from '@/lib/data/ronda-libre-cierre'
import { addToast } from '@/hooks/useToast'
import { haptic } from '@/lib/ronda/helpers'
import {
  saveGroupScores,
  marcarPendientes,
  ID_PENDIENTE_EQUIPO,
  confirmarPendientes,
  leerPendientes,
  hayPendientes,
  limpiarCopiaLocalDeRonda,
} from '@/lib/ronda/score-storage'
import { confirmarRondaBorrada } from '@/lib/data/ronda-libre-estado'
import { AVISO_RONDA_NO_EXISTE } from '@/components/ronda/finalizar-copy'
import type { RondaLibre } from '@/types/ronda'
import { limitarGolpes } from '@/golf/ronda-libre/golpes-por-hoyo'

export type GrupoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** A1 anti-toque: cuánto dura el pedido de "toca otra vez". */
export const PENDING_CONFIRM_MS = 2000
/** A3: ventana de ediciones libres sobre el mismo jugador/hoyo tras confirmar. */
export const EDIT_WINDOW_MS = 3000
/** A2: se envía lo pendiente tantos ms después del último tap (cualquier jugador). */
export const SAVE_DEBOUNCE_MS = 500
/** Reintentos de un envío ante un error puntual (backoff 400ms × intento). */
export const SAVE_RETRIES = 3
/**
 * Sincronización automática: con golpes pendientes tras un envío fallido se reintenta
 * solo cada tanto y al recuperar la red (caída del 04-oct-2026: el scorer no reintentaba
 * nunca y el marcador perdió ~1 h de sincronización).
 */
export const REINTENTO_SYNC_MS = 15_000
/**
 * Reenvíos de confirmación tras una caída: reenviar los valores actuales deja el
 * servidor en el último valor aunque un envío que "venció" por plazo aterrice tarde.
 * Desde que los guardados llevan secuencia (`nuevaSecuencia`), el servidor ya
 * descarta el envío vencido de esta misma carga de la página.
 */
export const REENVIO_CONFIRMACION_MS = [30_000, 180_000] as const

export interface PendingScoreConfirm {
  jugadorId: string
  hole: number
}

export interface GrupoScoreSave {
  saveStatus: GrupoSaveStatus
  setSaveStatus: React.Dispatch<React.SetStateAction<GrupoSaveStatus>>
  hasUnsaved: boolean
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
  /** A1: jugador/hoyo esperando el segundo tap. */
  pendingScoreConfirm: PendingScoreConfirm | null
  /** +/- sobre un jugador en un hoyo (con anti-toque, edit window y envío debounced). */
  handleScoreChange: (jugadorId: string, hole: number, delta: number) => void
  /**
   * Envía al servidor todo lo pendiente. Con `overrideScores` (p.ej. pares autocompletados
   * al avanzar) primero los respalda y los marca como pendientes. Dice si el servidor contestó que la
   * ronda está cerrada (P0002): lo pendiente queda en el teléfono y Finalizar no lo toma por falta de señal.
   */
  saveAllScores: (overrideScores?: Record<string, Record<number, number>>) => Promise<EstadoTrasEnvio>
  /** Agenda un envío de lo pendiente (debounced). Lo usa también el score de equipos. */
  programarEnvio: () => void
  /** Hay golpes en el teléfono que el servidor todavía no tiene (se reintenta solo). */
  pendienteDeEnvio: boolean
  /** El servidor rechazó un envío porque la ronda ya se cerró (en otro dispositivo). */
  rondaCerrada: boolean
  /** La ronda ya no existe (P0001): las copias locales se borraron y se avisó; hay que salir. */
  rondaNoExiste: boolean
}

/** Cómo quedó la ronda según el último envío: 'ronda_cerrada' si el servidor respondió P0002 (o P0001 de una cerrada). */
export type EstadoTrasEnvio = 'ronda_cerrada' | 'ronda_abierta'

/**
 * Entrada y guardado de golpes del scorer de GRUPO (un anotador, varias
 * tarjetas):
 *   - A1 anti-toque: cambiar un score ya existente pide 2 taps (2s).
 *   - A3 edit window: tras confirmar, 3s de ediciones libres sobre el mismo
 *     jugador/hoyo (correcciones iterativas 9→4 sin re-confirmar).
 *   - A2 envío debounced: 500ms después del último tap se envía TODO lo pendiente.
 *
 * Resiliencia (caída del 04-oct-2026): cada golpe queda PENDIENTE en el teléfono
 * (`marcarPendientes`) hasta que el servidor confirma ese valor exacto. Si no responde
 * (plazo de 12 s), no se reintenta a ciegas: se marca "sin enviar", el scorer muestra el
 * aviso y la sincronización automática reintenta cada 15 s y al volver la red.
 * Todo guardado va por la capa de datos (merge server-side vía RPC y aviso a seguidores).
 */
export function useGrupoScoreSave(input: {
  ronda: RondaLibre | null
  codigo: string
  currentHole: number
  scores: Record<string, Record<number, number>>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  parMap: Record<number, number>
  /** Scores de equipo en pantalla (scramble/foursome): también se reenvían tras una caída. */
  teamEquipos?: ReadonlyArray<{ id: string; scores: Record<string, number> }>
}): GrupoScoreSave {
  const { ronda, codigo, currentHole, setScores, parMap } = input

  const [saveStatus, setSaveStatus] = useState<GrupoSaveStatus>('idle')
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [pendingScoreConfirm, setPendingScoreConfirm] = useState<PendingScoreConfirm | null>(null)
  const pendingScoreConfirmRef = useRef<PendingScoreConfirm | null>(null)
  /** Un envío falló y quedan golpes pendientes: aviso visible + sincronización automática. */
  const [sinEnviar, setSinEnviar] = useState(false)
  const sinEnviarRef = useRef(false)
  const marcarSinEnviar = useCallback((v: boolean) => { sinEnviarRef.current = v; setSinEnviar(v) }, [])
  const pendingConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editWindowRef = useRef<PendingScoreConfirm | null>(null)
  const editWindowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const envioDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enVueloRef = useRef(false)
  const otraVueltaRef = useRef(false)
  const confirmacionesRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const avisoDefinitivoRef = useRef(false)
  /** Ciclo de envío en curso (incluye la vuelta extra que pidió quien llegó mientras viajaba). */
  const cicloRef = useRef<Promise<void> | null>(null)
  const [rondaCerrada, setRondaCerrada] = useState(false)
  // Lo mismo que `rondaCerrada`, leído al terminar un envío (el estado llega recién en el próximo render).
  const rondaCerradaRef = useRef(false)
  const [rondaNoExiste, setRondaNoExiste] = useState(false)
  // Con la ronda borrada y su copia local limpia, nada vuelve a escribirla (un toque la recrearía).
  const rondaBorradaRef = useRef(false)

  /* ── Cleanup de timers al desmontar ── */
  useEffect(() => {
    const confirmaciones = confirmacionesRef.current // el array nunca se reasigna
    return () => {
      if (envioDebounceRef.current) clearTimeout(envioDebounceRef.current)
      if (pendingConfirmTimeoutRef.current) clearTimeout(pendingConfirmTimeoutRef.current)
      if (editWindowTimeoutRef.current) clearTimeout(editWindowTimeoutRef.current)
      for (const t of confirmaciones) clearTimeout(t)
    }
  }, [])

  /* ── Al cambiar de hoyo: limpiar pending score confirm + edit window ── */
  useEffect(() => {
    setPendingScoreConfirm(null)
    pendingScoreConfirmRef.current = null
    if (pendingConfirmTimeoutRef.current) { clearTimeout(pendingConfirmTimeoutRef.current); pendingConfirmTimeoutRef.current = null }
    editWindowRef.current = null
    if (editWindowTimeoutRef.current) { clearTimeout(editWindowTimeoutRef.current); editWindowTimeoutRef.current = null }
  }, [currentHole])

  const sincronizarRef = useRef<() => Promise<unknown>>(async () => {})
  const saveAllRef = useRef<(o?: Record<string, Record<number, number>>) => Promise<unknown>>(async () => {})
  const scoresRef = useRef(input.scores)
  useEffect(() => { scoresRef.current = input.scores }, [input.scores])
  const equiposRef = useRef(input.teamEquipos ?? [])
  useEffect(() => { equiposRef.current = input.teamEquipos ?? [] }, [input.teamEquipos])

  /* ── Envía TODO lo pendiente (jugadores y equipos) ── */
  const enviarTodo = useCallback(async (overrideScores?: Record<string, Record<number, number>>) => {
    if (!ronda || rondaBorradaRef.current) return
    if (overrideScores) {
      // Respaldo local SIEMPRE primero — sobrevive offline y reload — y quedan pendientes.
      saveGroupScores(codigo, overrideScores)
      for (const j of ronda.ronda_libre_jugadores) {
        if (overrideScores[j.id]) marcarPendientes(codigo, j.id, overrideScores[j.id])
      }
    }
    // Con un envío en vuelo no se lanza otro: se pide una vuelta más y se ESPERA a que
    // termine (Finalizar lee `hayPendientes` justo después; sin esperar, mentía "sin conexión").
    if (enVueloRef.current) { otraVueltaRef.current = true; await cicloRef.current; return }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (hayPendientes(codigo)) marcarSinEnviar(true)
      setSaveStatus('error')
      return
    }
    if (!hayPendientes(codigo)) return

    enVueloRef.current = true
    setSaveStatus('saving')
    let terminar: () => void = () => {}
    cicloRef.current = new Promise<void>(res => { terminar = res })
    try {
      const supabase = createClient()
      let ok = false
      let attempts = 0
      let rechazoDefinitivo: string | null = null
      let vioRondaCerrada = false
      let noExiste = false
      // La ronda se cerró en otro dispositivo / golpe fuera de rango: no se reintenta, pero tampoco
      // se informa como guardado. Sólo lo que el servidor no va a aceptar nunca sale de pendientes: con
      // la ronda cerrada (P0002) los golpes se quedan en el teléfono, porque se puede reabrir (reabrir un
      // torneo devuelve sus rondas a 'en_curso') y al volver al scorer se reenvían.
      const rechazar = (id: string, golpes: Record<number, number>, code: string) => {
        if (esRechazoQueDescarta({ code })) confirmarPendientes(codigo, id, golpes)
        rechazoDefinitivo = code
        // Aunque otra tarjeta del mismo envío tenga otro rechazo: con un P0002 la ronda está cerrada.
        if (code === RONDA_ERRCODE.FINALIZED) vioRondaCerrada = true
        if (avisoDefinitivoRef.current) return
        avisoDefinitivoRef.current = true
        // TODO(aviso-único): "los cambios nuevos no se guardan" ya no es cierto (se guardan en el teléfono y
        // suben si la ronda se reabre). El aviso al jugador va en su propio PR (decisión de Juanjo: aviso único).
        addToast({
          type: 'error',
          title: code === RONDA_ERRCODE.FINALIZED ? 'La ronda ya fue finalizada' : 'Un golpe no se pudo guardar',
          message: code === RONDA_ERRCODE.FINALIZED
            ? 'Se cerró desde otro dispositivo; los cambios nuevos no se guardan.'
            : 'El servidor lo rechazó. Revisa ese hoyo.',
          duration: 6000,
        })
      }
      while (!ok && attempts < SAVE_RETRIES) {
        const noEncontrados: [string, Record<number, number>][] = []
        const envios = Object.entries(leerPendientes(codigo)).map(async ([id, golpes]) => {
          const r = id.startsWith('eq:')
            ? await saveRondaEquiposScores(supabase, { codigo, equipoId: id.slice(3), delta: golpes })
            : await saveRondaLibreScores(supabase, { codigo, jugadorId: id, delta: golpes })
          if (!r.error) confirmarPendientes(codigo, id, golpes)
          // No encontró ronda+jugador (o equipo): se decide abajo, con UNA lectura de la ronda.
          else if (r.error.code === RONDA_ERRCODE.NOT_FOUND) { noEncontrados.push([id, golpes]); return { error: null } }
          else if (esNoReintentable(r.error)) { rechazar(id, golpes, r.error.code); return { error: null } }
          return r
        })
        const results: { error: { code?: string } | null }[] = await Promise.all(envios)
        if (noEncontrados.length > 0) {
          // Borrada → limpiar y salir. Viva (falta ese jugador o equipo) → rechazo de esas tarjetas.
          // Sin señal para confirmarlo → como servidor sin respuesta: nada se limpia y se reintenta.
          const veredicto = await confirmarRondaBorrada(supabase, codigo)
          if (veredicto === 'ronda_borrada') { noExiste = true; break }
          // Cerrada (el RPC busca la fila antes de mirar el estado): como P0002, lo pendiente se guarda.
          if (veredicto === 'ronda_cerrada') for (const [id, golpes] of noEncontrados) rechazar(id, golpes, RONDA_ERRCODE.FINALIZED)
          else if (veredicto === 'ronda_viva') for (const [id, golpes] of noEncontrados) rechazar(id, golpes, RONDA_ERRCODE.NOT_FOUND)
          else results.push({ error: { code: ERRCODE_SIN_RESPUESTA } })
        }
        ok = !results.some(r => r.error)
        attempts++
        // Sin respuesta / sin red: el servidor está caído, reintentar a los 400 ms no
        // sirve. Se avisa ya y la sincronización automática reintenta cada 15 s.
        if (results.some(r => r.error?.code === ERRCODE_SIN_RESPUESTA)) break
        if (!ok && attempts < SAVE_RETRIES) await new Promise(r => setTimeout(r, 400 * attempts))
      }

      if (noExiste) {
        // Igual que el scorer individual: se borra toda la copia local de la ronda, se avisa y se sale.
        rondaBorradaRef.current = true
        limpiarCopiaLocalDeRonda(codigo)
        marcarSinEnviar(false)
        setHasUnsaved(false)
        setSaveStatus('error')
        addToast({ ...AVISO_RONDA_NO_EXISTE, type: 'info', duration: 8000 })
        setRondaNoExiste(true)
      } else if (rechazoDefinitivo) {
        // Otro jugador del mismo envío puede haber quedado sin respuesta (o la ronda está cerrada y lo
        // pendiente se guarda): sigue "sin enviar". Con la ronda cerrada no se reintenta (ver abajo).
        marcarSinEnviar(hayPendientes(codigo))
        setSaveStatus('error')
        if (vioRondaCerrada) { rondaCerradaRef.current = true; setRondaCerrada(true) }
      } else if (ok && !hayPendientes(codigo)) {
        const veniaDeCaida = sinEnviarRef.current
        marcarSinEnviar(false)
        setSaveStatus('saved')
        setHasUnsaved(false)
        haptic(20)
        setTimeout(() => setSaveStatus('idle'), 1500)
        if (veniaDeCaida) {
          for (const ms of REENVIO_CONFIRMACION_MS) {
            // Reenvía los valores actuales: deja en el servidor lo último aunque un envío vencido aterrice tarde.
            confirmacionesRef.current.push(setTimeout(() => {
              for (const eq of equiposRef.current) marcarPendientes(codigo, ID_PENDIENTE_EQUIPO(eq.id), eq.scores)
              void saveAllRef.current(scoresRef.current)
            }, ms))
          }
        }
      } else if (!ok) {
        marcarSinEnviar(true)
        setSaveStatus('error')
      }
    } finally {
      enVueloRef.current = false
      try {
        if (otraVueltaRef.current) {
          otraVueltaRef.current = false
          await sincronizarRef.current()
        }
      } finally {
        terminar()
      }
    }
  }, [ronda, codigo, marcarSinEnviar])

  const saveAllScores = useCallback(async (overrideScores?: Record<string, Record<number, number>>): Promise<EstadoTrasEnvio> => {
    await enviarTodo(overrideScores)
    return rondaCerradaRef.current ? 'ronda_cerrada' : 'ronda_abierta'
  }, [enviarTodo])

  useEffect(() => {
    saveAllRef.current = saveAllScores
    sincronizarRef.current = () => saveAllScores()
  }, [saveAllScores])

  /** A2: envía lo pendiente 500 ms después del último tap (de cualquier jugador o equipo). */
  const programarEnvio = useCallback(() => {
    if (envioDebounceRef.current) clearTimeout(envioDebounceRef.current)
    envioDebounceRef.current = setTimeout(() => {
      envioDebounceRef.current = null
      void sincronizarRef.current()
    }, SAVE_DEBOUNCE_MS)
  }, [])

  /* ── Score change ── */
  const handleScoreChange = useCallback((jugadorId: string, hole: number, delta: number) => {
    if (rondaBorradaRef.current) return
    setScores(prev => {
      const existingScore = prev[jugadorId]?.[hole]
      const hasExisting = existingScore != null && existingScore > 0

      // A3 edit window: si acabamos de confirmar un cambio en este mismo
      // jugador/hoyo y estamos dentro de los 3s, saltamos la confirmación.
      const editWin = editWindowRef.current
      const inEditWindow = editWin?.jugadorId === jugadorId && editWin?.hole === hole

      // A1 anti-toque: si ya hay un score y NO estamos en edit window, exigir 2º tap.
      if (hasExisting && !inEditWindow) {
        const ref = pendingScoreConfirmRef.current
        const isConfirmed = ref?.jugadorId === jugadorId && ref?.hole === hole
        if (!isConfirmed) {
          // 1er tap → mostrar confirmación, NO cambiar nada
          const pending = { jugadorId, hole }
          setPendingScoreConfirm(pending)
          pendingScoreConfirmRef.current = pending
          haptic([15, 40, 15])
          if (pendingConfirmTimeoutRef.current) clearTimeout(pendingConfirmTimeoutRef.current)
          pendingConfirmTimeoutRef.current = setTimeout(() => {
            setPendingScoreConfirm(null)
            pendingScoreConfirmRef.current = null
          }, PENDING_CONFIRM_MS)
          return prev
        }
        // 2º tap → limpiar pending y proceder
        setPendingScoreConfirm(null)
        pendingScoreConfirmRef.current = null
        if (pendingConfirmTimeoutRef.current) {
          clearTimeout(pendingConfirmTimeoutRef.current)
          pendingConfirmTimeoutRef.current = null
        }
      }

      // A3: abrir/renovar edit window de 3s tras cada cambio commiteado.
      editWindowRef.current = { jugadorId, hole }
      if (editWindowTimeoutRef.current) clearTimeout(editWindowTimeoutRef.current)
      editWindowTimeoutRef.current = setTimeout(() => {
        editWindowRef.current = null
      }, EDIT_WINDOW_MS)

      // Aplicar el cambio: respaldo local + pendiente hasta que el servidor lo confirme.
      const par = parMap[hole] ?? 4
      const base = existingScore ?? par
      const newScore = limitarGolpes(base + delta)
      const next = { ...prev, [jugadorId]: { ...(prev[jugadorId] ?? {}), [hole]: newScore } }
      setHasUnsaved(true)
      saveGroupScores(codigo, next)
      marcarPendientes(codigo, jugadorId, { [hole]: newScore })
      haptic(10)
      programarEnvio()
      return next
    })
  }, [parMap, codigo, programarEnvio, setScores])

  /* ── Sincronización automática: reintento periódico + al recuperar la red ── */
  // Con la ronda cerrada no: cada intento daría P0002. Lo pendiente espera a que se reabra.
  const pendienteDeEnvio = sinEnviar
  useEffect(() => {
    if (!pendienteDeEnvio || rondaCerrada) return
    const id = setInterval(() => { void sincronizarRef.current() }, REINTENTO_SYNC_MS)
    const onOnline = () => { void sincronizarRef.current() }
    window.addEventListener('online', onOnline)
    return () => { clearInterval(id); window.removeEventListener('online', onOnline) }
  }, [pendienteDeEnvio, rondaCerrada])

  return {
    saveStatus, setSaveStatus, hasUnsaved, setHasUnsaved, pendingScoreConfirm,
    handleScoreChange, saveAllScores, programarEnvio, pendienteDeEnvio, rondaCerrada, rondaNoExiste,
  }
}
