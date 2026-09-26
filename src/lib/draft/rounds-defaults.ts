// src/lib/draft/rounds-defaults.ts
//
// Defaults y edición de la lista de rondas del wizard (decisión PM 25-sep-2026):
//
//   · Cada ronda de un torneo multi-ronda PUEDE jugarse en cancha distinta.
//   · Al agregar una ronda, se precarga la cancha (y los hoyos) de la ronda 1.
//   · Mientras el organizador no la toque a mano, la ronda "sigue" a la 1:
//     si cambia la cancha o los hoyos de la ronda 1, las rondas que todavía
//     tenían exactamente la configuración anterior de la 1 se mueven con
//     ella. Una ronda ya editada a mano (otra cancha u otros hoyos) no se toca.
//   · Al eliminar una ronda, las siguientes se RENUMERAN para que siempre sean
//     1..N (el motor y `validateGolfRules` exigen exactamente esa secuencia;
//     `total_rounds` = N y una fila con round_number > N no se jugaría nunca).
//     Cada ronda conserva su cancha, fecha y hoyos; sólo cambia el número.
//
// Puro y testeable; `RondasSection` sólo lo llama.
// Nota: PR #419 introducirá ids estables/tombstones para borrar rondas; esta
// renumeración es deliberadamente simple y local para no chocar con eso.

import type { RoundConfig } from '@/lib/draft/types'

/** Hoyos por defecto para una ronda nueva cuando no hay ronda 1 de la que heredar. */
const HOLE_COUNT_DEFAULT: RoundConfig['hole_count'] = 18

/** La ronda con `round_number` más bajo: es "la ronda 1" aunque el array esté desordenado. */
function primeraRonda(rounds: readonly RoundConfig[]): RoundConfig | undefined {
  return [...rounds].sort((a, b) => a.round_number - b.round_number)[0]
}

/** Siguiente `round_number` libre. */
export function siguienteNumeroDeRonda(rounds: readonly RoundConfig[]): number {
  return rounds.length === 0 ? 1 : Math.max(...rounds.map((r) => r.round_number)) + 1
}

/**
 * Ronda nueva: hereda cancha, hoyos y modo de tee de la ronda 1. La fecha
 * queda vacía a propósito — es el dato que el organizador tiene que decidir,
 * y el footer lo pide ("Falta fecha en la ronda N").
 */
export function nuevaRondaDesde(rounds: readonly RoundConfig[]): RoundConfig {
  const primera = primeraRonda(rounds)
  return {
    round_number: siguienteNumeroDeRonda(rounds),
    date: null,
    course_id: primera?.course_id ?? null,
    hole_count: primera?.hole_count ?? HOLE_COUNT_DEFAULT,
    tee_assignment_mode: primera?.tee_assignment_mode ?? 'per_player',
  }
}

/** ¿La ronda sigue a la 1? = tiene exactamente la cancha y los hoyos que la 1 tenía. */
function seguiaALaPrimera(r: RoundConfig, primeraAntes: RoundConfig): boolean {
  return r.course_id === primeraAntes.course_id && r.hole_count === primeraAntes.hole_count
}

/**
 * Aplica `patch` a la ronda en `idx`. Si el patch cambia la cancha o los hoyos
 * de la ronda 1, arrastra a las rondas que todavía seguían a la 1 (tenían su
 * configuración ANTERIOR completa); las que ya fueron tocadas a mano se respetan.
 */
export function aplicarCambioDeRonda(
  rounds: readonly RoundConfig[],
  idx: number,
  patch: Partial<RoundConfig>,
): RoundConfig[] {
  const target = rounds[idx]
  if (!target) return [...rounds]

  const primera = primeraRonda(rounds)
  const esPrimera = primera !== undefined && target.round_number === primera.round_number
  const cambiaCancha = 'course_id' in patch && patch.course_id !== target.course_id
  const cambiaHoyos = 'hole_count' in patch && patch.hole_count !== target.hole_count
  const arrastra = esPrimera && (cambiaCancha || cambiaHoyos)

  return rounds.map((r, i) => {
    if (i === idx) return { ...r, ...patch }
    if (!arrastra || !seguiaALaPrimera(r, target)) return r
    return {
      ...r,
      ...(cambiaCancha ? { course_id: patch.course_id ?? null } : {}),
      ...(cambiaHoyos ? { hole_count: patch.hole_count ?? r.hole_count } : {}),
    }
  })
}

/**
 * Elimina la ronda en `idx` y renumera las que quedan a 1..N por su orden de
 * `round_number`, conservando cancha/fecha/hoyos de cada una. Borrar la ronda
 * 2 de {1,2,3} deja {1,2} donde la nueva 2 es la que era 3.
 */
export function eliminarRonda(rounds: readonly RoundConfig[], idx: number): RoundConfig[] {
  if (!rounds[idx]) return [...rounds]
  return renumerarRondas(rounds.filter((_, i) => i !== idx))
}

/** Rondas ordenadas por `round_number` y renumeradas 1..N. Idempotente. */
export function renumerarRondas(rounds: readonly RoundConfig[]): RoundConfig[] {
  return [...rounds]
    .sort((a, b) => a.round_number - b.round_number)
    .map((r, i) => (r.round_number === i + 1 ? r : { ...r, round_number: i + 1 }))
}

/** ¿Los `round_number` son exactamente 1..N (sin huecos ni repetidos)? */
export function rondasSonSecuenciales(rounds: readonly Pick<RoundConfig, 'round_number'>[]): boolean {
  const nums = rounds.map((r) => r.round_number).sort((a, b) => a - b)
  return nums.every((n, i) => n === i + 1)
}
