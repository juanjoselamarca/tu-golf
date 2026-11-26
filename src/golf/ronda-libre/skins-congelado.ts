/**
 * Los golpes del Skins, congelados al crear la ronda. Spec docs/specs/formato-skins.md («Golpes congelados»).
 *
 * Al crear, la API guarda en `reglas_juego.congelado` los hoyos (número, par, SI) y el course handicap de cada jugador
 * (en la escala de la ronda), sacados del MISMO contexto con que validó (`contextoSkinsDeRondaNueva`). Desde ahí la
 * tabla, el scorer y la liquidación leen esto y no el rating vigente de la cancha: si alguien corrige el rating de un
 * tee a mitad del campeonato, la plata no se mueve.
 *
 * Fuente única de «¿congelado o recalculado?»: `contextoDelSkinsGuardado`. Usa lo congelado solo si calza con la ronda
 * tal como está (la huella: cancha, hoyos, salida, recorridos, índice y tee de cada jugador). Si no calza o no existe
 * (rondas creadas antes de este cambio, o corregidas antes del primer golpe), recalcula como siempre. Después del
 * primer golpe la base no deja cambiar nada de la huella en un Skins (trigger `skins_congelado_tras_el_primer_golpe`):
 * si calzaba al primer golpe, calza hasta el final. Pero NO siempre calza: si el creador corrigió un índice o un tee (o
 * sumó a alguien) antes del primer golpe, nadie vuelve a congelar y la ronda queda recalculando en vivo todo el juego
 * (sin protección ante un cambio del rating de la cancha). El lector lo avisa (`skins-contexto-guardado.ts`); recongelar
 * es tarea de la API de corrección, que todavía no existe.
 */
import { z } from 'zod'
import type { ContextoValidacionSkins, HoyoSkins } from '@/golf/formats/skins'
import { teeDelJugador } from './tee-del-jugador'

export const VERSION_CONGELADO_SKINS = 1

/** Lo que fija los golpes y los hoyos de un Skins. Si cambia, lo congelado ya no describe la ronda. */
export interface HuellaDelSkins {
  courseId: string
  holes: number
  hoyoInicio: number
  /** `null` = la cancha sin recorridos elegidos (un arreglo vacío es lo mismo). */
  recorridos: string[] | null
  /** Por jugador: índice a un decimal (como lo guarda la base, numeric(4,1)) y tee efectivo (`teeDelJugador`). */
  jugadores: Record<string, { indice: number | null; tee: string }>
}

export interface CongeladoSkins {
  version: typeof VERSION_CONGELADO_SKINS
  huella: HuellaDelSkins
  hoyos: HoyoSkins[]
  /** Course handicap de cada jugador en la escala de la ronda (`null` = sin índice). Nunca el % del juego. */
  golpes: Record<string, number | null>
}

/** La ronda y sus jugadores tal como quedan en la base (o como se van a insertar). */
export interface RondaParaLaHuella {
  courseId: string
  holes: number
  hoyoInicio: number | null
  recorridos: readonly string[] | null
  /** Tee de la ronda (el de los jugadores sin tee propio). */
  tees: string | null
  /** En el orden de `jugadorIds`. */
  jugadores: readonly { indice: number | null; tees?: string | null }[]
}

const indiceComoLaBase = (x: number | null): number | null => (x == null ? null : Math.round(x * 10) / 10)

export function huellaDelSkins(ronda: RondaParaLaHuella, jugadorIds: readonly string[]): HuellaDelSkins {
  return {
    courseId: ronda.courseId,
    holes: ronda.holes,
    hoyoInicio: ronda.hoyoInicio ?? 1,
    recorridos: ronda.recorridos && ronda.recorridos.length > 0 ? [...ronda.recorridos] : null,
    jugadores: Object.fromEntries(jugadorIds.map((id, i) => [id, {
      indice: indiceComoLaBase(ronda.jugadores[i]?.indice ?? null),
      tee: teeDelJugador(ronda.jugadores[i], { tees: ronda.tees }),
    }])),
  }
}

