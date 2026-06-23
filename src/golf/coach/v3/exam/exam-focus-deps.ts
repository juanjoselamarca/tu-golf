/**
 * Deps CONGELADAS para correr el motor de foco REAL dentro del examen (P2).
 *
 * `getFocus(userId, deps)` delega toda su I/O a un puerto inyectable. En prod
 * ese puerto lee Supabase (rondas, target, `cerebro_weights`, catálogo). Para el
 * examen eso es inaceptable: (a) tocaría la DB, (b) `cerebro_weights` y
 * `pattern_definitions` son MUTABLES → el mismo seed daría otro foco entre
 * corridas y el gate sería no-determinista.
 *
 * Acá construimos las deps desde el seed en memoria, con pesos y catálogo
 * CONGELADOS. NO se hardcodea el foco: corre `getFocus` → `selectFocus` →
 * `detectPatterns` de verdad. Solo se reemplaza el ORIGEN de los datos.
 *
 *  - loadWeights → `[]` ⇒ todos los patrones pesan `DEFAULT_PATTERN_WEIGHT`
 *    (uniforme). Es la elección que neutraliza la no-determinación: el ranking
 *    depende solo de la confianza del detect, no del último slider que se tocó.
 *  - loadCatalog → `FOCUS_CATALOG` (constante de código), no `pattern_definitions`.
 *  - loadValidation → `{}` ⇒ los patrones seed operan por su gate de detect.
 *
 * Spec: docs/superpowers/specs/2026-06-22-examen-v3-fidelidad-design.md (D2).
 */
import type { RoundData } from '@/golf/coach/metrics'
import type { GetFocusDeps } from '../focus/get-focus'
import { FOCUS_CATALOG } from '../focus/catalog'
import type { ExamSeed, ExamSeedRound } from './fixtures'

/** Convierte una ronda del seed (scores como objeto `{"1":4,…}`) a `RoundData`. */
function seedRoundToRoundData(round: ExamSeedRound, pares: number[], idx: number): RoundData {
  const holes = pares.length || 18
  const scores = round.scores
    ? Array.from({ length: holes }, (_, i) => {
        const v = round.scores?.[String(i + 1)]
        return typeof v === 'number' ? v : null
      })
    : null
  return {
    id: `exam-${round.course_id}-${idx}`,
    scores,
    total_gross: round.total,
    par_per_hole: pares,
    played_at: round.played_at,
    metadata: null,
  }
}

/**
 * Arma un `GetFocusDeps` en memoria desde el seed. Determinista: dos llamadas con
 * el mismo seed devuelven el mismo foco (pesos y catálogo congelados).
 */
export function buildExamFocusDeps(seed: ExamSeed): GetFocusDeps {
  const pares = seed.scorecard?.pares ?? []
  const rounds = seed.rounds.map((r, i) => seedRoundToRoundData(r, pares, i))
  return {
    loadRounds: async () => rounds,
    loadTarget: async () => ({
      currentHandicap: seed.handicap?.indice ?? null,
      targetHandicap: null,
      targetDeadline: null,
    }),
    loadWeights: async () => [], // congelado: uniforme (DEFAULT_PATTERN_WEIGHT)
    loadCatalog: async () => FOCUS_CATALOG,
    loadValidation: async () => ({}),
  }
}
