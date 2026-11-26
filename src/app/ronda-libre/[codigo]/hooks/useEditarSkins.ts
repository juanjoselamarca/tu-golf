'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { teesDeLosRecorridos } from '@/golf/courses/tees-de-recorridos'
import { pozoTotalDelSkins } from '@/golf/formats/skins'
import { MAX_JUGADORES_POR_RONDA } from '@/golf/ronda-libre/plantilla-de-jugadores'
import { captureError } from '@/lib/error-tracking'
import { fetchJsonConPlazo } from '@/lib/red/fetch-json-con-plazo'
import { fetchTeesDeCancha, type CourseTee } from '@/lib/data/ronda-libre-nueva'
import { enElOrden } from '@/lib/ronda/orden-jugadores'
import type { RivalDelCreador } from '../../nueva/hooks/useFormularioDeRonda'

// «Editar» un Skins de ronda libre antes del primer golpe (spec docs/specs/formato-skins.md, «Editar antes del primer
// golpe»). El creador corrige índice y tee de los que ya están, suma (con cuenta o invitado) o saca jugadores, y guarda
// la lista completa con PUT /api/ronda-libre/[codigo]/skins/jugadores. La API valida y congela igual que al crear;
// acá solo se arma el pedido y se muestran sus respuestas.

/** Un jugador que ya está en la ronda (lo que la página tiene de él). */
export interface JugadorDelSkinsAEditar {
  id: string
  nombre: string
  user_id: string | null
  handicap?: number | null
  tees?: string | null
}

/** Una fila de la hoja: un jugador que ya estaba (nombre fijo) o uno nuevo (la tarjeta del asistente). */
export type FilaDelEditor =
  | { clave: string; tipo: 'existente'; id: string; nombre: string; esCreador: boolean; handicap: number | null; tees: string | null }
  | { clave: string; tipo: 'nuevo'; rival: RivalDelCreador }

export type EstadoDelEditor =
  | { fase: 'editando' }
  | { fase: 'guardando' }
  /** Se puede corregir y volver a guardar (validación, señal). */
  | { fase: 'error'; mensaje: string }
  /** No hay vuelta (ya empezó, cambió por otro lado o no se supo si se guardó): «Entendido» cierra y recarga. */
  | { fase: 'cerrar'; mensaje: string }

export type EstadoDeLosTees = { fase: 'cargando' } | { fase: 'ok'; tees: CourseTee[] } | { fase: 'error' }

export const MENSAJE_EDITAR_SIN_SENAL =
  'No supimos si se guardó: la señal se cortó. Cierra y mira la ronda; si no cambió, vuelve a Editar.'
export const MENSAJE_EDITAR_ERROR = 'No pudimos guardar los cambios. Revisa tu señal e intenta de nuevo.'
export const MENSAJE_EDITAR_TOPE = `El Skins se juega con ${MAX_JUGADORES_POR_RONDA} jugadores como máximo.`
export const MENSAJE_EDITAR_INDICE = 'Revisa el índice marcado en rojo para poder guardar.'
const PLAZO_GUARDAR_MS = 15_000

/**
 * ¿Este visor ve «Editar»? Solo el creador, con la ronda en curso y el Skins sin empezar. `empezado` lo calcula el
 * servidor con `skins_ronda_empezada`; si falta (no se pudo leer, o una respuesta de otra versión), no se muestra.
 * Además los jugadores que tiene la pantalla tienen que ser exactamente los del Skins: la lista que se guarda es la
 * completa y el que no va se saca, así que con una lista vieja o a medias se sacaría a alguien sin quererlo.
 */
export function puedeEditarElSkins(input: {
  userId: string | null | undefined
  creadorId: string | null | undefined
  vista: { empezado?: boolean; rondaCerrada: boolean; jugadorIds: readonly string[] } | null | undefined
  jugadores: readonly { id: string }[]
}): boolean {
  const { userId, creadorId, vista, jugadores } = input
  return !!userId && userId === creadorId && !!vista && vista.empezado === false && !vista.rondaCerrada
    && enElOrden(vista.jugadorIds, jugadores) !== null
}

