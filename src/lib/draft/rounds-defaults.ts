// src/lib/draft/rounds-defaults.ts
//
// Defaults de la lista de rondas del wizard (decisión PM 25-sep-2026):
//
//   · Cada ronda de un torneo multi-ronda PUEDE jugarse en cancha distinta.
//   · Al agregar una ronda, se precarga la cancha (y los hoyos) de la ronda 1.
//   · Mientras el organizador no la cambie a mano, la ronda "sigue" a la 1:
//     si cambia la cancha de la ronda 1, las rondas que todavía tenían la
//     cancha anterior de la 1 se mueven con ella. Una ronda que ya fue
//     cambiada a mano (tiene otra cancha) no se toca.
//
// Puro y testeable; `RondasSection` sólo lo llama.

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

/**
 * Aplica `patch` a la ronda en `idx`. Si el patch cambia la cancha de la
 * ronda 1, arrastra a las rondas que todavía seguían a la 1 (tenían su cancha
 * ANTERIOR); las que ya tenían otra cancha se respetan.
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
  const canchaAnterior = target.course_id

  return rounds.map((r, i) => {
    if (i === idx) return { ...r, ...patch }
    if (esPrimera && cambiaCancha && r.course_id === canchaAnterior) {
      return { ...r, course_id: patch.course_id ?? null }
    }
    return r
  })
}
