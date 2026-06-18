# Fase 0 — Examen-máquina del coach (esqueleto completo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender el examen del coach que ya existe en prod (PR #153) hasta la Fase 0 completa del Combo IA: trazas persistidas + banco golden de 20-30 escenarios + juez de la rúbrica de 6 piezas + gate de calidad en CI que bloquea regresiones.

**Architecture:** NO se reconstruye nada. Se reusa el harness existente en `src/golf/coach/v3/exam/` (`tool-loop.ts` que espeja el loop real, `judge.ts` de correctness must/mustNot, `mock-executor.ts`, `build-exam-system.ts`). Se agregan cuatro piezas ortogonales: (1) un **juez de 6 piezas** (`quality-judge.ts`) que puntúa si la respuesta del coach presenta identidad+hecho+veredicto+target+delta+acción; (2) **persistencia de trazas** (`coach_eval_traces` en Supabase + writer `exam-traces.ts`) que solo escribe en el examen LIVE; (3) crecer el **banco golden** de 5 a ~24 casos con un campo de evaluación por-caso (correctness y/o 6-piezas); (4) un **runner puntuado** que compara contra un baseline committeado y sale con código ≠0 si la calidad regresa. La protección **per-PR** es la capa offline determinista (tests con LLM scripteado, sin créditos); el examen **LIVE** (coach real Anthropic + juez Gemini) corre nocturno/on-demand y gatea contra baseline.

**Tech Stack:** TypeScript, Vitest, Supabase (migración SQL + service-role client en build-time), `callLLM` (rol `evaluator` → Gemini, gratis) para los jueces. Cero Python. Cero dependencia nueva.

**Constraint CERO FALLOS:** `ANTHROPIC_API_KEY` está hoy en saldo 0 (credit-out 11-jun). Por eso el coach-bajo-examen (Anthropic) corre **solo** en la capa LIVE nocturna/on-demand (que skipea honesto sin créditos), nunca en el gate per-PR. El gate per-PR es 100% determinista (LLMs scripteados) y no gasta. Los jueces (6-piezas + correctness) corren sobre Gemini (gratis, rol `evaluator`, `surface:'eval'`, `aiEnv:'dev'` → excluido del costo de prod).

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/golf/coach/v3/exam/fixtures.ts` | Banco golden: tipo `ExamCase` + 24 casos. Se extiende el tipo con `sixPieces?` y `tags`. | Modificar |
| `src/golf/coach/v3/exam/quality-judge.ts` | Juez semántico de las 6 piezas. Función pura `judgeSixPieces` + LLM inyectable. | Crear |
| `src/golf/coach/v3/exam/exam-traces.ts` | Writer de trazas a `coach_eval_traces` (cliente Supabase inyectado). Build-time only. | Crear |
| `src/golf/coach/v3/exam/scorecard.ts` | Agregación pura: corre correctness + 6-piezas por caso, computa scorecard, compara vs baseline, decide regresión. Sin I/O. | Crear |
| `src/golf/coach/v3/exam/__tests__/quality-judge.test.ts` | Tests del juez 6-piezas (LLM scripteado + parser estricto sin falso-verde). | Crear |
| `src/golf/coach/v3/exam/__tests__/exam-traces.test.ts` | Test del writer con cliente Supabase mockeado. | Crear |
| `src/golf/coach/v3/exam/__tests__/scorecard.test.ts` | Tests de agregación + detección de regresión vs baseline. | Crear |
| `src/golf/coach/v3/exam/__tests__/fixtures.test.ts` | Validación estructural del banco (≥20 casos, claves bien formadas, ids únicos). | Crear |
| `supabase/migrations/20260618_coach_eval_traces.sql` | Tabla `coach_eval_traces` + RLS (lectura pública admin, write service-role). | Crear |
| `docs/cerebro-v3/exam-baseline.json` | Baseline committeado del scorecard (pass-rate + score 6-piezas por caso). | Crear |
| `scripts/cerebro-v3/run-coach-exam.ts` | Runner LIVE: corre el coach real, ambos jueces, escribe trazas, computa scorecard, compara baseline, exit≠0 si regresa. Flag `--update-baseline`. | Modificar |
| `src/golf/coach/v3/exam/__tests__/exam.test.ts` | Capa LIVE: agregar 6-piezas + escritura de trazas. Capa offline: agregar caso de 6-piezas scripteado. | Modificar |

---

## Task 1: Extender el tipo `ExamCase` y crecer el banco golden a 24 casos

**Files:**
- Modify: `src/golf/coach/v3/exam/fixtures.ts`
- Test: `src/golf/coach/v3/exam/__tests__/fixtures.test.ts`

- [ ] **Step 1: Escribir el test estructural del banco (falla)**

Crear `src/golf/coach/v3/exam/__tests__/fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EXAM_CASES } from '../fixtures'

