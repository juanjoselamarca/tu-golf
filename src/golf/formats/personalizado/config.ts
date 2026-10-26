/**
 * Config de un juego de Timba libre (formato `personalizado`). Spec: docs/specs/formato-personalizado.md.
 *
 * Es DATO, no código: La Colombiana, el 2-0-2, La Subterránea y La Subterror son plantillas armadas con
 * estas piezas, y "Personalizado total" deja combinarlas. Se guarda tal cual en `rondas_libres.reglas_juego`
 * (versionada) para poder convertirla después en plantilla compartible sin migrar.
 */
import { z } from 'zod'

export const VERSION_CONFIG_JUEGO = 1

/** Límites de cada perilla: un juego inventado por un usuario no puede salirse de acá. */
export const LIMITES_JUEGO = {
  valorDuelo: { min: 1, max: 10 },
  valorPuesto: { min: -10, max: 10 },
  valorPuntito: { min: 1, max: 10 },
  maxDuelos: 3,
  maxPuntitos: 8,
  largoNombrePuntito: 24,
} as const

export const UNIDADES = ['individual', 'parejas_fijas', 'parejas_rotativas'] as const
export type Unidad = (typeof UNIDADES)[number]

export const TIPOS_DUELO_PAREJA = ['mejor_bola', 'peor_bola', 'suma'] as const
export type TipoDueloPareja = (typeof TIPOS_DUELO_PAREJA)[number]

export const TIPOS_PUNTITO = ['birdie', 'sandy', 'chipingo', 'greenie', 'propio'] as const
export type TipoPuntito = (typeof TIPOS_PUNTITO)[number]

/** Puntitos que se marcan a mano en el scorer (el birdie sale solo de los golpes). */
export const PUNTITOS_MANUALES: readonly TipoPuntito[] = ['sandy', 'chipingo', 'greenie', 'propio']

const entero = (min: number, max: number) => z.number().int().min(min).max(max)

const tablaPorPuesto = z.array(entero(LIMITES_JUEGO.valorPuesto.min, LIMITES_JUEGO.valorPuesto.max))

const dueloPorPuesto = z.object({
  tipo: z.literal('por_puesto'),
  /** Valor de cada puesto (1º, 2º…) según cuántos juegan. Clave = cantidad de jugadores. */
  tablas: z.object({ '2': tablaPorPuesto.length(2), '3': tablaPorPuesto.length(3), '4': tablaPorPuesto.length(4) }).partial(),
})

const dueloPareja = z.object({
  tipo: z.enum(TIPOS_DUELO_PAREJA),
  valor: entero(LIMITES_JUEGO.valorDuelo.min, LIMITES_JUEGO.valorDuelo.max),
  perdedorResta: z.boolean(),
})

export const puntitoSchema = z.object({
  /** Identificador estable dentro de la config: las marcas del scorer lo referencian. */
  id: z.string().min(1).max(40),
  tipo: z.enum(TIPOS_PUNTITO),
  nombre: z.string().trim().min(1).max(LIMITES_JUEGO.largoNombrePuntito).optional(),
  valor: entero(LIMITES_JUEGO.valorPuntito.min, LIMITES_JUEGO.valorPuntito.max),
  destino: z.enum(['individual', 'pareja']),
  activo: z.boolean(),
})

/** Pareja = índices de dos jugadores en el orden de la ronda (0 = A … 3 = D). */
const pareja = z.tuple([entero(0, 3), entero(0, 3)])

export const configJuegoSchema = z.object({
  version: z.literal(VERSION_CONFIG_JUEGO),
  /** Plantilla de origen, solo informativa (la config manda). */
  plantilla: z.enum(['colombiana', 'dos_cero_dos', 'subterranea', 'subterror', 'personalizado_total']),
  unidad: z.enum(UNIDADES),
  modo: z.enum(['gross', 'neto']),
  handicap: z.enum(['diferencia_mas_bajo', 'completo']),
  duelos: z.array(z.discriminatedUnion('tipo', [dueloPorPuesto, dueloPareja])).max(LIMITES_JUEGO.maxDuelos),
  repartoPareja: z.enum(['total_a_cada_uno', 'dividir']),
  puntitos: z.array(puntitoSchema).max(LIMITES_JUEGO.maxPuntitos),
  /** Parejas fijas: las dos parejas. */
  parejas: z.tuple([pareja, pareja]).optional(),
  /** Parejas rotativas: orden sorteado de las 3 combinaciones (índices de COMBINACIONES_DE_4). Se guarda y no se recalcula. */
  sorteo: z.tuple([entero(0, 2), entero(0, 2), entero(0, 2)]).optional(),
})

export type ConfigJuego = z.infer<typeof configJuegoSchema>
export type DueloConfig = ConfigJuego['duelos'][number]
export type DueloPorPuesto = z.infer<typeof dueloPorPuesto>
export type DueloPareja = z.infer<typeof dueloPareja>
export type PuntitoConfig = z.infer<typeof puntitoSchema>
export type Pareja = [number, number]

/** Las 3 formas de partir 4 jugadores en dos parejas: AB-CD, AC-BD, AD-BC. */
export const COMBINACIONES_DE_4: readonly [Pareja, Pareja][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
]
