/**
 * Editar los jugadores de un Skins antes del primer golpe (spec docs/specs/formato-skins.md, «Editar antes del primer
 * golpe»). Arma lo que graba `editar_jugadores_skins` (migración 20261126100000) con las MISMAS piezas que la creación:
 * `validarNuevaRonda`, `verificarPerfilesSugeridos`, `skinsParaCrearRonda` (validador del motor + contexto + congelado)
 * y `filasDeJugadores`. Lo único que cambia son los ids: un jugador que ya estaba conserva el suyo (sus marcas y su
 * tarjeta siguen siendo de él), uno nuevo recibe uno al azar.
 *
 * La config del Skins (pozo, variantes, modo, % de hándicap) NO viene del cliente: se toma de lo guardado. La cancha,
 * los hoyos, la salida y los tees de la ronda tampoco se editan.
 *
 * El primer golpe no se mira acá: lo decide la función SQL con la ronda tomada (si se mirara acá, un golpe que llega
 * entre la lectura y la escritura pasaría). La ruta traduce su P0003 a 409.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { MENSAJE_HANDICAP_UN_DECIMAL, tieneUnDecimalComoMaximo } from '@/golf/handicap-index-range'
import { leerReglasSkins } from '@/golf/ronda-libre/skins-del-scorer'
import type { ReglasSkinsGuardadas } from '@/golf/ronda-libre/skins-de-ronda-nueva'
import { validarNuevaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import { filasDeJugadores, perfilSugerido, verificarPerfilesSugeridos, type FilaDeJugadorDeRonda, type JugadorDeRonda } from './ronda-libre-jugadores-filas'
import { skinsParaCrearRonda } from './skins-ronda-nueva'

/** La ronda guardada, con lo que hace falta para validar y congelar igual que al crear. */
export interface RondaDelSkinsAEditar {
  id: string
  creador_id: string
  course_id: string | null
  course_name: string | null
  holes: number
  hoyo_inicio: number | null
  recorridos: string[] | null
  tees: string
  modo_juego: string
  admin_mode: boolean | null
  reglas_juego: unknown
}

export interface JugadorActualDelSkins {
  id: string
  user_id: string | null
}

/** Un jugador del pedido: la forma de crear más el id si ya estaba en la ronda. */
export type JugadorEditado = JugadorDeRonda & { id?: string }

export type EdicionDelSkins =
  | { ok: true; filas: FilaDeJugadorDeRonda[]; reglas: ReglasSkinsGuardadas }
  | { ok: false; status: 400 | 503; error: string }

export const MENSAJE_EDITAR_SIN_CREADOR = 'Tu tarjeta va primera y no se puede sacar del Skins.'
export const MENSAJE_EDITAR_JUGADOR_QUE_NO_ESTA =
  'Un jugador ya no está en la ronda. Cierra Editar y vuelve a abrirlo.'
export const MENSAJE_EDITAR_REGLAS_ILEGIBLES = 'No pudimos leer las reglas del Skins. Vuelve a cargar la ronda.'

export async function prepararEdicionDelSkins(
  supabase: SupabaseClient,
  input: {
    ronda: RondaDelSkinsAEditar
    jugadoresActuales: readonly JugadorActualDelSkins[]
    pedido: readonly JugadorEditado[]
    creadorId: string
  },
): Promise<EdicionDelSkins> {
  const { ronda, jugadoresActuales, pedido, creadorId } = input
  const guardadas = leerReglasSkins(ronda.reglas_juego)
  if (!guardadas) return { ok: false, status: 400, error: MENSAJE_EDITAR_REGLAS_ILEGIBLES }

  // La tarjeta del creador (la que anota) sigue y sigue primera.
  const tarjetaDelCreador = jugadoresActuales.find(j => j.user_id === creadorId)
  if (!tarjetaDelCreador || pedido[0]?.id !== tarjetaDelCreador.id) {
    return { ok: false, status: 400, error: MENSAJE_EDITAR_SIN_CREADOR }
  }
  const actuales = new Set(jugadoresActuales.map(j => j.id))
  const vistos = new Set<string>()
  for (const j of pedido) {
    if (!j.id) continue
    if (!actuales.has(j.id) || vistos.has(j.id)) return { ok: false, status: 400, error: MENSAJE_EDITAR_JUGADOR_QUE_NO_ESTA }
    vistos.add(j.id)
  }

  // Desde acá, igual que POST /api/ronda-libre/create.
  const problema = validarNuevaRonda({
    cancha: ronda.course_name ?? '',
    formato: 'skins' as FormatoJuego,
    modo: ronda.modo_juego as ModoJuego,
    jugadores: pedido.map((j, i) => ({ nombre: j.nombre, indice: j.handicap, perfilId: perfilSugerido(j, i) })),
    equipos: [],
    creadorId,
  })
  if (problema) return { ok: false, status: 400, error: problema.detalle }

  const conDosDecimales = pedido.find(j => j.handicap != null && !tieneUnDecimalComoMaximo(j.handicap))
  if (conDosDecimales) return { ok: false, status: 400, error: `Índice de ${conDosDecimales.nombre}: ${MENSAJE_HANDICAP_UN_DECIMAL}` }

  const perfiles = await verificarPerfilesSugeridos(pedido, { userId: creadorId, context: 'ronda-libre.skins-editar.perfil-sugerido' })
  if (!perfiles.ok) return { ok: false, status: 400, error: perfiles.error }

  const idsDelPedido = pedido.map(j => j.id ?? crypto.randomUUID())
  let siguiente = 0
  const skins = await skinsParaCrearRonda(supabase, {
    reglasJuego: guardadas.config,
    modoDeLaRonda: ronda.modo_juego,
    courseId: ronda.course_id,
    holes: ronda.holes,
    hoyoInicio: ronda.hoyo_inicio,
    recorridos: ronda.recorridos,
    tees: ronda.tees,
    jugadores: pedido.map(j => ({ nombre: j.nombre, indice: j.handicap, tees: j.tees })),
    adminMode: ronda.admin_mode === true,
    // Se pide una vez por jugador, en orden: devuelve el id que ya tenía (o uno nuevo) en esa posición.
    nuevoId: () => idsDelPedido[siguiente++],
  })
  if (!skins.ok) return skins
  if (skins.jugadorIds.join() !== idsDelPedido.join()) {
    throw new Error('prepararEdicionDelSkins: los ids del Skins no calzan con el pedido')
  }

  const filas = filasDeJugadores({
    jugadores: pedido,
    rondaId: ronda.id,
    creadorId,
    jugadorIds: skins.jugadorIds,
    perfilesValidos: perfiles.validos,
    teesDeLaRonda: ronda.tees,
  })
  return { ok: true, filas, reglas: skins.reglas }
}
