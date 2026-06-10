/**
 * Modelo del coach tAIger+ — path principal (streaming + tool-loop en chat-engine.ts).
 *
 * Centralizado acá para que pilotear un modelo nuevo (ej. Claude Fable 5) sea un flip
 * de env var REVERSIBLE, no una cacería de strings hardcodeados repartidos por el motor.
 *
 * Default = el modelo estable en prod hoy. NO cambiar el default sin:
 *   1. Validar contra el banco de pruebas (5 perfiles sintéticos + casos canario).
 *   2. Medir costo: Fable 5 cuesta $10/$50 por 1M (in/out) vs sonnet-4-6 $3/$15 — ~3×.
 *      Un swap total del coach solo se justifica en tier premium o análisis profundo
 *      selectivo, NO para todo el volumen del chat conversacional.
 *
 * Piloto seguro: setear COACH_MODEL en un deploy de preview (o para un subconjunto de
 * usuarios premium) y comparar calidad/costo antes de tocar el default de prod.
 */
export const COACH_MODEL_DEFAULT = 'claude-sonnet-4-6'

/**
 * Resuelve el modelo del coach. Lee `COACH_MODEL` en cada llamada (no en import) para
 * que un cambio de env no requiera reiniciar el módulo y sea testeable con stubEnv.
 */
export function coachModel(): string {
  const override = process.env.COACH_MODEL?.trim()
  return override && override.length > 0 ? override : COACH_MODEL_DEFAULT
}
