// src/lib/data/tournaments/colocarInscrito.ts
//
// Agregar, mover o borrar a un inscrito con el torneo EN JUEGO (#814 · PR3). Una sola primitiva:
//
//   leer → `planDeColocar` (puro: `motivoParaNoColocar` + los argumentos de la RPC) → RPC `colocar_inscrito_en_grupo`
//
// La app planifica para responder rápido y con un motivo claro; la RPC es la autoridad: re-verifica bajo lock lo que
// el plan leyó (`p_esperado`, control optimista) y vuelve a evaluar todo lo que depende de los golpes. Si otro cambio
// gana la carrera, la RPC devuelve `conflicto` y esta capa relee y replanifica (máx. `MAX_REINTENTOS_COLOCAR`).
//
// Nada de lo que decide la regla viene del cliente: el formato y la política salen del torneo leído de la base
// (`resolveFormatoJuego` → `politicaDeColocar`), el hándicap de cada equipo se calcula acá con los que COMPITEN
// (`miembrosQueCompiten`, el mismo conteo de la RPC) y la fila nueva con `filaDeHandicapDeTorneo` (la del inicio).
// Plan: docs/superpowers/plans/2026-11-18-gestion-en-juego-814.md (D1-D14).

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { isSharedBallFormat, resolveFormatoJuego } from '@/golf/formats'
import { hoyosJugadosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { hoyosAnotados } from '@/golf/ronda-libre/progreso-de-ronda'
import type { ScoresDeTarjeta } from '@/golf/ronda-libre/tarjeta-historica'
import { filaDeHandicapDeTorneo } from '@/golf/ronda-libre/handicap-tarjeta-de-torneo'
import {
  esCodigoMotivoColocar,
  estadoDelInscrito,
  MENSAJE_MOTIVO_DESCONOCIDO,
  mensajeDeMotivo,
  miembrosQueCompiten,
  motivoParaNoColocar,
  politicaDeColocar,
  tarjetaTieneAnotaciones,
  type CodigoMotivoColocar,
  type GrupoEnJuego,
  type OperacionEnJuego,
  type PoliticaDeColocar,
} from '@/golf/torneo/gestion-en-juego'
import { leerHandicapDeEquipo } from '@/lib/draft/team-config-legacy'
import { playerName } from './motivo-para-no-iniciar'
import { fetchRoundPlayConfig } from './rounds'
import { fetchContextoHcpDeEquipos, START_PLAYER_SELECT, type ContextoHcpDeEquipos, type StartPlayer } from './startTournament'
import { handicapsDeEquipoDelGrupo, isProducerTeamFormat } from './teamRounds'
import type { TorneoParaEditar } from './editarHandicapInscrito'

// ─── Lectura ─────────────────────────────────────────────────────────────────────────────────────────────────

/** `players` con lo que entra a la huella de `p_esperado` (`category_id` no está en `START_PLAYER_SELECT`). */
export const INSCRITO_PARA_COLOCAR_SELECT = `${START_PLAYER_SELECT}, category_id`

export interface InscritoLeido extends StartPlayer {
  category_id: string | null
}

/** Un grupo del torneo con su tarjeta, tal como lo lee la gestión. */
export interface GrupoLeido {
  id: string
  ronda_libre_id: string | null
  /** Todos sus inscritos (`tournament_group_players`), también WD/DQ y sin aprobar. */
  jugadores: InscritoLeido[]
  /** Las filas de su tarjeta (`ronda_libre_jugadores`), también las de WD/DQ. */
  filas: Array<{ id: string; scores: ScoresDeTarjeta | null }>
  /** `ronda_equipos.scores` de su tarjeta (bola compartida), o null si no hay equipo. */
  equipoScores: ScoresDeTarjeta | null
  /** El hándicap guardado de su equipo (`ronda_equipos`), o null si no hay equipo. */
  equipoHandicap: { completo: number | null; juego: number | null } | null
  /** Su tarjeta (`rondas_libres`), o null si el grupo todavía no la tiene. */
  tarjeta: { estado: string | null; holes: number; hoyo_inicio: number | null } | null
}

export interface LecturaDeColocar {
  inscrito: InscritoLeido
  /** Su fila en la tarjeta de su grupo (`tournament_group_players.jugador_ronda_id`). */
  jugadorRondaId: string | null
  origen: GrupoLeido | null
  destino: GrupoLeido | null
  /** ¿Anotó en su tarjeta individual del torneo (`rounds` → `hole_scores`, #828)? */
  golpesEnTarjetaIndividual: boolean
}

type LecturaFallida = 'no-existe' | 'grupo-no-existe' | 'inconsistente'

/** `numeric` llega como number; por si acaso, string → number. */
function numeroONull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizar(p: InscritoLeido): InscritoLeido {
  return { ...p, handicap_at_registration: numeroONull(p.handicap_at_registration), category_id: p.category_id ?? null }
}

/**
 * Lee al inscrito, su grupo actual (origen) y el destino con sus tarjetas. `destinoId` null = borrar.
 * 'inconsistente' = el inscrito aparece en más de un grupo (la RPC también lo rechaza).
 */
export async function leerColocar(
  svc: SupabaseClient,
  torneoId: string,
  playerId: string,
  destinoId: string | null,
): Promise<LecturaDeColocar | LecturaFallida> {
  const { data: player, error: pErr } = await svc
    .from('players')
    .select(INSCRITO_PARA_COLOCAR_SELECT)
    .eq('id', playerId)
    .eq('tournament_id', torneoId)
    .maybeSingle()
  if (pErr) throw pErr
  if (!player) return 'no-existe'
  const inscrito = normalizar(player as unknown as InscritoLeido)

  const { data: grupos, error: gErr } = await svc
    .from('tournament_groups')
    .select('id, ronda_libre_id')
    .eq('tournament_id', torneoId)
  if (gErr) throw gErr
  const delTorneo = new Map(((grupos ?? []) as Array<{ id: string; ronda_libre_id: string | null }>).map((g) => [g.id, g]))
  if (destinoId && !delTorneo.has(destinoId)) return 'grupo-no-existe'

  const { data: enlaces, error: eErr } = await svc
    .from('tournament_group_players')
    .select('group_id, jugador_ronda_id')
    .eq('player_id', playerId)
  if (eErr) throw eErr
  const suyos = ((enlaces ?? []) as Array<{ group_id: string; jugador_ronda_id: string | null }>).filter((e) => delTorneo.has(e.group_id))
  if (suyos.length > 1) return 'inconsistente'
  const enlace = suyos[0] ?? null

  const ids = [...new Set([enlace?.group_id, destinoId].filter((x): x is string => !!x))]
  const leidos = new Map<string, GrupoLeido>()
  for (const id of ids) leidos.set(id, await leerGrupo(svc, delTorneo.get(id)!))

  // #828: un inscrito anota en su tarjeta individual del torneo. Cualquier hole_score cuenta (espejo de la RPC).
  const { data: rondas, error: rErr } = await svc
    .from('rounds')
    .select('id, hole_scores(id)')
    .eq('tournament_id', torneoId)
    .eq('player_id', playerId)
  if (rErr) throw rErr
  const golpesEnTarjetaIndividual = ((rondas ?? []) as Array<{ hole_scores: unknown[] | null }>).some((r) => (r.hole_scores?.length ?? 0) > 0)

  return {
    inscrito,
    jugadorRondaId: enlace?.jugador_ronda_id ?? null,
    origen: enlace ? leidos.get(enlace.group_id)! : null,
    destino: destinoId ? leidos.get(destinoId)! : null,
    golpesEnTarjetaIndividual,
  }
}

async function leerGrupo(svc: SupabaseClient, g: { id: string; ronda_libre_id: string | null }): Promise<GrupoLeido> {
  const { data: tgps, error: tErr } = await svc.from('tournament_group_players').select('player_id').eq('group_id', g.id)
  if (tErr) throw tErr
  const playerIds = ((tgps ?? []) as Array<{ player_id: string }>).map((t) => t.player_id)
  let jugadores: InscritoLeido[] = []
  if (playerIds.length > 0) {
    const { data, error } = await svc.from('players').select(INSCRITO_PARA_COLOCAR_SELECT).in('id', playerIds)
    if (error) throw error
    jugadores = ((data ?? []) as unknown as InscritoLeido[]).map(normalizar)
  }
  if (!g.ronda_libre_id) return { id: g.id, ronda_libre_id: null, jugadores, filas: [], equipoScores: null, equipoHandicap: null, tarjeta: null }

  const { data: rl, error: rlErr } = await svc
    .from('rondas_libres')
    .select('estado, holes, hoyo_inicio, ronda_libre_jugadores(id, scores), ronda_equipos(scores, handicap_equipo, handicap_equipo_juego)')
    .eq('id', g.ronda_libre_id)
    .maybeSingle()
  if (rlErr) throw rlErr
  const card = rl as {
    estado: string | null
    holes: number | null
    hoyo_inicio: number | null
    ronda_libre_jugadores: Array<{ id: string; scores: ScoresDeTarjeta | null }> | null
    ronda_equipos: Array<{ scores: ScoresDeTarjeta | null; handicap_equipo: unknown; handicap_equipo_juego: unknown }> | null
  } | null
  const equipo = card?.ronda_equipos?.[0] ?? null
  return {
    id: g.id,
    ronda_libre_id: g.ronda_libre_id,
    jugadores,
    filas: card?.ronda_libre_jugadores ?? [],
    equipoScores: equipo?.scores ?? null,
    equipoHandicap: equipo ? { completo: numeroONull(equipo.handicap_equipo), juego: numeroONull(equipo.handicap_equipo_juego) } : null,
    tarjeta: card ? { estado: card.estado, holes: card.holes ?? 18, hoyo_inicio: card.hoyo_inicio } : null,
  }
}

// ─── Plan (puro) ─────────────────────────────────────────────────────────────────────────────────────────────

/** Huella de un inscrito en `p_esperado`: lo que entra al hándicap de equipo (formato exacto de la RPC). */
export interface HuellaDeInscrito {
  status: string
  handicap: number | null
  tee_id: string | null
  genero: string | null
  category_id: string | null
}

export function huellaDe(p: InscritoLeido): HuellaDeInscrito {
  return {
    status: p.status,
    handicap: p.handicap_at_registration ?? null,
    tee_id: p.tee_id ?? null,
    genero: p.genero ?? null,
    category_id: p.category_id ?? null,
  }
}

/** Los argumentos de `colocar_inscrito_en_grupo` (formato exacto: ver la migración 20261122100000). */
export interface ArgumentosDeColocar {
  p_tournament_id: string
  p_player_id: string
  p_grupo_destino: string | null
  p_esperado: {
    inscrito: HuellaDeInscrito & { grupo: string | null }
    grupos: Array<{ group_id: string; ronda_libre_id: string | null; jugadores: Array<HuellaDeInscrito & { player_id: string }> }>
  }
  p_fila: { nombre: string; handicap?: number | null; handicap_de_inscripcion?: boolean } | null
  p_equipos: Array<{ group_id: string; handicap_equipo: number | null; handicap_equipo_juego: number | null }>
  p_politica: PoliticaDeColocar
  p_borrar_inscrito: boolean
}

/** Motivo para no hacerlo: el de la regla, o uno de esta capa. */
export interface MotivoDeColocar {
  codigo: CodigoMotivoColocar
  mensaje: string
  ofreceRetirar: boolean
}

/** Para confirmar una acción que toca golpes (D2, D4, D9): hoyos que lleva el inscrito y los del grupo destino. */
export interface GolpesEnJuego {
  inscrito: number
  destino: number
}

export type PlanDeColocar =
  | { motivo: MotivoDeColocar }
  | { args: ArgumentosDeColocar; operacion: OperacionEnJuego['tipo']; golpes: GolpesEnJuego | null }

const rechazo = (codigo: CodigoMotivoColocar): { motivo: MotivoDeColocar } => ({
  motivo: { codigo, mensaje: mensajeDeMotivo(codigo), ofreceRetirar: false },
})

function hoyosDe(g: GrupoLeido): number[] {
  return g.tarjeta ? hoyosJugadosDeLaRonda(g.tarjeta.hoyo_inicio, g.tarjeta.holes) : []
}

/** `GrupoEnJuego` de un grupo leído, con los conteos de la RPC (`miembros` = los que compiten). */
export function grupoEnJuego(g: GrupoLeido, compartida: boolean): GrupoEnJuego {
  const hoyos = hoyosDe(g)
  return {
    id: g.id,
    miembros: miembrosQueCompiten(g.jugadores).length,
    integrantes: g.filas.length,
    tieneGolpes: compartida
      ? tarjetaTieneAnotaciones(g.equipoScores, hoyos)
      : g.filas.some((f) => tarjetaTieneAnotaciones(f.scores, hoyos)),
  }
}

/**
 * Qué escribe la colocación, o por qué no. PURA. `contexto` es obligatorio si algún equipo de bola compartida queda
 * con jugadores suficientes para tener hándicap (como en `planDeEdicion`).
 */
export function planDeColocar(args: {
  torneo: Pick<TorneoParaEditar, 'id' | 'status' | 'total_rounds' | 'format' | 'formato_juego' | 'hcp_calc_mode' | 'team_config'>
  lectura: LecturaDeColocar
  destinoId: string | null
  contexto: { hcp: ContextoHcpDeEquipos; holeCount: number } | null
}): PlanDeColocar | { error: 'equipo-sin-contexto' } {
  const { torneo, lectura, destinoId, contexto } = args
  const formato = resolveFormatoJuego(torneo)
  const politica = politicaDeColocar(formato)
  if (!politica) return rechazo('formato-desconocido')
  // Respuesta rápida de lo que la RPC exige bajo lock.
  if (torneo.status !== 'in_progress') return rechazo('torneo-no-en-juego')
  if ((torneo.total_rounds ?? 1) > 1) return rechazo('torneo-varias-rondas')

  const { inscrito, origen, destino, jugadorRondaId } = lectura
  if (origen && destino && origen.id === destino.id) return rechazo('mismo-grupo')
  for (const g of [origen, destino]) {
    if (!g) continue
    if (!g.tarjeta) return rechazo('grupo-sin-tarjeta')
    if (g.tarjeta.estado !== 'en_curso') return rechazo('tarjeta-cerrada')
  }

  const compartida = politica.bola_compartida
  const gOrigen = origen ? grupoEnJuego(origen, compartida) : null
  const gDestino = destino ? grupoEnJuego(destino, compartida) : null
  const op: OperacionEnJuego = !destinoId
    ? { tipo: 'borrar', origen: gOrigen }
    : gOrigen ? { tipo: 'mover', origen: gOrigen, destino: gDestino! } : { tipo: 'agregar', destino: gDestino! }

  // Golpes del inscrito: su fila y, sin grupo o al borrar, su tarjeta individual (espejo de `v_ins_golpes`).
  const suFila = origen?.filas.find((f) => f.id === jugadorRondaId) ?? null
  const hoyosSuyos = suFila && origen ? hoyosAnotados(suFila.scores, hoyosDe(origen)) : 0
  const tieneGolpes = hoyosSuyos > 0 || ((!origen || op.tipo === 'borrar') && lectura.golpesEnTarjetaIndividual)
  const estado = estadoDelInscrito(inscrito.status)
  const handicap = leerHandicapDeEquipo(torneo.team_config)

  const m = motivoParaNoColocar(formato, op, { tieneGolpes, estado, tieneFila: jugadorRondaId != null }, handicap)
  if (m) return { motivo: { codigo: m.codigo, mensaje: m.mensaje, ofreceRetirar: m.ofreceRetirar } }

  // Equipos: cada grupo tocado que queda con filas lleva su hándicap, con los que COMPITEN después de la operación.
  // D12: un sin aprobar que llega a un grupo entra aprobado.
  const p_equipos: ArgumentosDeColocar['p_equipos'] = []
  if (politica.equipo) {
    const llega: InscritoLeido = { ...inscrito, status: estado === 'sin-aprobar' ? 'approved' : inscrito.status }
    const despues: Array<{ g: GrupoLeido; enJuego: GrupoEnJuego; jugadores: InscritoLeido[]; filas: number }> = []
    if (origen && gOrigen) {
      despues.push({
        g: origen,
        enJuego: gOrigen,
        jugadores: origen.jugadores.filter((j) => j.id !== inscrito.id),
        filas: origen.filas.length - (jugadorRondaId ? 1 : 0),
      })
    }
    if (destino && gDestino) {
      despues.push({ g: destino, enJuego: gDestino, jugadores: [...destino.jugadores, llega], filas: 1 })
    }
    const min = politica.jugadores_por_equipo?.min ?? 1
    for (const { g, enJuego, jugadores, filas } of despues) {
      if (filas <= 0) continue
      const compiten = miembrosQueCompiten(jugadores)
      if (!compartida) {
        p_equipos.push({ group_id: g.id, handicap_equipo: null, handicap_equipo_juego: null })
        continue
      }
      // Si los que compiten no cambian (sale un sin aprobar o un WD/DQ), el equipo es el mismo: se reescribe el
      // hándicap guardado, sin recalcular (no cambia el neto de un equipo por algo que no lo toca).
      const guardado = g.equipoHandicap
      const mismos = mismosIds(miembrosQueCompiten(g.jugadores), compiten)
      if (mismos && guardado && (compiten.length < min || (guardado.completo !== null && guardado.juego !== null))) {
        p_equipos.push({ group_id: g.id, handicap_equipo: guardado.completo, handicap_equipo_juego: guardado.juego })
        continue
      }
      if (compiten.length < min) {
        // Un equipo que ya juega no se queda sin hándicap: la RPC lo pisaría con null y cambiaría su neto (falla
        // cerrado; con los motivos de arriba no debería llegar acá).
        if (enJuego.tieneGolpes) return rechazo('equipo-con-golpes-incompleto')
        p_equipos.push({ group_id: g.id, handicap_equipo: null, handicap_equipo_juego: null })
        continue
      }
      if (!contexto) return { error: 'equipo-sin-contexto' }
      const hcp = handicapsDeEquipoDelGrupo({
        formato,
        members: compiten,
        handicap,
        ctx: contexto.hcp.ctx,
        parTotal: contexto.hcp.parTotal,
        holeCount: contexto.holeCount,
        parDe18Hoyos: contexto.hcp.parDe18Hoyos,
      })
      if (hcp.completo === null) return rechazo('handicap-de-equipo')
      p_equipos.push({ group_id: g.id, handicap_equipo: hcp.completo, handicap_equipo_juego: hcp.juego })
    }
  }

  // Fila nueva: llega a un grupo sin fila (agregar, o un sin aprobar que se aprueba, D12). La del inicio.
  let p_fila: ArgumentosDeColocar['p_fila'] = null
  if (destino && !jugadorRondaId) {
    p_fila = { nombre: playerName(inscrito), ...filaDeHandicapDeTorneo(inscrito, torneo.hcp_calc_mode, isProducerTeamFormat(formato)) }
  }

  const grupos = [origen, destino].filter((g): g is GrupoLeido => !!g)
  const argsRpc: ArgumentosDeColocar = {
    p_tournament_id: torneo.id,
    p_player_id: inscrito.id,
    p_grupo_destino: destinoId,
    p_esperado: {
      inscrito: { ...huellaDe(inscrito), grupo: origen?.id ?? null },
      grupos: grupos.map((g) => ({
        group_id: g.id,
        ronda_libre_id: g.ronda_libre_id,
        jugadores: g.jugadores.map((j) => ({ player_id: j.id, ...huellaDe(j) })),
      })),
    },
    p_fila,
    p_equipos,
    p_politica: politica,
    p_borrar_inscrito: !destinoId,
  }

  const hoyosDestino = destino ? Math.max(0, ...hoyosDelGrupo(destino, compartida)) : 0
  const tocaGolpes = op.tipo !== 'borrar' && (tieneGolpes || !!gOrigen?.tieneGolpes || !!gDestino?.tieneGolpes)
  return { args: argsRpc, operacion: op.tipo, golpes: tocaGolpes ? { inscrito: hoyosSuyos, destino: hoyosDestino } : null }
}

function mismosIds(a: ReadonlyArray<{ id: string }>, b: ReadonlyArray<{ id: string }>): boolean {
  if (a.length !== b.length) return false
  const ids = new Set(a.map((x) => x.id))
  return b.every((x) => ids.has(x.id))
}

/** Hoyos anotados por fila (o del equipo, en bola compartida): "el grupo destino va en el M". */
function hoyosDelGrupo(g: GrupoLeido, compartida: boolean): number[] {
  const hoyos = hoyosDe(g)
  if (compartida) return [hoyosAnotados(g.equipoScores, hoyos)]
  return g.filas.map((f) => hoyosAnotados(f.scores, hoyos))
}

// ─── Escritura ───────────────────────────────────────────────────────────────────────────────────────────────

export type ResultadoColocar =
  | { ok: true; operacion: OperacionEnJuego['tipo']; aprobado: boolean; jugadorRondaId: string | null }
  | { ok: false; motivo: CodigoMotivoColocar; mensaje: string; ofreceRetirar: boolean }
  /** Toca golpes y el organizador no lo confirmó (D2, D4, D9): la UI muestra los hoyos y vuelve con `confirmado`. */
  | { ok: false; motivo: 'requiere-confirmacion'; mensaje: string; ofreceRetirar: false; golpes: GolpesEnJuego }
  | { ok: false; motivo: 'no-existe' | 'grupo-no-existe' | 'cambio-el-origen' | 'error'; mensaje: string; ofreceRetirar: false }

/** Reintentos cuando otro cambio gana la carrera (`conflicto`). */
export const MAX_REINTENTOS_COLOCAR = 3

export const MENSAJE_REQUIERE_CONFIRMACION = 'Este cambio toca golpes ya anotados. Confírmalo para seguir.'

const falla = (motivo: 'no-existe' | 'grupo-no-existe' | 'cambio-el-origen' | 'error'): ResultadoColocar => ({
  ok: false,
  motivo,
  ofreceRetirar: false,
  mensaje: {
    'no-existe': 'Jugador no encontrado en este torneo.',
    'grupo-no-existe': 'Ese grupo no es de este torneo.',
    'cambio-el-origen': mensajeDeMotivo('conflicto'),
    error: 'No se pudo hacer el cambio. Intenta de nuevo.',
  }[motivo],
})

/**
 * Coloca a `playerId` en `destinoId` (null = borrarlo). El caller ya validó sesión y organizador.
 *  - `desde`: el grupo en que el organizador lo vio (null = sin grupo; undefined = no se exige, p. ej. borrar). Si
 *    ya no está ahí, no se escribe: lo movió otro y la intención ya no aplica.
 *  - `confirmado`: el organizador confirmó una acción que toca golpes.
 */
export async function colocarInscrito(
  svc: SupabaseClient,
  torneo: TorneoParaEditar,
  playerId: string,
  destinoId: string | null,
  opciones: { desde?: string | null; confirmado?: boolean } = {},
): Promise<ResultadoColocar> {
  const meta = { tournamentId: torneo.id, playerId, destinoId }
  try {
    let contexto: { hcp: ContextoHcpDeEquipos; holeCount: number } | null | undefined
    const leerContexto = async () => {
      if (contexto !== undefined) return contexto
      const ronda1 = await fetchRoundPlayConfig(svc, torneo, 1)
      const hcp = await fetchContextoHcpDeEquipos(svc, torneo, ronda1)
      contexto = hcp ? { hcp, holeCount: ronda1.holeCount } : null
      return contexto
    }
    const compartida = isSharedBallFormat(resolveFormatoJuego(torneo))

    for (let intento = 1; intento <= MAX_REINTENTOS_COLOCAR; intento++) {
      const lectura = await leerColocar(svc, torneo.id, playerId, destinoId)
      if (lectura === 'no-existe' || lectura === 'grupo-no-existe') return falla(lectura)
      if (lectura === 'inconsistente') {
        void captureError(new Error('colocar-inscrito: el inscrito está en más de un grupo'), { context: 'colocar-inscrito.inconsistente', level: 'error', meta })
        return falla('error')
      }
      if (opciones.desde !== undefined && (lectura.origen?.id ?? null) !== opciones.desde) return falla('cambio-el-origen')

      const plan = planDeColocar({ torneo, lectura, destinoId, contexto: compartida ? await leerContexto() : null })
      if ('error' in plan) {
        void captureError(new Error(`colocar-inscrito: ${plan.error}`), { context: 'colocar-inscrito.plan', level: 'error', meta })
        return falla('error')
      }
      if ('motivo' in plan) return { ok: false, motivo: plan.motivo.codigo, mensaje: plan.motivo.mensaje, ofreceRetirar: plan.motivo.ofreceRetirar }
      if (plan.golpes && !opciones.confirmado) {
        return { ok: false, motivo: 'requiere-confirmacion', mensaje: MENSAJE_REQUIERE_CONFIRMACION, ofreceRetirar: false, golpes: plan.golpes }
      }

      const { data, error } = await svc.rpc('colocar_inscrito_en_grupo', plan.args)
      if (error) {
        void captureError(error, { context: 'colocar-inscrito.rpc', level: 'error', meta })
        return falla('error')
      }
      const res = data as { ok?: boolean; motivo?: unknown; ofrece_retirar?: boolean; operacion?: OperacionEnJuego['tipo']; aprobado?: boolean; jugador_ronda_id?: string | null } | null
      if (res?.ok === true) {
        return { ok: true, operacion: res.operacion ?? plan.operacion, aprobado: res.aprobado === true, jugadorRondaId: res.jugador_ronda_id ?? null }
      }
      if (res?.motivo === 'conflicto') continue
      if (!esCodigoMotivoColocar(res?.motivo)) {
        void captureError(new Error(`colocar-inscrito: respuesta inesperada de la RPC: ${JSON.stringify(res)}`), { context: 'colocar-inscrito.respuesta', level: 'error', meta })
        return { ok: false, motivo: 'error', mensaje: MENSAJE_MOTIVO_DESCONOCIDO, ofreceRetirar: false }
      }
      const ofreceRetirar = res?.ofrece_retirar === true
      return { ok: false, motivo: res.motivo, mensaje: mensajeDeMotivo(res.motivo, { ofreceRetirar }), ofreceRetirar }
    }
    return { ok: false, motivo: 'conflicto', mensaje: mensajeDeMotivo('conflicto'), ofreceRetirar: false }
  } catch (err) {
    void captureError(err, { context: 'colocar-inscrito', level: 'error', meta })
    return falla('error')
  }
}
