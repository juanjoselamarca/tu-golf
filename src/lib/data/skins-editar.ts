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
 * Si ya empezó (primer golpe, X, punto especial o retiro: `skins_ronda_empezada`) no se mira acá: lo decide la función SQL con la ronda tomada (si se mirara acá, un golpe que llega
 * entre la lectura y la escritura pasaría). La ruta traduce su P0003 a 409.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { MENSAJE_HANDICAP_UN_DECIMAL, tieneUnDecimalComoMaximo } from '@/golf/handicap-index-range'
import { leerReglasSkins } from '@/golf/ronda-libre/skins-del-scorer'
import { esFormatoSkins } from '@/golf/formats/skins/clave'
import { esRondaCerrada } from '@/golf/ronda-libre/estado-ronda'
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

/**
 * La fila que graba la edición. `perfil_sugerido_id` de un jugador que ya estaba: sin la clave se conserva (la pantalla
 * no la lee), `null` la quita (el rival pasó de «con cuenta» a un nombre a mano), un uuid la cambia.
 */
export type FilaEditada = Omit<FilaDeJugadorDeRonda, 'perfil_sugerido_id'> & { perfil_sugerido_id?: string | null }

export type EdicionDelSkins =
  | { ok: true; filas: FilaEditada[]; reglas: ReglasSkinsGuardadas }
  | { ok: false; status: 400 | 503; error: string }

export const MENSAJE_EDITAR_SIN_CREADOR = 'Tu tarjeta va primera y no se puede sacar del Skins.'
export const MENSAJE_EDITAR_JUGADOR_QUE_NO_ESTA =
  'Un jugador ya no está en la ronda. Cierra Editar y vuelve a abrirlo.'
/** 409 de PUT .../skins/jugadores cuando el Skins ya empezó: golpe, X, punto especial o retiro (la función SQL responde P0003). */
export const MENSAJE_SKINS_YA_EMPEZO = 'El Skins ya empezó. Ya no se puede editar.'
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
  // Un null explícito en un jugador que ya estaba quita la cuenta sugerida; filasDeJugadores solo escribe las válidas.
  const editadas: FilaEditada[] = filas.map((f, i) =>
    pedido[i].id && pedido[i].perfil_sugerido_id === null && f.perfil_sugerido_id === undefined ? { ...f, perfil_sugerido_id: null } : f,
  )
  return { ok: true, filas: editadas, reglas: skins.reglas }
}

/** La ronda y sus tarjetas, leídas con el cliente de la sesión (el RLS de siempre). */
export type SkinsAEditar =
  | { status: 'ok'; ronda: RondaDelSkinsAEditar; jugadores: JugadorActualDelSkins[] }
  | { status: 'not_found' }
  | { status: 'error'; error: unknown }

export async function leerSkinsAEditar(supabase: SupabaseClient, codigo: string): Promise<SkinsAEditar> {
  const ronda = await supabase
    .from('rondas_libres')
    .select('id, creador_id, formato_juego, estado, course_id, course_name, holes, hoyo_inicio, recorridos, tees, modo_juego, admin_mode, reglas_juego')
    .eq('codigo', codigo)
    .maybeSingle()
  if (ronda.error) return { status: 'error', error: ronda.error }
  const fila = ronda.data as (RondaDelSkinsAEditar & { formato_juego: string | null; estado: string | null }) | null
  if (!fila || !esFormatoSkins(fila.formato_juego) || esRondaCerrada(fila.estado)) return { status: 'not_found' }
  const jugadores = await supabase.from('ronda_libre_jugadores').select('id, user_id').eq('ronda_id', fila.id)
  if (jugadores.error) return { status: 'error', error: jugadores.error }
  return { status: 'ok', ronda: fila, jugadores: (jugadores.data ?? []) as JugadorActualDelSkins[] }
}

/** Resultado de grabar: el código de la función SQL decide la respuesta (P0003 = ya empezó). */
export type EdicionGuardada =
  | { ok: true }
  | { ok: false; motivo: 'empezado' | 'no_existe' | 'no_calza' | 'error'; error?: unknown }

/**
 * Llama a `editar_jugadores_skins` con service_role: todo o nada, con la ronda tomada. Viajan las filas y lo
 * congelado; la config NO (la función deja la guardada tal cual y arma jugadorIds con los ids de las filas): así una
 * versión nueva de la app que reparsee la config distinto no puede chocar con la guardada.
 */
export async function guardarEdicionDelSkins(
  admin: SupabaseClient,
  rondaId: string,
  edicion: { filas: readonly FilaEditada[]; reglas: ReglasSkinsGuardadas },
): Promise<EdicionGuardada> {
  if (!edicion.reglas.congelado) throw new Error('guardarEdicionDelSkins: falta lo congelado')
  const { error } = await admin.rpc('editar_jugadores_skins', {
    p_ronda_id: rondaId,
    p_jugadores: edicion.filas,
    p_congelado: edicion.reglas.congelado,
  })
  if (!error) return { ok: true }
  if (error.code === 'P0003') return { ok: false, motivo: 'empezado' }
  if (error.code === 'P0002') return { ok: false, motivo: 'no_existe' }
  if (error.code === 'P0001') return { ok: false, motivo: 'no_calza', error }
  return { ok: false, motivo: 'error', error }
}