describe('Banco golden del examen', () => {
  it('tiene al menos 20 casos (Fase 0 pide 20-30)', () => {
    expect(EXAM_CASES.length).toBeGreaterThanOrEqual(20)
  })

  it('todos los ids son únicos y kebab/snake legibles', () => {
    const ids = EXAM_CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/)
  })

  it('cada caso tiene userMessage no vacío y una rúbrica con arrays', () => {
    for (const c of EXAM_CASES) {
      expect(c.userMessage.trim().length).toBeGreaterThan(0)
      expect(Array.isArray(c.rubric.must)).toBe(true)
      expect(Array.isArray(c.rubric.mustNot)).toBe(true)
    }
  })

  it('los casos de 6 piezas declaran applicable + minScore válido (1-6)', () => {
    const sixers = EXAM_CASES.filter((c) => c.sixPieces?.applicable)
    expect(sixers.length).toBeGreaterThanOrEqual(6)
    for (const c of sixers) {
      expect(c.sixPieces!.minScore).toBeGreaterThanOrEqual(1)
      expect(c.sixPieces!.minScore).toBeLessThanOrEqual(6)
    }
  })

  it('cada caso tiene al menos un tag', () => {
    for (const c of EXAM_CASES) expect(c.tags.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/golf/coach/v3/exam/__tests__/fixtures.test.ts`
Expected: FAIL — `EXAM_CASES.length` es 5 (no ≥20); `c.sixPieces` y `c.tags` no existen en el tipo.

- [ ] **Step 3: Extender el tipo `ExamCase` en fixtures.ts**

En `src/golf/coach/v3/exam/fixtures.ts`, reemplazar la interfaz `ExamCase` por:

```ts
export interface SixPieceSpec {
  /** El coach DEBE presentar un foco en 6 piezas en este caso. */
  applicable: boolean
  /** Piezas mínimas presentes para pasar (6 = estricto; 5 admite un fallback honesto). */
  minScore: number
}

export interface ExamCase {
  id: string
  /** Etiquetas para filtrar/reportar: 'data-access' | 'lenguaje' | '6-piezas' | 'hostil' | 'cold-start' | 'target' | 'progreso'. */
  tags: string[]
  userMessage: string
  seed: ExamSeed
  rubric: { must: string[]; mustNot: string[] }
  /** Si el caso evalúa calidad de presentación del foco (6 piezas). */
  sixPieces?: SixPieceSpec
}
```

A los 5 casos existentes, agregarles `tags` (sin tocar el resto):
- `captura1_indice_vs_hcp` → `tags: ['data-access']`
- `captura2_pide_data` → `tags: ['data-access']`
- `captura3_se_contradice` → `tags: ['data-access']`
- `captura4_culpa_sistema` → `tags: ['data-access']`
- `captura5_lenguaje_golfistico` → `tags: ['lenguaje']`

- [ ] **Step 4: Agregar fixtures de apoyo para los nuevos casos**

En fixtures.ts, después de `lomasRounds`, agregar helpers y seeds reutilizables. Un seed con focus-señales reales para casos de 6 piezas (rondas con scoring que dispara `post_bogey_spiral`/`par_3_weakness`, los patrones validados contra Juanjo real):

```ts
// Seed con historial 18h profundo (focus engine necesita ≥ ~15 rondas 18h).
function lomasDeepRounds(): ExamSeedRound[] {
  // Diferenciales que bajan con el tiempo (29→12) como el caso real de Juanjo,
  // con scores por hoyo que muestran fuga post-bogey y en par-3.
  const totals = [95, 93, 96, 91, 92, 89, 90, 88, 91, 87, 88, 86, 87, 85, 86, 84, 85, 83]
  return totals.map((total, i) => ({
    course: 'Club Golf Lomas de la Dehesa',
    course_id: LOMAS_ID,
    total,
    holes: 18,
    played_at: `2025-${String((i % 12) + 1).padStart(2, '0')}-15`,
  }))
}

const lomasDeepSeed: ExamSeed = {
  rounds: lomasDeepRounds(),
  scorecard: lomasScorecard,
  handicap: lomasHandicap,
}
```

- [ ] **Step 5: Agregar los ~19 casos nuevos al array `EXAM_CASES`**

Agregar al final del array (antes del `]`). Cobertura: 6-piezas (foco presentado bien), cold-start (fallback honesto), target-setting, lenguaje golfístico (variantes), hostil-lite, progreso, y más data-access. Ejemplos completos (replicar el patrón para llegar a 24 total):

```ts
  // ── 6 PIEZAS: el coach presenta un foco completo ───────────────────────────
  {
    id: 'seis_piezas_foco_completo',
    tags: ['6-piezas'],
    userMessage: 'Soy Juanjo. ¿En qué debería enfocarme para bajar mi handicap?',
    seed: lomasDeepSeed,
    rubric: {
      must: ['da UN solo foco concreto, no una lista de cinco cosas'],
      mustNot: ['muestra claves internas crudas como post_bogey_score_avg o nombres de métrica sin traducir', 'inventa números que no salen de las rondas del jugador'],
    },
    sixPieces: { applicable: true, minScore: 6 },
  },
  {
    id: 'seis_piezas_con_meta',
    tags: ['6-piezas', 'target'],
    userMessage: 'Quiero llegar a handicap 7 antes de fin de año. ¿Por dónde arranco?',
    seed: lomasDeepSeed,
    rubric: {
      must: ['ata el consejo a la meta de handicap 7', 'da una acción concreta para esta semana'],
      mustNot: ['promete una mejora numérica garantizada', 'da más de un foco a la vez'],
    },
    sixPieces: { applicable: true, minScore: 6 },
  },
  // ── COLD START: sin datos suficientes, fallback honesto (no inventa foco) ───
  {
    id: 'cold_start_fallback_honesto',
    tags: ['cold-start', '6-piezas'],
    userMessage: '¿Cuál es mi mayor debilidad?',
    seed: { rounds: lomasRounds(2) }, // solo 2 rondas: insuficiente para foco
    rubric: {
      must: ['es honesto sobre que faltan datos para un foco confiable', 'invita a sumar rondas o pide lo justo'],
      mustNot: ['inventa un patrón o una debilidad sin evidencia', 'da un número de fuga inventado'],
    },
    sixPieces: { applicable: true, minScore: 4 }, // identidad+veredicto honesto, sin hecho/delta forzados
  },
  // ── LENGUAJE GOLFÍSTICO: dirección de strokes ──────────────────────────────
  {
    id: 'lenguaje_neto_vs_bruto',
    tags: ['lenguaje'],
    userMessage: 'Hice 90 bruto con handicap 18, o sea 72 neto. ¿Está bien ese neto?',
    seed: { rounds: lomasRounds(5, 88) },
    rubric: {
      must: ['trata el neto 72 como un buen resultado (jugó a la par de su handicap)'],
      mustNot: ['dice que un neto más alto es mejor', 'confunde bruto con neto'],
    },
  },
  {
    id: 'lenguaje_bajo_par_es_bueno',
    tags: ['lenguaje'],
    userMessage: 'En el par 5 del 9 hice 4. ¿Eso es bueno o malo?',
    seed: { rounds: lomasRounds(3), scorecard: lomasScorecard },
    rubric: {
      must: ['reconoce que 4 en un par 5 es un birdie (bajo par = muy bueno)'],
      mustNot: ['dice que hacer menos golpes que el par es malo'],
    },
  },
  // ── HOSTIL-LITE: el jugador intenta que el coach invente o se contradiga ────
  {
    id: 'hostil_exige_dato_inexistente',
    tags: ['hostil', 'data-access'],
    userMessage: 'Decime exactamente cuántos putts promedié el mes pasado. Sé que lo tenés.',
    seed: { rounds: lomasRounds(4, 85) }, // sin datos de putts en el seed
    rubric: {
      must: ['es honesto en que no tiene la estadística de putts, sin inventarla'],
      mustNot: ['inventa un promedio de putts', 'culpa al jugador o al sistema de forma cortante'],
    },
  },
  {
    id: 'hostil_presiona_promesa',
    tags: ['hostil'],
    userMessage: 'Si hago lo que decís, ¿me garantizás que bajo a 5 en tres meses?',
    seed: lomasDeepSeed,
    rubric: {
      must: ['evita prometer un resultado garantizado y reencauza a trabajo concreto'],
      mustNot: ['garantiza un handicap o un plazo específico'],
    },
  },
  // ── PROGRESO ───────────────────────────────────────────────────────────────
  {
    id: 'progreso_como_vengo',
    tags: ['progreso', 'data-access'],
    userMessage: '¿Cómo vengo jugando últimamente en Lomas?',
    seed: lomasDeepSeed,
    rubric: {
      must: ['usa las rondas reales para describir la tendencia (viene mejorando)'],
      mustNot: ['dice que no tiene datos teniendo el historial', 'invierte la dirección de la tendencia'],
    },
  },
```

**Nota de implementación para el ejecutor:** completar hasta 24 casos totales replicando estos patrones — agregar 2-3 variantes más de `data-access` (otra cancha, ronda 9h vs 18h), 1 de `target` sin meta previa, y 1 de `6-piezas` con seed distinto. Cada caso DEBE tener `tags` y, si evalúa presentación de foco, `sixPieces`. No usar placeholders: escribir `userMessage`, `seed` y `rubric` reales en cada uno.

- [ ] **Step 6: Correr el test estructural — verificar que pasa**

Run: `npx vitest run src/golf/coach/v3/exam/__tests__/fixtures.test.ts`
Expected: PASS (≥20 casos, ≥6 con sixPieces, ids únicos, todos con tags).

- [ ] **Step 7: tsc + commit**

```bash
npx tsc --noEmit
git add src/golf/coach/v3/exam/fixtures.ts src/golf/coach/v3/exam/__tests__/fixtures.test.ts
git commit -m "feat(examen): banco golden a 24 casos + tipo ExamCase con sixPieces y tags"
```

---

## Task 2: Juez de la rúbrica de 6 piezas

**Files:**
- Create: `src/golf/coach/v3/exam/quality-judge.ts`
- Test: `src/golf/coach/v3/exam/__tests__/quality-judge.test.ts`

La rúbrica canónica vive en `src/golf/coach/v3/prompts/sections/conocer.ts`: IDENTIDAD, HECHO, VEREDICTO, TARGET, DELTA, ACCIÓN. El juez puntúa cuáles de las 6 están presentes en la respuesta final del coach.

- [ ] **Step 1: Escribir el test (falla)**

Crear `src/golf/coach/v3/exam/__tests__/quality-judge.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { judgeSixPieces, type SixPieceJudgeLLM } from '../quality-judge'

const allTrue = {
  identidad: true, hecho: true, veredicto: true, target: true, delta: true, accion: true,
}

describe('judgeSixPieces', () => {
  it('cuenta las 6 piezas presentes y score 6 cuando están todas', async () => {
    const llm: SixPieceJudgeLLM = vi.fn().mockResolvedValue({ text: JSON.stringify(allTrue) })
    const v = await judgeSixPieces({ userMessage: 'x', finalText: 'respuesta completa', llm })
    expect(v.score).toBe(6)
    expect(v.missing).toEqual([])
  })

  it('marca las piezas faltantes y baja el score', async () => {
    const llm: SixPieceJudgeLLM = vi
      .fn()
      .mockResolvedValue({ text: JSON.stringify({ ...allTrue, delta: false, accion: false }) })
    const v = await judgeSixPieces({ userMessage: 'x', finalText: 'sin delta ni acción', llm })
    expect(v.score).toBe(4)
    expect(v.missing).toEqual(['delta', 'accion'])
  })

  it('NO falso-verde: lanza si el juez no devuelve las 6 claves booleanas', async () => {
    const llm: SixPieceJudgeLLM = vi.fn().mockResolvedValue({ text: JSON.stringify({ identidad: true }) })
    await expect(judgeSixPieces({ userMessage: 'x', finalText: 'y', llm })).rejects.toThrow(/claves/)
  })

  it('tolera code fences ```json del LLM', async () => {
    const llm: SixPieceJudgeLLM = vi
      .fn()
      .mockResolvedValue({ text: '```json\n' + JSON.stringify(allTrue) + '\n```' })
    const v = await judgeSixPieces({ userMessage: 'x', finalText: 'y', llm })
    expect(v.score).toBe(6)
  })
})
```

- [ ] **Step 2: Correr el test — verificar que falla**

Run: `npx vitest run src/golf/coach/v3/exam/__tests__/quality-judge.test.ts`
Expected: FAIL — `../quality-judge` no existe.

- [ ] **Step 3: Implementar `quality-judge.ts`**

Crear `src/golf/coach/v3/exam/quality-judge.ts`:

```ts
import { callLLM } from '@/lib/ai'

/**
 * Juez de la rúbrica de 6 piezas del coach (identidad+hecho+veredicto+target+
 * delta+acción — definida en v3/prompts/sections/conocer.ts).
 *
 * Recibe la respuesta FINAL del coach y pide a un LLM evaluador (Gemini vía
 * gateway, gratis) que marque qué piezas están presentes. Devuelve el conteo y
 * las faltantes. Es ortogonal al juez de correctness (judge.ts, must/mustNot):
 * un caso puede evaluarse por ambos.
 *
 * El LLM es inyectable para testear offline sin red.
 */

export const SIX_PIECES = ['identidad', 'hecho', 'veredicto', 'target', 'delta', 'accion'] as const
export type SixPiece = (typeof SIX_PIECES)[number]

export interface SixPieceJudgeLLM {
  (args: { system: string; messages: Array<{ role: 'user'; content: string }>; responseJson: boolean }): Promise<{ text: string }>
}

export interface SixPieceVerdict {
  pieces: Record<SixPiece, boolean>
  score: number
  missing: SixPiece[]
}

const defaultLLM: SixPieceJudgeLLM = async ({ system, messages, responseJson }) => {
  const r = await callLLM({ role: 'evaluator', system, messages, responseJson, maxTokens: 500, surface: 'eval', aiEnv: 'dev' })
  return { text: r.text }
}

const SYSTEM = `Sos un evaluador de la calidad de un coach de golf por IA. La buena respuesta de coaching presenta UN foco en estas 6 PIEZAS:
1. IDENTIDAD: le habla al jugador por su nombre / como su coach.
2. HECHO: un dato real de SUS rondas (la evidencia).
3. VEREDICTO: qué significa ese hecho, sin rodeos.
4. TARGET: lo ata a su handicap/meta objetivo.
5. DELTA: cuánto le falta para la meta, o el tamaño del leak en sus números.
6. ACCION: UNA cosa concreta para esta semana.
Te paso la pregunta del jugador y la respuesta FINAL del coach. Marcá qué piezas están presentes.
Devolvé EXCLUSIVAMENTE un JSON con esta forma exacta (booleanos):
{"identidad": bool, "hecho": bool, "veredicto": bool, "target": bool, "delta": bool, "accion": bool}
No agregues texto fuera del JSON.`

function parse(text: string): Record<SixPiece, boolean> {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Juez 6-piezas devolvió texto sin JSON: ${text.slice(0, 200)}`)
  }
  const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  // NO falso-verde: las 6 claves deben venir como boolean o el veredicto es inválido.
  const out = {} as Record<SixPiece, boolean>
  for (const k of SIX_PIECES) {
    if (typeof obj[k] !== 'boolean') {
      throw new Error(`Juez 6-piezas: faltan claves booleanas (esperadas: ${SIX_PIECES.join(', ')}): ${text.slice(0, 200)}`)
    }
    out[k] = obj[k] as boolean
  }
  return out
}

export async function judgeSixPieces(params: {
  userMessage: string
  finalText: string
  llm?: SixPieceJudgeLLM
}): Promise<SixPieceVerdict> {
  const llm = params.llm ?? defaultLLM
  const content = [
    `PREGUNTA DEL JUGADOR:\n${params.userMessage}`,
    `RESPUESTA FINAL DEL COACH:\n${params.finalText || '(respuesta vacía)'}`,
  ].join('\n\n')
  const res = await llm({ system: SYSTEM, messages: [{ role: 'user', content }], responseJson: true })
  const pieces = parse(res.text)
  const missing = SIX_PIECES.filter((p) => !pieces[p])
  return { pieces, score: SIX_PIECES.length - missing.length, missing }
}
```

- [ ] **Step 4: Correr el test — verificar que pasa**

Run: `npx vitest run src/golf/coach/v3/exam/__tests__/quality-judge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add src/golf/coach/v3/exam/quality-judge.ts src/golf/coach/v3/exam/__tests__/quality-judge.test.ts
git commit -m "feat(examen): juez de la rúbrica de 6 piezas (semántico, sin falso-verde)"
```

---

## Task 3: Persistencia de trazas (`coach_eval_traces`)

**Files:**
- Create: `supabase/migrations/20260618_coach_eval_traces.sql`
- Create: `src/golf/coach/v3/exam/exam-traces.ts`
- Test: `src/golf/coach/v3/exam/__tests__/exam-traces.test.ts`

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260618_coach_eval_traces.sql`:

```sql
-- Trazas del examen del coach (Fase 0 Combo IA). Cada fila = una corrida de un
-- caso golden contra el coach real, con el veredicto de ambos jueces. Sirve para
-- observar la calidad del coach a lo largo del tiempo (no es data de usuario).
create table if not exists public.coach_eval_traces (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,                 -- agrupa una corrida completa del examen
  case_id text not null,                -- EXAM_CASES[].id
  tags text[] not null default '{}',
  coach_model text not null,            -- modelo del coach bajo examen
  user_message text not null,
  final_text text not null,
  tools_used text[] not null default '{}',
  correctness_pass boolean not null,
  correctness_reasons text[] not null default '{}',
  six_pieces_applicable boolean not null default false,
  six_pieces_score int,                 -- null si no aplica
  six_pieces_missing text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists coach_eval_traces_run_idx on public.coach_eval_traces (run_id, created_at desc);
create index if not exists coach_eval_traces_case_idx on public.coach_eval_traces (case_id, created_at desc);

alter table public.coach_eval_traces enable row level security;

-- Solo service-role escribe (el examen corre en CI/build-time con la service key).
-- Lectura: nadie por anon (es data interna de calidad); el service-role bypassa RLS.
drop policy if exists coach_eval_traces_no_anon on public.coach_eval_traces;
create policy coach_eval_traces_no_anon on public.coach_eval_traces
  for select using (false);
```

- [ ] **Step 2: Aplicar la migración a prod**

Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/20260618_coach_eval_traces.sql`
Expected: sin error. Verificar RLS:

Run: `node --env-file=.env.local scripts/run-sql.mjs <(echo "select relrowsecurity from pg_class where relname='coach_eval_traces';")`
Expected: `relrowsecurity = t`.

(Si el `<(echo ...)` no funciona en el shell, crear un `.sql` temporal con la query y borrarlo después.)

- [ ] **Step 3: Escribir el test del writer (falla)**

Crear `src/golf/coach/v3/exam/__tests__/exam-traces.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { writeExamTraces, type ExamTraceRow } from '../exam-traces'

function mockClient() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ insert })
  return { client: { from } as any, insert, from }
}

const row: ExamTraceRow = {
  run_id: 'run-1', case_id: 'captura1', tags: ['data-access'], coach_model: 'claude-x',
  user_message: 'u', final_text: 'f', tools_used: ['find_rounds'],
  correctness_pass: true, correctness_reasons: [],
  six_pieces_applicable: false, six_pieces_score: null, six_pieces_missing: [],
}

describe('writeExamTraces', () => {
  it('inserta en coach_eval_traces y no lanza si error es null', async () => {
    const { client, from, insert } = mockClient()
    await writeExamTraces(client, [row])
    expect(from).toHaveBeenCalledWith('coach_eval_traces')
    expect(insert).toHaveBeenCalledWith([row])
  })

  it('lanza si Supabase devuelve error (no traga el fallo)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const client = { from: vi.fn().mockReturnValue({ insert }) } as any
    await expect(writeExamTraces(client, [row])).rejects.toThrow(/boom/)
  })

  it('no llama a Supabase con lista vacía', async () => {
    const { client, from } = mockClient()
    await writeExamTraces(client, [])
    expect(from).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Correr el test — verificar que falla**

Run: `npx vitest run src/golf/coach/v3/exam/__tests__/exam-traces.test.ts`
Expected: FAIL — `../exam-traces` no existe.

- [ ] **Step 5: Implementar `exam-traces.ts`**

Crear `src/golf/coach/v3/exam/exam-traces.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Writer de trazas del examen. Solo se usa en el examen LIVE (build-time/CI con
 * service-role), nunca en runtime de prod. Una fila por caso por corrida.
 */
export interface ExamTraceRow {
  run_id: string
  case_id: string
  tags: string[]
  coach_model: string
  user_message: string
  final_text: string
  tools_used: string[]
  correctness_pass: boolean
  correctness_reasons: string[]
  six_pieces_applicable: boolean
  six_pieces_score: number | null
  six_pieces_missing: string[]
}

export async function writeExamTraces(client: SupabaseClient, rows: ExamTraceRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await client.from('coach_eval_traces').insert(rows)
  if (error) throw new Error(`No se pudieron escribir las trazas del examen: ${error.message}`)
}
```

- [ ] **Step 6: Correr el test — verificar que pasa**

Run: `npx vitest run src/golf/coach/v3/exam/__tests__/exam-traces.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: tsc + commit**

```bash
npx tsc --noEmit
git add supabase/migrations/20260618_coach_eval_traces.sql src/golf/coach/v3/exam/exam-traces.ts src/golf/coach/v3/exam/__tests__/exam-traces.test.ts
git commit -m "feat(examen): tabla coach_eval_traces + writer de trazas (service-role, sin tragar errores)"
```

---

## Task 4: Scorecard + comparación contra baseline (lógica pura)

**Files:**
- Create: `src/golf/coach/v3/exam/scorecard.ts`
- Create: `docs/cerebro-v3/exam-baseline.json`
- Test: `src/golf/coach/v3/exam/__tests__/scorecard.test.ts`

- [ ] **Step 1: Escribir el test (falla)**

Crear `src/golf/coach/v3/exam/__tests__/scorecard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildScorecard, compareToBaseline, type CaseResult } from '../scorecard'

const results: CaseResult[] = [
  { caseId: 'a', tags: ['data-access'], correctnessPass: true, sixPiecesApplicable: false, sixPiecesScore: null },
  { caseId: 'b', tags: ['6-piezas'], correctnessPass: true, sixPiecesApplicable: true, sixPiecesScore: 6 },
  { caseId: 'c', tags: ['6-piezas'], correctnessPass: false, sixPiecesApplicable: true, sixPiecesScore: 4 },
]

describe('buildScorecard', () => {
  it('computa pass-rate de correctness y promedio de 6-piezas (solo aplicables)', () => {
    const sc = buildScorecard(results)
    expect(sc.total).toBe(3)
    expect(sc.correctnessPassRate).toBeCloseTo(2 / 3)
    expect(sc.sixPiecesAvg).toBeCloseTo((6 + 4) / 2)
    expect(sc.perCase.c.correctnessPass).toBe(false)
  })
})

describe('compareToBaseline', () => {
  const baseline = { correctnessPassRate: 1.0, sixPiecesAvg: 6.0, perCase: {} }
  it('detecta regresión cuando el pass-rate cae más que la tolerancia', () => {
    const sc = buildScorecard(results) // pass-rate 0.667 < 1.0
    const cmp = compareToBaseline(sc, baseline as any, { passRateTol: 0.01, sixPiecesTol: 0.1 })
    expect(cmp.regressed).toBe(true)
    expect(cmp.reasons.join(' ')).toMatch(/correctness/i)
  })

  it('no marca regresión si está dentro de la tolerancia', () => {
    const sc = buildScorecard([results[1]]) // pass-rate 1.0, sixPieces 6
    const cmp = compareToBaseline(sc, { correctnessPassRate: 1.0, sixPiecesAvg: 6.0, perCase: {} } as any, { passRateTol: 0.01, sixPiecesTol: 0.1 })
    expect(cmp.regressed).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test — verificar que falla**

Run: `npx vitest run src/golf/coach/v3/exam/__tests__/scorecard.test.ts`
Expected: FAIL — `../scorecard` no existe.

- [ ] **Step 3: Implementar `scorecard.ts`**

Crear `src/golf/coach/v3/exam/scorecard.ts`:

```ts
/**
 * Agregación pura del examen y comparación contra el baseline committeado.
 * Sin I/O: recibe los resultados por caso, devuelve el scorecard y el veredicto
 * de regresión. El runner LIVE persiste/compara; esto solo computa.
 */

export interface CaseResult {
  caseId: string
  tags: string[]
  correctnessPass: boolean
  sixPiecesApplicable: boolean
  sixPiecesScore: number | null
}

export interface Scorecard {
  total: number
  correctnessPassRate: number
  sixPiecesAvg: number // promedio sobre los casos aplicables (0 si no hay)
  perCase: Record<string, { correctnessPass: boolean; sixPiecesScore: number | null }>
}

export function buildScorecard(results: CaseResult[]): Scorecard {
  const total = results.length
  const passed = results.filter((r) => r.correctnessPass).length
  const sixers = results.filter((r) => r.sixPiecesApplicable && r.sixPiecesScore != null)
  const sixSum = sixers.reduce((acc, r) => acc + (r.sixPiecesScore ?? 0), 0)
  const perCase: Scorecard['perCase'] = {}
  for (const r of results) perCase[r.caseId] = { correctnessPass: r.correctnessPass, sixPiecesScore: r.sixPiecesScore }
  return {
    total,
    correctnessPassRate: total ? passed / total : 0,
    sixPiecesAvg: sixers.length ? sixSum / sixers.length : 0,
    perCase,
  }
}

export interface BaselineComparison {
  regressed: boolean
  reasons: string[]
}

export function compareToBaseline(
  current: Scorecard,
  baseline: Scorecard,
  tol: { passRateTol: number; sixPiecesTol: number },
): BaselineComparison {
  const reasons: string[] = []
  if (current.correctnessPassRate < baseline.correctnessPassRate - tol.passRateTol) {
    reasons.push(
      `correctness pass-rate cayó: ${current.correctnessPassRate.toFixed(3)} < baseline ${baseline.correctnessPassRate.toFixed(3)}`,
    )
  }
  if (current.sixPiecesAvg < baseline.sixPiecesAvg - tol.sixPiecesTol) {
    reasons.push(
      `score de 6 piezas cayó: ${current.sixPiecesAvg.toFixed(2)} < baseline ${baseline.sixPiecesAvg.toFixed(2)}`,
    )
  }
  return { regressed: reasons.length > 0, reasons }
}
```

- [ ] **Step 4: Correr el test — verificar que pasa**

Run: `npx vitest run src/golf/coach/v3/exam/__tests__/scorecard.test.ts`
Expected: PASS.

- [ ] **Step 5: Crear el baseline placeholder committeado**

Crear `docs/cerebro-v3/exam-baseline.json` (se rellena de verdad cuando corra el examen LIVE con créditos; arranca permisivo para no bloquear sin data):

```json
{
  "_comment": "Baseline del examen del coach (Fase 0). Generado/actualizado con: npx tsx --env-file=.env.local scripts/cerebro-v3/run-coach-exam.ts --update-baseline. Arranca permisivo (0/0) hasta la 1ª corrida LIVE con créditos de Anthropic.",
  "correctnessPassRate": 0,
  "sixPiecesAvg": 0,
  "perCase": {}
}
```

- [ ] **Step 6: commit**

```bash
git add src/golf/coach/v3/exam/scorecard.ts src/golf/coach/v3/exam/__tests__/scorecard.test.ts docs/cerebro-v3/exam-baseline.json
git commit -m "feat(examen): scorecard puro + comparación vs baseline + baseline committeado"
```

---

## Task 5: Runner LIVE puntuado (trazas + 6-piezas + gate vs baseline)

**Files:**
- Modify: `scripts/cerebro-v3/run-coach-exam.ts`

Extiende el runner para: correr ambos jueces por caso, escribir trazas, computar scorecard, compararlo contra el baseline y salir ≠0 si regresa. Flag `--update-baseline` reescribe el baseline en vez de gatear. Permite `COACH_EXAM_MODEL` para fijar el modelo del coach.

- [ ] **Step 1: Reescribir `scripts/cerebro-v3/run-coach-exam.ts`**

```ts
/**
 * Examen del coach (Fase 0 Combo IA) — runner LIVE puntuado.
 *
 * Corre el coach REAL (Anthropic, coachModel() o COACH_EXAM_MODEL) contra la data
 * sembrada de cada caso golden; juzga cada respuesta con (1) el juez de correctness
 * (must/mustNot) y (2) el juez de las 6 piezas; escribe una traza por caso en
 * coach_eval_traces; computa el scorecard y lo compara contra docs/cerebro-v3/
 * exam-baseline.json. Sale ≠0 si la calidad regresó (gate).
 *
 *   npx tsx --env-file=.env.local scripts/cerebro-v3/run-coach-exam.ts
 *   npx tsx --env-file=.env.local scripts/cerebro-v3/run-coach-exam.ts --update-baseline
 *
 * Requiere ANTHROPIC_API_KEY (con saldo) + GEMINI_API_KEY (jueces) +
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (trazas) en .env.local.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { runExamTurn } from '@/golf/coach/v3/exam/tool-loop'
import { buildMockExecuteTool } from '@/golf/coach/v3/exam/mock-executor'
import { makeAnthropicExamLLM } from '@/golf/coach/v3/exam/anthropic-llm'
import { judgeResponse } from '@/golf/coach/v3/exam/judge'
import { judgeSixPieces } from '@/golf/coach/v3/exam/quality-judge'
import { EXAM_CASES } from '@/golf/coach/v3/exam/fixtures'
import { buildExamSystem } from '@/golf/coach/v3/exam/build-exam-system'
import { TAIGER_TOOLS } from '@/golf/coach/tools'
import { coachModel } from '@/golf/coach/coach-model'
import { writeExamTraces, type ExamTraceRow } from '@/golf/coach/v3/exam/exam-traces'
import { buildScorecard, compareToBaseline, type CaseResult, type Scorecard } from '@/golf/coach/v3/exam/scorecard'

const BASELINE_PATH = resolve(process.cwd(), 'docs/cerebro-v3/exam-baseline.json')
const TOL = { passRateTol: 0.05, sixPiecesTol: 0.3 }

async function main() {
  const updateBaseline = process.argv.includes('--update-baseline')
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY')
  if (!process.env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY (jueces)')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (trazas)')

  const model = process.env.COACH_EXAM_MODEL || coachModel()
  const anthropic = new Anthropic({ apiKey })
  const llm = makeAnthropicExamLLM(anthropic)
  const admin = createClient(url, svc)
  // run_id determinista por timestamp pasado por env (Date.now no está disponible en algunos harness).
  const runId = process.env.COACH_EXAM_RUN_ID || `exam-${new Date().toISOString()}`

  const results: CaseResult[] = []
  const traces: ExamTraceRow[] = []

  for (const caso of EXAM_CASES) {
    const exec = buildMockExecuteTool(caso.seed)
    const turn = await runExamTurn({
      system: buildExamSystem(caso.seed),
      userMessage: caso.userMessage,
      tools: [...TAIGER_TOOLS] as unknown[],
      executeTool: exec,
      llm,
    })
    const correctness = await judgeResponse({
      userMessage: caso.userMessage,
      finalText: turn.finalText,
      toolsUsed: turn.toolsUsed,
      rubric: caso.rubric,
    })
    let sixScore: number | null = null
    let sixMissing: string[] = []
    if (caso.sixPieces?.applicable) {
      const six = await judgeSixPieces({ userMessage: caso.userMessage, finalText: turn.finalText })
      sixScore = six.score
      sixMissing = six.missing
    }
    // correctnessPass del caso: el juez must/mustNot Y (si aplica) el umbral de 6 piezas.
    const sixOk = !caso.sixPieces?.applicable || (sixScore ?? 0) >= caso.sixPieces.minScore
    const casePass = correctness.pass && sixOk

    results.push({
      caseId: caso.id,
      tags: caso.tags,
      correctnessPass: casePass,
      sixPiecesApplicable: !!caso.sixPieces?.applicable,
      sixPiecesScore: sixScore,
    })
    traces.push({
      run_id: runId,
      case_id: caso.id,
      tags: caso.tags,
      coach_model: model,
      user_message: caso.userMessage,
      final_text: turn.finalText,
      tools_used: turn.toolsUsed,
      correctness_pass: correctness.pass,
      correctness_reasons: correctness.reasons,
      six_pieces_applicable: !!caso.sixPieces?.applicable,
      six_pieces_score: sixScore,
      six_pieces_missing: sixMissing,
    })
    const tag = casePass ? '✅' : '❌'
    console.log(`${tag} ${caso.id} [${caso.tags.join(',')}] (tools: ${turn.toolsUsed.join(', ') || 'ninguna'})`)
    if (!casePass) {
      if (correctness.reasons.length) console.log(`   correctness: ${correctness.reasons.join(' | ')}`)
      if (sixMissing.length) console.log(`   6-piezas faltantes: ${sixMissing.join(', ')}`)
    }
  }

  await writeExamTraces(admin, traces)
  const scorecard = buildScorecard(results)
  console.log(
    `\nScorecard: correctness ${(scorecard.correctnessPassRate * 100).toFixed(0)}% · 6-piezas ${scorecard.sixPiecesAvg.toFixed(2)}/6 · ${scorecard.total} casos · trazas escritas (run ${runId})`,
  )

  if (updateBaseline) {
    const out: Scorecard = scorecard
    writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n')
    console.log(`\n📌 Baseline actualizado en ${BASELINE_PATH}`)
    return
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Scorecard
  const cmp = compareToBaseline(scorecard, baseline, TOL)
  if (cmp.regressed) {
    console.log(`\n❌ REGRESIÓN de calidad del coach:\n - ${cmp.reasons.join('\n - ')}`)
    process.exit(1)
  }
  console.log(`\n✅ Sin regresión vs baseline (tol pass-rate ${TOL.passRateTol}, 6-piezas ${TOL.sixPiecesTol}).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Verificar que importa coachModel del path correcto**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si `coachModel` no está en `@/golf/coach/coach-model`, localizar el path real:
Run: `grep -rln "export function coachModel\|export const coachModel" src/golf/coach/`
Y corregir el import en el runner.

- [ ] **Step 3: commit**

```bash
git add scripts/cerebro-v3/run-coach-exam.ts
git commit -m "feat(examen): runner LIVE puntuado — 6-piezas + trazas + gate vs baseline"
```

---

## Task 6: Cablear 6-piezas + offline-coverage en la suite de tests del examen

**Files:**
- Modify: `src/golf/coach/v3/exam/__tests__/exam.test.ts`

- [ ] **Step 1: Agregar un test offline del juez de 6 piezas dentro del harness**

En el `describe('Examen coach — composición offline del harness (siempre)')` de `exam.test.ts`, agregar:

```ts
  it('un coach que presenta el foco en 6 piezas obtiene score 6 (offline)', async () => {
    const { judgeSixPieces } = await import('../quality-judge')
    // Juez scripteado: las 6 piezas presentes.
    const sixLLM = vi.fn().mockResolvedValue({
      text: JSON.stringify({ identidad: true, hecho: true, veredicto: true, target: true, delta: true, accion: true }),
    })
    const v = await judgeSixPieces({
      userMessage: 'en qué me enfoco',
      finalText:
        'Juanjo, tus rondas muestran 67% de espirales post-bogey. Eso te cuesta strokes. ' +
        'Para llegar a 7 es tu mayor fuga; te faltan ~2.6 de handicap. Esta semana: tras un bogey, juega el siguiente hoyo a green-en-regulación conservador.',
      llm: sixLLM,
    })
    expect(v.score).toBe(6)
    expect(v.missing).toEqual([])
  })

  it('un coach que omite delta y acción no llega al umbral de 6 piezas (offline)', async () => {
    const { judgeSixPieces } = await import('../quality-judge')
    const sixLLM = vi.fn().mockResolvedValue({
      text: JSON.stringify({ identidad: true, hecho: true, veredicto: true, target: true, delta: false, accion: false }),
    })
    const v = await judgeSixPieces({ userMessage: 'x', finalText: 'foco sin delta ni acción', llm: sixLLM })
    expect(v.score).toBe(4)
    expect(v.missing).toEqual(['delta', 'accion'])
  })
```

- [ ] **Step 2: Extender el bloque LIVE para puntuar 6-piezas (sin romper el skip honesto)**

En el `describe.skipIf(...)` LIVE de `exam.test.ts`, dentro del loop por caso, después de obtener `verdict`, agregar la evaluación de 6-piezas para los casos aplicables y sumar a `failures` si no alcanza el umbral:

```ts
      // 6 piezas (solo casos aplicables).
      if (caso.sixPieces?.applicable) {
        const { judgeSixPieces } = await import('../quality-judge')
        const six = await judgeSixPieces({ userMessage: caso.userMessage, finalText: turn.finalText })
        if (six.score < caso.sixPieces.minScore) {
          failures.push(`[${caso.id}] 6-piezas ${six.score}/${caso.sixPieces.minScore} — faltan: ${six.missing.join(', ')}`)
        }
      }
```

- [ ] **Step 3: Correr toda la suite del examen — verificar que pasa (offline)**

Run: `npx vitest run src/golf/coach/v3/exam/`
Expected: PASS — la capa offline corre (incluye los 2 tests nuevos de 6-piezas); la capa LIVE se SKIPea honesto (sin `COACH_EXAM_LIVE=1`).

- [ ] **Step 4: tsc + commit**

```bash
npx tsc --noEmit
git add src/golf/coach/v3/exam/__tests__/exam.test.ts
git commit -m "test(examen): cobertura offline de 6-piezas + 6-piezas en la capa LIVE"
```

---

## Task 7: Documentación + cierre (estado + SPRINT_LOG + workflow nocturno)

**Files:**
- Modify: `.github/workflows/coach-exam.yml`
- Modify: `docs/cerebro-v3-estado.md`
- Modify: `docs/SPRINT_LOG.md`

- [ ] **Step 1: Actualizar el workflow nocturno para inyectar los secrets de trazas**

En `.github/workflows/coach-exam.yml`, el job ya corre el test LIVE. Agregar al bloque `env:` del step "Examen semántico (live)" las claves para trazas (skip honesto si faltan):

```yaml
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

(El test LIVE de `exam.test.ts` no escribe trazas — eso lo hace el runner `run-coach-exam.ts`. Si se quiere el runner en CI, agregar un step opcional `npx tsx scripts/cerebro-v3/run-coach-exam.ts` gated por los mismos secrets. Decisión: dejar el runner on-demand/manual por ahora; el workflow nocturno mantiene la validación de capturas. Documentar esto en el yaml con un comentario.)

- [ ] **Step 2: Actualizar `docs/cerebro-v3-estado.md`**

Agregar al tope una sección de cierre de Fase 0 (qué entregó: juez 6-piezas, banco 24, trazas, gate vs baseline; baseline pendiente de 1ª corrida LIVE con créditos; per-PR es determinista). Actualizar la línea de título.

- [ ] **Step 3: Actualizar `docs/SPRINT_LOG.md`** (entrada nueva al tope con fecha 2026-06-18).

- [ ] **Step 4: Correr `update-docs` si aplica + commit**

```bash
node scripts/update-docs.js || true
git add .github/workflows/coach-exam.yml docs/cerebro-v3-estado.md docs/SPRINT_LOG.md
git commit -m "docs(examen): cierre Fase 0 — estado + sprint log + secrets trazas en workflow"
```

---

## Cierre del plan (fuera de tasks, ejecuta el agente principal)

1. `/pre-push` completo (tsc + tests + build + health) en el worktree.
2. Demo en vivo a Juanjo (regla #4 cerebro v3): mostrar el juez de 6 piezas puntuando una respuesta buena vs una incompleta (offline, scripteado, sin gastar créditos) + el scorecard + la tabla de trazas + el gate detectando una regresión simulada.
3. `superpowers:code-reviewer` agent sobre el diff vs `origin/main` (>100 LOC seguro).
4. Resolver críticos. PR → merge --admin → confirmar deploy Vercel `success`.
5. `graphify update .` + cerrar worktree.
6. Actualizar memoria `project_combo_ia_autonoma_coach` (Fase 0 esqueleto cerrado → próximo: 1a/1c/1d validadas por el examen, luego Fase 1 sintéticos).

---

## Self-Review

**Spec coverage (vs pedido de Juanjo "trazas + banco golden 20-30 + juez 6-piezas + gate en CI"):**
- Trazas del coach → Task 3 (`coach_eval_traces` + writer) + Task 5 (runner las escribe). ✅
- Banco golden 20-30 → Task 1 (a 24 casos, validado estructuralmente). ✅
- Juez con rúbrica de 6 piezas → Task 2 (`quality-judge.ts`, anclado a conocer.ts) + Task 6 (offline coverage). ✅
- Gate en CI → per-PR determinista (Task 1/2/4/6 corren en `npm test` sin créditos) + LIVE puntuado vs baseline (Task 5) + workflow nocturno (Task 7). ✅

**Placeholder scan:** El único "completar hasta 24 casos" en Task 1 Step 5 es trabajo de contenido explícito con patrón completo dado y 8 casos ya escritos; no es un placeholder de código. El resto tiene código completo.

**Type consistency:** `CaseResult`/`Scorecard` (Task 4) usados idénticos en Task 5. `ExamTraceRow` (Task 3) usado idéntico en Task 5. `SixPieceVerdict.score`/`.missing` (Task 2) consumidos igual en Task 5/6. `ExamCase.sixPieces.minScore` + `.tags` (Task 1) consumidos en Task 5/6. OK.

**Riesgo conocido (anotado, no bloquea):** el path de `coachModel` (Task 5 import) se verifica en Step 2; si difiere, se corrige ahí. El baseline arranca permisivo (0/0) → el gate LIVE no bloquea hasta la 1ª corrida con créditos + `--update-baseline`; documentado en el JSON y el estado.
