/**
 * Lógica pura del dedup de canchas duplicadas (manual ↔ fedegolf).
 *
 * Decisión de diseño (spec 2026-06-10 §3, v2): la ficha MANUAL mixta es la
 * canónica. Sus tees se CORRIGEN a los valores oficiales fedegolf (fuente de
 * verdad de CR/slope 18h), conservando los front/back-9 que el oficial no traiga.
 * Las fichas fedegolf V/D se redirigen vía `canonical_course_id` y se desactivan.
 *
 * Sin acceso a BD acá: solo cálculo (testeado). La aplicación vive en
 * `src/lib/data/course-dedup.ts`.
 */
import { canonicalColor, type TeeRow } from './tee-resolver'

export interface TeeUpsert {
  /** Nombre del tee a persistir (oficial; para insert) / display. */
  nombre: string
  /** Nombre REAL del tee manual a actualizar (action='update'); null en insert. */
  manualNombre: string | null
  genero: string | null
  rating: number | null
  slope: number | null
  front_course_rating: number | null
  front_slope_rating: number | null
  back_course_rating: number | null
  back_slope_rating: number | null
  action: 'update' | 'insert'
}

/** Devuelve `official` si no es null/undefined, si no `manual` (sin perder un 9h existente). */
function pick<T>(official: T | null | undefined, manual: T | null | undefined): T | null {
  return official != null ? official : (manual ?? null)
}

/** Primer carácter del género en mayúscula ('' si no hay). */
function gInitial(t: { genero?: string | null }): string {
  return (t.genero ?? '').trim().charAt(0).toUpperCase()
}

/**
 * Devuelve UNA corrección de tee por COLOR canónico para la ficha manual.
 *
 * Restricción real de la BD: `UNIQUE(course_id, nombre)` (sin género) → una ficha
 * sólo puede tener UN tee por nombre/color. La fedegolf parte cada club en VARONES
 * (todos los tees género M, incluso rojo/M) y DAMAS (rojo/F): un mismo color puede
 * venir en M y F. Por eso se agrupa por color canónico y se emite un solo upsert:
 *  - rating/slope del oficial elegido (fedegolf = fuente de verdad de 18h);
 *  - front/back del oficial si existe, si no se conserva el de la manual (no se
 *    pierde el 9h);
 *  - si la manual ya tiene el color, se ACTUALIZA esa fila (`manualNombre` = su
 *    nombre real, se preserva nombre y género) eligiendo el oficial del mismo
 *    género; si no, se INSERTA un solo tee (oficial M primero, luego el primero).
 *
 * Tees manuales de un color sin oficial NO se tocan (no aparecen en el output).
 */
export function planTeeCorrections(manualTees: TeeRow[], officialTees: TeeRow[]): TeeUpsert[] {
  const manualByColor = new Map<string, TeeRow>()
  for (const m of manualTees) {
    const k = canonicalColor(m.nombre ?? '')
    if (!manualByColor.has(k)) manualByColor.set(k, m) // primer match del color gana
  }
  const officialByColor = new Map<string, TeeRow[]>()
  for (const o of officialTees) {
    const k = canonicalColor(o.nombre ?? '')
    const arr = officialByColor.get(k) ?? []
    arr.push(o); officialByColor.set(k, arr)
  }

  const ups: TeeUpsert[] = []
  for (const [color, offs] of Array.from(officialByColor)) {
    const man = manualByColor.get(color)
    // Elegir el oficial: si la manual tiene el color, el del mismo género; si no,
    // el masculino (M) primero; si no, el primero disponible.
    // LIMITACIÓN CONOCIDA (code-review 10-jun, follow-up): la BD tiene
    // UNIQUE(course_id, nombre) SIN género → un color sólo puede tener UNA fila.
    // Si un color NUEVO (la manual no lo tiene) viniera en M y F con ratings
    // DISTINTOS, al insertar uno se "pierde" el otro y el resolver le daría a ese
    // género el rating del otro (silenciosamente). Para los 3 clusters actuales
    // NO ocurre (rojo M y F tienen rating idéntico). Si aparece un cluster donde
    // difieran, hay que decidir explícitamente (idealmente cambiar el constraint a
    // incluir género), no insertar a ciegas.
    const chosen = (man && offs.find(o => gInitial(o) === gInitial(man)))
      ?? offs.find(o => gInitial(o) === 'M')
      ?? offs[0]
    if (!chosen) continue
    ups.push({
      nombre: chosen.nombre.trim().toLowerCase(),
      manualNombre: man ? man.nombre : null,
      genero: man ? (man.genero ?? null) : (chosen.genero ?? null),
      rating: chosen.rating,
      slope: chosen.slope,
      front_course_rating: pick(chosen.front_course_rating, man?.front_course_rating),
      front_slope_rating: pick(chosen.front_slope_rating, man?.front_slope_rating),
      back_course_rating: pick(chosen.back_course_rating, man?.back_course_rating),
      back_slope_rating: pick(chosen.back_slope_rating, man?.back_slope_rating),
      action: man ? 'update' : 'insert',
    })
  }
  return ups
}