/** Las filas iniciales: el creador primero (su tarjeta es la que anota), después el resto en el orden del Skins. */
export function filasIniciales(todos: readonly JugadorDelSkinsAEditar[], creadorId: string, orden: readonly string[]): FilaDelEditor[] {
  const jugadores = enElOrden(orden, todos) ?? todos
  const creador = jugadores.filter(j => j.user_id === creadorId)
  const resto = jugadores.filter(j => j.user_id !== creadorId)
  return [...creador, ...resto].map(j => ({
    clave: j.id, tipo: 'existente', id: j.id, nombre: j.nombre, esCreador: j.user_id === creadorId,
    handicap: j.handicap ?? null, tees: j.tees ?? null,
  }))
}

/** ¿La fila cuenta como jugador? Un rival nuevo sin nombre no se manda (igual que en el asistente). */
export function filaConJugador(f: FilaDelEditor): boolean {
  return f.tipo === 'existente' || f.rival.nombre.trim().length > 0
}

/**
 * El cuerpo del PUT. Los que ya estaban van con su `id` y SIN `perfil_sugerido_id` (sin la clave, el servidor
 * conserva la cuenta que tenían; sus datos de invitado también los conserva él). Los nuevos van como en el asistente
 * (`jugadoresParaLaApi`): un invitado nunca lleva cuenta, un rival con cuenta la lleva como sugerencia sin poderes.
 */
export function pedidoDeEdicion(filas: readonly FilaDelEditor[], creadorId: string) {
  return filas.filter(filaConJugador).map(f => {
    if (f.tipo === 'existente') {
      return { id: f.id, nombre: f.nombre, user_id: f.esCreador ? creadorId : null, handicap: f.handicap, tees: f.tees }
    }
    const r = f.rival
    const invitado = r.tipo === 'invitado'
    return {
      nombre: r.nombre.trim(),
      user_id: null,
      perfil_sugerido_id: invitado ? null : r.profileId,
      handicap: r.handicap,
      tees: r.tees,
      is_guest: invitado,
      telefono_invitado: invitado ? r.telefono.trim() || undefined : undefined,
      nombre_invitado: invitado ? r.nombre.trim() : undefined,
    }
  })
}

