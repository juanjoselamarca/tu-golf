// src/lib/data/tournaments/grupoEnJuego.ts
//
// Grupo nuevo (o vacío) y borrar un grupo vacío con el torneo EN JUEGO (#814 · PR4, decisiones D5, D7 y D14).
//
//   crear:  nombre (`nombreDeGrupoNuevo`) + tarjeta del inicio (`tarjetaDeGrupoDeTorneo`) → RPC `crear_grupo_en_juego`
//   borrar: RPC `borrar_grupo_en_juego`
//
// Las RPC son la autoridad (torneo in_progress de una ronda, grupo del torneo, vacío; todo bajo el lock de la gestión
// de grupos). Esta capa arma lo que la RPC no puede saber sola: la tarjeta con la MISMA función del inicio, para que
// el grupo nuevo juegue lo mismo que los demás, y el nombre por defecto. La tarjeta nace vacía y sin equipo: el
// primero que llegue entra por `colocarInscrito`, que crea el equipo y fija el formato de match play.
// Migración: supabase/migrations/20261123100000_grupo_en_juego.sql.

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { isTeamFormat, resolveFormatoJuego } from '@/golf/formats'
import { mensajeDeMotivo } from '@/golf/torneo/gestion-en-juego'
import { fetchRoundPlayConfig } from './rounds'
import { CODIGO_INTENTOS, nuevoCodigo, tarjetaDeGrupoDeTorneo } from './startTournament'
import type { TorneoParaEditar } from './editarHandicapInscrito'

/** Largo máximo del nombre de un grupo (lo mismo exige la RPC). */
export const LARGO_MAX_NOMBRE_GRUPO = 60

/** Motivos de las RPC de grupo en juego, más `error` (la base falló o respondió algo inesperado). */
export type MotivoGrupoEnJuego =
  | 'torneo-no-en-juego'
  | 'torneo-varias-rondas'
  | 'tarjeta-cerrada'
  | 'tarjeta-con-timba'
  | 'grupo-no-existe'
  | 'grupo-con-tarjeta'
  | 'grupo-con-jugadores'
  | 'grupo-con-golpes'
  | 'nombre-repetido'
  | 'tarjeta-distinta'
  | 'error'

export type ResultadoGrupoEnJuego =
  | { ok: true; groupId: string; rondaLibreId: string | null; nombre: string | null }
  | { ok: false; motivo: MotivoGrupoEnJuego; mensaje: string }

/** "grupo" o "equipo", según el formato (en formatos por equipo, grupo = equipo). */
function sustantivo(torneo: TorneoParaEditar): string {
  return isTeamFormat(resolveFormatoJuego(torneo)) ? 'equipo' : 'grupo'
}

const MENSAJES: Record<MotivoGrupoEnJuego, (s: string) => string> = {
  // Los que comparte con colocar un inscrito: el mismo copy.
  'torneo-no-en-juego': () => mensajeDeMotivo('torneo-no-en-juego'),
  'torneo-varias-rondas': () => mensajeDeMotivo('torneo-varias-rondas'),
  'tarjeta-cerrada': () => mensajeDeMotivo('tarjeta-cerrada'),
  'tarjeta-con-timba': () => mensajeDeMotivo('tarjeta-con-timba'),
  'grupo-no-existe': (s) => `Ese ${s} no es de este torneo.`,
  'grupo-con-tarjeta': (s) => `Ese ${s} ya tiene tarjeta.`,
  'grupo-con-jugadores': (s) => `Ese ${s} tiene jugadores. Cámbialos de ${s} o retíralos primero.`,
  'grupo-con-golpes': (s) => `Ese ${s} ya tiene golpes anotados.`,
  'nombre-repetido': (s) => `Ya hay un ${s} con ese nombre.`,
  'tarjeta-distinta': (s) => `No se pudo armar la tarjeta del ${s}: no calza con las de los demás. Escríbenos a soporte.`,
  error: () => 'No se pudo hacer el cambio. Intenta de nuevo.',
}

const MOTIVOS = new Set<string>(Object.keys(MENSAJES))

function falla(torneo: TorneoParaEditar, motivo: MotivoGrupoEnJuego): ResultadoGrupoEnJuego {
  return { ok: false, motivo, mensaje: MENSAJES[motivo](sustantivo(torneo)) }
}

const normalizar = (nombre: string) => nombre.trim().toLowerCase()

/**
 * Nombre por defecto de un grupo nuevo: la convención del panel ("Grupo 1", "Equipo 1"; el placeholder de
 * `GroupsSection`), con el primer número desde la cantidad de grupos + 1 que no esté usado (sin mayúsculas, como la
 * RPC compara los nombres).
 */
export function nombreDeGrupoNuevo(formato: string | null | undefined, existentes: string[]): string {
  const prefijo = isTeamFormat(formato) ? 'Equipo' : 'Grupo'
  const usados = new Set(existentes.map(normalizar))
  let n = existentes.length + 1
  while (usados.has(normalizar(`${prefijo} ${n}`))) n++
  return `${prefijo} ${n}`
}

async function leerNombresDeGrupos(svc: SupabaseClient, tournamentId: string): Promise<string[] | null> {
  const { data, error } = await svc.from('tournament_groups').select('name').eq('tournament_id', tournamentId)
  if (error) {
    void captureError(error, { context: 'grupo-en-juego.leer-nombres', level: 'error', meta: { tournamentId } })
    return null
  }
  return ((data ?? []) as Array<{ name: string }>).map((g) => g.name)
}

