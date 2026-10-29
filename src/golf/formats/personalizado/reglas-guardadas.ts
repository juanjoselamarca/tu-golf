/**
 * Lo que se guarda en `rondas_libres.reglas_juego`: la config del juego + el orden de los jugadores.
 *
 * Las parejas y el sorteo de la config son ÍNDICES (0 = A … 3 = D). `jugadorIds` dice qué jugador es cada
 * índice: hay un solo camino para ese orden (contrato, cláusula 2). Nunca se usa ORDER BY `created_at`: los
 * jugadores insertados en lote empatan y el desempate por UUID es al azar.
 */
import { z } from 'zod'
import { configJuegoSchema, LIMITES_JUEGO, type ConfigJuego } from './config'

export const reglasJuegoGuardadasSchema = z.object({
  config: configJuegoSchema,
  jugadorIds: z
    .array(z.string().uuid())
    .min(LIMITES_JUEGO.jugadores.min)
    .max(LIMITES_JUEGO.jugadores.max)
    .refine(ids => new Set(ids).size === ids.length, 'jugadores repetidos'),
})

export type ReglasJuegoGuardadas = z.infer<typeof reglasJuegoGuardadasSchema>

export function armarReglasGuardadas(config: ConfigJuego, jugadorIds: readonly string[]): ReglasJuegoGuardadas {
  return { config, jugadorIds: [...jugadorIds] }
}

/** `null` si lo guardado no es una regla válida (dato corrupto o de una versión que no se conoce). */
export function leerReglasGuardadas(raw: unknown): ReglasJuegoGuardadas | null {
  const parsed = reglasJuegoGuardadasSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