export function useEditarSkins(input: {
  codigo: string
  creadorId: string
  jugadores: readonly JugadorDelSkinsAEditar[]
  /** El orden del Skins (`jugadorIds` de la vista). */
  orden: readonly string[]
  courseId: string | null | undefined
  recorridos: string[] | null | undefined
  pozoPorJugador: number
  /** Recarga lo que muestra la pantalla (la ronda y el juego) tras guardar o tras un «ya empezó». */
  onGuardado: () => void
}) {
  const { codigo, creadorId, jugadores, orden, courseId, recorridos, pozoPorJugador, onGuardado } = input
  const [abierto, setAbierto] = useState(false)
  const [filas, setFilas] = useState<FilaDelEditor[]>([])
  const [estado, setEstado] = useState<EstadoDelEditor>({ fase: 'editando' })
  const [pidiendoQuitar, setPidiendoQuitar] = useState<string | null>(null)
  const [bloqueos, setBloqueos] = useState<ReadonlySet<string>>(new Set())
  const [tees, setTees] = useState<EstadoDeLosTees>({ fase: 'cargando' })
  const ultimoNuevo = useRef(0)

  const cargarTees = useCallback(() => {
    if (!courseId) { setTees({ fase: 'ok', tees: [] }); return }
    setTees({ fase: 'cargando' })
    fetchTeesDeCancha(courseId)
      .then(lista => setTees({ fase: 'ok', tees: teesDeLosRecorridos(lista, recorridos ?? []) }))
      .catch(err => {
        void captureError(err, { context: 'ronda-libre.skins-editar.tees', level: 'warning', meta: { codigo } })
        setTees({ fase: 'error' })
      })
  }, [courseId, recorridos, codigo])

  // Los tees se piden al abrir (no antes: la mayoría de las visitas no edita).
  useEffect(() => { if (abierto) cargarTees() }, [abierto, cargarTees])

  const abrir = () => {
    setFilas(filasIniciales(jugadores, creadorId, orden))
    setEstado({ fase: 'editando' })
    setPidiendoQuitar(null)
    setBloqueos(new Set())
    setAbierto(true)
  }
  const cerrar = () => {
    if (estado.fase === 'guardando') return
    setAbierto(false)
  }

  const cambiarExistente = (clave: string, cambio: { handicap?: number | null; tees?: string | null }) => {
    setFilas(prev => prev.map(f => (f.clave === clave && f.tipo === 'existente' ? { ...f, ...cambio } : f)))
    if (estado.fase === 'error') setEstado({ fase: 'editando' })
  }
  const cambiarRival = <K extends keyof RivalDelCreador>(clave: string, campo: K, valor: RivalDelCreador[K]) => {
    setFilas(prev => prev.map(f => (f.clave === clave && f.tipo === 'nuevo' ? { ...f, rival: { ...f.rival, [campo]: valor } } : f)))
    if (estado.fase === 'error') setEstado({ fase: 'editando' })
  }

  const enTope = filas.length >= MAX_JUGADORES_POR_RONDA
  const sumar = () => {
    if (enTope) return
    ultimoNuevo.current += 1
    const clave = `nuevo-${ultimoNuevo.current}`
    setFilas(prev => [...prev, {
      clave, tipo: 'nuevo',
      rival: { id: clave, tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null, profileId: null },
    }])
  }

  const marcarBloqueo = useCallback((clave: string, bloquea: boolean) => {
    setBloqueos(prev => {
      if (prev.has(clave) === bloquea) return prev
      const siguiente = new Set(prev)
      if (bloquea) siguiente.add(clave)
      else siguiente.delete(clave)
      return siguiente
    })
  }, [])

  const pedirQuitar = (clave: string) => setPidiendoQuitar(clave)
  const cancelarQuitar = () => setPidiendoQuitar(null)
  const quitar = (clave: string) => {
    setFilas(prev => prev.filter(f => f.clave !== clave || (f.tipo === 'existente' && f.esCreador)))
    marcarBloqueo(clave, false)
    setPidiendoQuitar(null)
  }

  const conJugador = filas.filter(filaConJugador)
  const cantidad = conJugador.length
  const pozo = pozoTotalDelSkins(pozoPorJugador, cantidad)
  const bloqueaIndice = bloqueos.size > 0

  const guardar = async () => {
    if (bloqueaIndice || estado.fase === 'guardando') return
    setEstado({ fase: 'guardando' })
    try {
      const { res, json } = await fetchJsonConPlazo(
        `/api/ronda-libre/${encodeURIComponent(codigo)}/skins/jugadores`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jugadores: pedidoDeEdicion(filas, creadorId) }) },
        PLAZO_GUARDAR_MS,
        { leerCuerpoSiNoOk: true },
      )
      const mensaje = (json as { error?: unknown } | null)?.error
      if (res.ok) {
        setAbierto(false)
        setEstado({ fase: 'editando' })
        onGuardado()
        return
      }
      const texto = typeof mensaje === 'string' && mensaje ? mensaje : MENSAJE_EDITAR_ERROR
      // 409: ya empezó o los jugadores cambiaron por otro lado; 404/403: ya no se puede editar. No hay vuelta.
      if (res.status === 409 || res.status === 404 || res.status === 403) {
        setEstado({ fase: 'cerrar', mensaje: texto })
        return
      }
      setEstado({ fase: 'error', mensaje: texto })
    } catch (err) {
      // Corte o plazo: el PUT pudo haberse guardado. Reintentar con la misma lista sumaría de nuevo a los jugadores
      // nuevos (aún sin id): se cierra y se recarga para ver cómo quedó.
      void captureError(err, { context: 'ronda-libre.skins-editar.guardar', level: 'warning', meta: { codigo } })
      setEstado({ fase: 'cerrar', mensaje: MENSAJE_EDITAR_SIN_SENAL })
    }
  }

  const entendido = () => {
    setAbierto(false)
    setEstado({ fase: 'editando' })
    onGuardado()
  }

  return {
    abierto, abrir, cerrar,
    filas, tees, reintentarTees: cargarTees,
    cambiarExistente, cambiarRival, marcarBloqueo,
    sumar, enTope,
    pidiendoQuitar, pedirQuitar, cancelarQuitar, quitar,
    cantidad, pozo, bloqueaIndice,
    estado, guardar, entendido,
  }
}

export type EditorDelSkins = ReturnType<typeof useEditarSkins>