/** Lo que la API guarda al crear: el contexto ya validado, con los jugadores en el orden de `jugadorIds`. */
export function congelarContextoSkins(
  contexto: ContextoValidacionSkins,
  ronda: RondaParaLaHuella,
  jugadorIds: readonly string[],
): CongeladoSkins {
  if (contexto.jugadores.length !== jugadorIds.length) {
    throw new Error('congelarContextoSkins: el contexto y los jugadores no calzan')
  }
  return {
    version: VERSION_CONGELADO_SKINS,
    huella: huellaDelSkins(ronda, jugadorIds),
    hoyos: contexto.hoyos.map(h => ({ numero: h.numero, par: h.par, si: h.si })),
    golpes: Object.fromEntries(jugadorIds.map((id, i) => [id, contexto.jugadores[i].courseHandicap])),
  }
}

const numero = z.number().finite()
const congeladoSchema = z.object({
  version: z.literal(VERSION_CONGELADO_SKINS),
  huella: z.object({
    courseId: z.string(),
    holes: z.number().int(),
    hoyoInicio: z.number().int(),
    recorridos: z.array(z.string()).nullable(),
    jugadores: z.record(z.string(), z.object({ indice: numero.nullable(), tee: z.string() })),
  }),
  hoyos: z.array(z.object({ numero: z.number().int(), par: numero, si: numero })).min(1),
  golpes: z.record(z.string(), numero.nullable()),
})

/** `reglas_juego.congelado`; `null` si falta o no es una versión que se sepa leer (entonces se recalcula). */
export function leerCongeladoSkins(reglasJuego: unknown): CongeladoSkins | null {
  if (reglasJuego == null || typeof reglasJuego !== 'object') return null
  const r = congeladoSchema.safeParse((reglasJuego as { congelado?: unknown }).congelado)
  return r.success ? (r.data as CongeladoSkins) : null
}

const mismaHuella = (a: HuellaDelSkins, b: HuellaDelSkins): boolean => {
  if (a.courseId !== b.courseId || a.holes !== b.holes || a.hoyoInicio !== b.hoyoInicio) return false
  if ((a.recorridos ?? []).join('\u0000') !== (b.recorridos ?? []).join('\u0000')) return false
  const ids = Object.keys(b.jugadores)
  if (Object.keys(a.jugadores).length !== ids.length) return false
  return ids.every(id => a.jugadores[id] != null
    && a.jugadores[id].indice === b.jugadores[id].indice && a.jugadores[id].tee === b.jugadores[id].tee)
}

/**
 * El contexto congelado si describe esta ronda tal como está; `null` si no hay o ya no calza. Los nombres son los de
 * hoy (un nombre no cambia golpes).
 */
export function contextoCongeladoQueCalza(
  congelado: CongeladoSkins | null,
  ronda: RondaParaLaHuella & { nombres: readonly string[] },
  jugadorIds: readonly string[],
): ContextoValidacionSkins | null {
  if (!congelado || !mismaHuella(congelado.huella, huellaDelSkins(ronda, jugadorIds))) return null
  if (!jugadorIds.every(id => id in congelado.golpes)) return null
  return {
    jugadores: jugadorIds.map((id, i) => ({ nombre: (ronda.nombres[i] ?? '').trim(), courseHandicap: congelado.golpes[id] })),
    hoyos: congelado.hoyos.map(h => ({ ...h })),
  }
}

export type OrigenDelContextoSkins = 'congelado' | 'recalculado'

/**
 * Fuente única del contexto de un Skins ya creado (tabla, scorer, liquidación): lo congelado si calza; si no, lo que
 * devuelva `recalcular` (el camino de siempre, con el rating vigente).
 */
export async function contextoDelSkinsGuardado(input: {
  reglasJuego: unknown
  ronda: RondaParaLaHuella & { nombres: readonly string[] }
  jugadorIds: readonly string[]
  recalcular: () => Promise<ContextoValidacionSkins>
}): Promise<{ contexto: ContextoValidacionSkins; origen: OrigenDelContextoSkins }> {
  const congelado = contextoCongeladoQueCalza(leerCongeladoSkins(input.reglasJuego), input.ronda, input.jugadorIds)
  if (congelado) return { contexto: congelado, origen: 'congelado' }
  return { contexto: await input.recalcular(), origen: 'recalculado' }
}