export interface IndexRound {
  id: string
  played_at: string
  diferencial: number | null
  course_rating: number | null
  slope_rating: number | null
  excluded_from_handicap: boolean
}

/**
 * Construye las ventanas de diferenciales para estimar el índice ANTES y DESPUÉS
 * del dedup (spec §13). Replica la ventana del RPC `calcular_indice_golfers`:
 *  - solo rondas con diferencial + CR + slope no-null y `excluded_from_handicap=false`
 *  - ordenadas por `played_at` DESC, las últimas 20
 *  - el caller aplica `calcularIndiceGolfersLocal` (best-N ×0.96) a cada ventana.
 *
 * `correctedDiffById`: para las rondas del cluster, el diferencial recomputado con
 * los tees corregidos. `null` (guard de implausibilidad) saca la ronda del set
 * "después". Las rondas de otras canchas conservan su diferencial actual.
 *
 * Nota: el filtro de validez se evalúa con el diferencial EFECTIVO (corregido en
 * "después"), de modo que una ronda que pasa de null a válida entra, y viceversa.
 */
export function buildIndexWindows(
  rounds: IndexRound[],
  correctedDiffById: Map<string, number | null>,
): { antes: number[]; despues: number[] } {
  const window = (useCorrected: boolean): number[] =>
    rounds
      .map(r => {
        const diff = useCorrected && correctedDiffById.has(r.id) ? correctedDiffById.get(r.id)! : r.diferencial
        return { r, diff }
      })
      .filter(({ r, diff }) => diff != null && r.course_rating != null && r.slope_rating != null && !r.excluded_from_handicap)
      .sort((a, b) => b.r.played_at.localeCompare(a.r.played_at)) // DESC por fecha
      .slice(0, 20)
      .map(({ diff }) => diff as number)
  return { antes: window(false), despues: window(true) }
}

export interface DupRound {
  id: string
  user_id: string
  played_at: string
  holes_played: number | null
  total_gross: number | null
  course_id: string
  created_at: string
}

/**
 * Detecta rondas exacto-duplicadas (mismo `user_id|played_at|holes_played|
 * total_gross|course_id`) y devuelve los `id` a borrar: todos menos la fila más
 * antigua por `created_at` de cada grupo con >1 copia. Conservadora: un grupo de
 * 1 nunca devuelve nada; no mezcla usuarios ni canchas.
 */
export function findDuplicateRounds(rounds: DupRound[]): string[] {
  const groups = new Map<string, DupRound[]>()
  for (const r of rounds) {
    const k = `${r.user_id}|${r.played_at}|${r.holes_played}|${r.total_gross}|${r.course_id}`
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
  }
  const toDelete: string[] = []
  for (const arr of Array.from(groups.values())) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (const r of sorted.slice(1)) toDelete.push(r.id)
  }
  return toDelete
}