/** Respuesta de una RPC de grupo en juego. */
interface RespuestaRpc {
  ok?: boolean
  motivo?: unknown
  group_id?: string
  ronda_libre_id?: string | null
  nombre?: string | null
}

/**
 * Crea un grupo con su tarjeta (vacía) con el torneo en juego. `groupId` = darle tarjeta a un grupo vacío que el
 * inicio no armó (conserva su nombre); sin `groupId`, grupo nuevo con `nombre` o el de `nombreDeGrupoNuevo`.
 */
export async function crearGrupoEnJuego(
  svc: SupabaseClient,
  torneo: TorneoParaEditar,
  opciones: { nombre?: string | null; groupId?: string | null; creatorId: string },
): Promise<ResultadoGrupoEnJuego> {
  const groupId = opciones.groupId ?? null
  const elegido = opciones.nombre?.trim() || null
  const meta = { tournamentId: torneo.id, groupId }

  try {
    const ronda1 = await fetchRoundPlayConfig(svc, torneo, 1)
    // Sin jugadores: en match play nace en stroke play, como la deja `colocar_inscrito_en_grupo` sin filas.
    const tarjeta = tarjetaDeGrupoDeTorneo(torneo, ronda1, 0)

    // Un nombre por defecto puede chocar con otro grupo creado entretanto: se recalcula una vez.
    let reintentosNombre = groupId || elegido ? 0 : 1
    const intentos = CODIGO_INTENTOS + reintentosNombre
    let nombre: string | null = null
    for (let intento = 0; intento < intentos; intento++) {
      if (!groupId && !nombre) {
        if (elegido) nombre = elegido
        else {
          const existentes = await leerNombresDeGrupos(svc, torneo.id)
          if (!existentes) return falla(torneo, 'error')
          nombre = nombreDeGrupoNuevo(resolveFormatoJuego(torneo), existentes)
        }
      }
      const { data, error } = await svc.rpc('crear_grupo_en_juego', {
        p_tournament_id: torneo.id,
        p_group_id: groupId,
        p_nombre: groupId ? null : nombre,
        p_tarjeta: { codigo: nuevoCodigo(), creador_id: opciones.creatorId, ...tarjeta },
      })
      if (error) {
        void captureError(error, { context: 'grupo-en-juego.crear-rpc', level: 'error', meta })
        return falla(torneo, 'error')
      }
      const res = data as RespuestaRpc | null
      if (res?.ok === true && res.group_id) {
        return { ok: true, groupId: res.group_id, rondaLibreId: res.ronda_libre_id ?? null, nombre: res.nombre ?? null }
      }
      if (res?.motivo === 'codigo-repetido') continue
      if (res?.motivo === 'nombre-repetido' && reintentosNombre > 0) {
        reintentosNombre--
        nombre = null
        continue
      }
      if (typeof res?.motivo === 'string' && MOTIVOS.has(res.motivo) && res.motivo !== 'error') {
        // La tarjeta armada con la función del inicio no calza con las del inicio: el torneo cambió después.
        if (res.motivo === 'tarjeta-distinta') {
          void captureError(new Error('grupo-en-juego: la tarjeta nueva no calza con las del inicio'), {
            context: 'grupo-en-juego.tarjeta-distinta',
            level: 'error',
            meta: { ...meta, tarjeta },
          })
        }
        return falla(torneo, res.motivo as MotivoGrupoEnJuego)
      }
      void captureError(new Error(`grupo-en-juego: respuesta inesperada de crear: ${JSON.stringify(res)}`), {
        context: 'grupo-en-juego.crear-respuesta',
        level: 'error',
        meta,
      })
      return falla(torneo, 'error')
    }
    void captureError(new Error('grupo-en-juego: se agotaron los códigos de tarjeta'), { context: 'grupo-en-juego.codigo', level: 'error', meta })
    return falla(torneo, 'error')
  } catch (err) {
    void captureError(err, { context: 'grupo-en-juego.crear', level: 'error', meta })
    return falla(torneo, 'error')
  }
}

/** Borra un grupo vacío (sin inscritos, filas ni golpes) y su tarjeta, con el torneo en juego. */
export async function borrarGrupoEnJuego(
  svc: SupabaseClient,
  torneo: TorneoParaEditar,
  groupId: string,
): Promise<ResultadoGrupoEnJuego> {
  const meta = { tournamentId: torneo.id, groupId }
  try {
    const { data, error } = await svc.rpc('borrar_grupo_en_juego', { p_tournament_id: torneo.id, p_group_id: groupId })
    if (error) {
      void captureError(error, { context: 'grupo-en-juego.borrar-rpc', level: 'error', meta })
      return falla(torneo, 'error')
    }
    const res = data as RespuestaRpc | null
    if (res?.ok === true) return { ok: true, groupId, rondaLibreId: res.ronda_libre_id ?? null, nombre: null }
    if (typeof res?.motivo === 'string' && MOTIVOS.has(res.motivo) && res.motivo !== 'error') {
      return falla(torneo, res.motivo as MotivoGrupoEnJuego)
    }
    void captureError(new Error(`grupo-en-juego: respuesta inesperada de borrar: ${JSON.stringify(res)}`), {
      context: 'grupo-en-juego.borrar-respuesta',
      level: 'error',
      meta,
    })
    return falla(torneo, 'error')
  } catch (err) {
    void captureError(err, { context: 'grupo-en-juego.borrar', level: 'error', meta })
    return falla(torneo, 'error')
  }
}
