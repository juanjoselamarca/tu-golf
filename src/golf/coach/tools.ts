import type { SupabaseClient } from '@supabase/supabase-js'
import { OR_EXCLUDE_FEDEGOLF } from '@/lib/data/historical-rounds-filters'
import { resolveRoundPars } from '@/golf/coach/hole-pars'
import { savePlan, PATTERN_IDS, PLAN_METRICS, type SavePlanInput } from './plan-engine'
import { inferHoles } from '@/golf/core/holes'
import { matchCourseInDB } from '@/golf/courses/matching'
import { findRoundsForCoach, type CoachRoundFilters } from '@/lib/data/coach-rounds'
import { computePlayingHandicapForCoach } from '@/lib/data/coach-handicap'
import {
  setTarget,
  rememberFact,
  recallFacts,
  getFocusTool,
  getProgress,
} from '@/golf/coach/v3/tools/focus-tools'
import { fieldContext } from '@/golf/coach/v3/tools/field-context-tool'
import { projectScore, type Distribution } from './scoring'

/**
 * Definiciones de tools que tAIger+ puede llamar durante una conversación.
 * Formato Anthropic tool use. Resuelven el problema de que el coach no tenía
 * acceso al detalle hoyo-por-hoyo ni a los pares de la cancha.
 *
 * `save_plan` es la ÚNICA forma de comprometer un plan estructurado al jugador
 * (Cerebro v2 §5.4). El extractor regex en chat/route.ts está siendo retirado
 * en shadow mode 7 días.
 */
export const TAIGER_TOOLS = [
  {
    name: 'get_latest_round',
    description:
      'Obtén la última ronda registrada del jugador (jugada en la app o importada) con el detalle hoyo-por-hoyo, pares de la cancha y strokes sobre par por hoyo. Úsala cuando el jugador haga referencia a "mi última ronda", "la vuelta de hoy" o similar sin identificar una ronda específica.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_round_by_id',
    description:
      'Obtén una ronda libre específica por su ID, con detalle hoyo-por-hoyo y pares de la cancha. Úsala cuando tengas un ronda_libre_id del contexto de la sesión.',
    input_schema: {
      type: 'object',
      properties: {
        ronda_libre_id: { type: 'string', description: 'UUID de la ronda libre' },
      },
      required: ['ronda_libre_id'],
    },
  },
  {
    name: 'get_recent_rounds',
    description:
      'Obtén un resumen de las últimas N rondas del jugador (totales, cancha, fecha). Úsala para detectar tendencias o comparar contra el promedio reciente.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Cantidad de rondas (1-10)', default: 5 },
      },
      required: [],
    },
  },
  {
    name: 'get_course_details',
    description:
      'Obtén información de una cancha: pares por hoyo, stroke index, par total. Úsala cuando necesites calcular strokes sobre par o analizar dificultad por hoyo. Requiere el UUID de la cancha. Si solo tienes el NOMBRE, usa get_course_scorecard.',
    input_schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'UUID de la cancha' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'get_course_scorecard',
    description:
      'Obtén el scorecard de una cancha (pares y stroke index por hoyo, par total) por NOMBRE o por UUID. Úsala cuando el jugador menciona una cancha por su nombre ("los pares de Lomas de la Dehesa"): NO necesitas el UUID, pasa el nombre y el sistema resuelve la cancha en el catálogo. Si la cancha no está en el catálogo, la tool te lo dice — en ese caso NUNCA le pidas los pares al jugador, ofrece lo que puedas con lo que haya.',
    input_schema: {
      type: 'object',
      properties: {
        course: { type: 'string', description: 'Nombre de la cancha (ej "Lomas de la Dehesa") o su UUID.' },
      },
      required: ['course'],
    },
  },
  {
    name: 'get_round_by_date',
    description:
      'Busca una ronda histórica del jugador por fecha (YYYY-MM-DD). Útil cuando el jugador menciona "la ronda del 15 de marzo", "el sábado pasado", etc. Si hubo varias rondas el mismo día, opcionalmente filtra por nombre de cancha.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        course_name: { type: 'string', description: 'Opcional: nombre parcial de la cancha si hubo varias rondas el mismo día' },
      },
      required: ['date'],
    },
  },
  {
    name: 'get_all_rounds_summary',
    description:
      'Resumen estadístico de las rondas históricas del jugador, SEPARADO entre rondas de 18 hoyos y de 9 hoyos. Devuelve `rondas_18`, `rondas_9` y `rondas_indeterminadas` (count only). NUNCA mezcles los promedios de 18h con los de 9h al razonar. Usá rondas_18 para tendencia general; rondas_9 para sub-segmento corto; indeterminadas son rondas viejas sin metadata suficiente — no inventes promedio para ellas. Cada cancha del resumen trae su `course_id`. Para listar rondas concretas usá find_rounds.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'find_rounds',
    description:
      'Busca rondas del jugador con filtros flexibles sobre TODO su historial (importado + jugado en la app, fuente única). Úsala cuando el jugador menciona una cancha ("mis rondas en Lomas de la Dehesa"), un período ("este año", "marzo"), o quiere las recientes / su mejor / su peor ronda: NO necesitas la fecha exacta. Devuelve una lista de rondas con id, fecha, cancha, course_id, total y hoyos. Para el detalle hoyo-por-hoyo de una, después usa get_round_by_date o get_course_scorecard con el course_id que te devuelve.',
    input_schema: {
      type: 'object',
      properties: {
        course: { type: 'string', description: 'Nombre de la cancha (ej "Lomas de la Dehesa") o su UUID. Opcional.' },
        desde: { type: 'string', description: 'Fecha desde YYYY-MM-DD (inclusive). Opcional.' },
        hasta: { type: 'string', description: 'Fecha hasta YYYY-MM-DD (inclusive). Opcional.' },
        holes: { type: 'number', description: 'Filtrar por 9 o 18 hoyos. Opcional.' },
        limit: { type: 'number', description: 'Máximo de rondas (default 10, tope 30).' },
        orden: { type: 'string', enum: ['reciente', 'antigua', 'mejor', 'peor'], description: 'Orden del resultado (default reciente).' },
      },
      required: [],
    },
  },
  {
    name: 'get_playing_handicap',
    description:
      'Calcula el HANDICAP DE JUEGO (course handicap WHS) del jugador en una cancha y tee concretos — los golpes que recibe en ESA cancha. Es DISTINTO del índice (el índice es uno solo; el handicap de juego depende de la cancha y el tee). Úsala cuando el jugador pregunte "cuántos golpes me da X", "mi handicap de juego", "con qué handicap juego en Y". NUNCA inventes este número: si no llamas esta tool, habla solo del índice y aclara que el de juego depende de la cancha.',
    input_schema: {
      type: 'object',
      properties: {
        course: { type: 'string', description: 'Nombre de la cancha (ej "Lomas de la Dehesa") o su UUID.' },
        tee: { type: 'string', description: 'Color del tee (ej "Blanco"). Opcional: si no se da, usa el tee por defecto del jugador.' },
        holes: { type: 'number', description: '9 o 18 (default 18). Opcional.' },
      },
      required: ['course'],
    },
  },
  {
    name: 'save_plan',
    description:
      'Asigna o actualiza un plan estructurado al jugador. ÚNICA forma de comprometer un plan — NUNCA escribir el plan en prosa sin llamar esta tool. Si la llamas, el sistema persiste el plan, marca cualquier plan activo previo como superseded, y el cerebro empieza a medir adherencia automáticamente. Llámala SOLO cuando tengas: (1) un patrón confirmado del jugador con datos reales, (2) hipótesis clara, (3) métrica medible, (4) target numérico realista para 2-12 semanas.',
    input_schema: {
      type: 'object',
      properties: {
        pattern_id: {
          type: 'string',
          enum: [...PATTERN_IDS],
          description: 'ID del patrón detectado (debe coincidir con player_patterns).',
        },
        observation_data: {
          type: 'object',
          properties: {
            data_points: {
              type: 'integer',
              minimum: 1,
              description: 'Cantidad de rondas/eventos en los que se observó el patrón.',
            },
            metric_value: {
              type: 'number',
              description: 'Valor actual de la métrica (será el baseline_value del plan).',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confianza 0-1 en la detección del patrón.',
            },
          },
          required: ['data_points', 'metric_value', 'confidence'],
        },
        hypothesis: {
          type: 'string',
          minLength: 20,
          maxLength: 500,
          description: 'Por qué creés que pasa esto. Una frase clara, no genérica.',
        },
        plan: {
          type: 'object',
          properties: {
            rule: {
              type: 'string',
              minLength: 10,
              maxLength: 800,
              description: 'Qué tiene que hacer el jugador. Concreto, accionable.',
            },
            metric: {
              type: 'string',
              enum: [...PLAN_METRICS],
              description: 'Qué se va a medir cada ronda.',
            },
            target_value: {
              type: 'number',
              description: 'Número objetivo para cumplir la meta.',
            },
            target_op: {
              type: 'string',
              enum: ['lte', 'gte', 'eq'],
              description: 'Cómo comparar metric_value vs target_value.',
            },
            duration_days: {
              type: 'integer',
              minimum: 7,
              maximum: 90,
              description: 'Días que dura el plan antes de declararse expired (default 21).',
            },
          },
          required: ['rule', 'metric', 'target_value', 'target_op', 'duration_days'],
        },
      },
      required: ['pattern_id', 'observation_data', 'hypothesis', 'plan'],
    },
  },
  {
    name: 'compute_score_projection',
    description:
      'Calcula un objetivo de score o un desglose de hoyos que SIEMPRE cierra aritméticamente. ÚSALA SIEMPRE que vayas a mostrar un score objetivo, un desglose ("X pares + Y bogeys") o una proyección. NUNCA hagas tú la aritmética del score: llama esta tool y usa EXACTAMENTE su resultado. Para que devuelva un score ABSOLUTO (ej "79"), pasa course_id: la tool verifica el par real de la cancha hoyo por hoyo. Si no pasas course_id o la cancha no tiene par completo, devuelve solo el "+N sobre par" (nunca un absoluto adivinado).',
    input_schema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'string',
          description: 'UUID de la cancha (del contexto/ronda). Necesario para un score absoluto verificado. Sin él, solo "+N sobre par".',
        },
        holes: { type: 'number', description: 'Hoyos de la ronda (18 o 9)', default: 18 },
        targetOver: { type: 'number', description: 'Objetivo en sobre-par (ej 7 para +7). Usar esto O distribution, no ambos.' },
        distribution: {
          type: 'object',
          description: 'Reparto explícito de hoyos para verificar un desglose puntual.',
          properties: {
            eagle: { type: 'number' }, birdie: { type: 'number' }, par: { type: 'number' },
            bogey: { type: 'number' }, double: { type: 'number' }, triple: { type: 'number' },
          },
        },
      },
      required: ['holes'],
    },
  },
] as const

// ---------- Executor ----------

export type ToolExecutionContext = {
  supabase: SupabaseClient
  userId: string
  defaultRondaId?: string | null
  sessionId?: string | null
}

type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_latest_round':
        return await getLatestRound(ctx)
      case 'get_round_by_id': {
        const id = typeof input.ronda_libre_id === 'string' ? input.ronda_libre_id : null
        if (!id) return { ok: false, error: 'Falta ronda_libre_id' }
        return await getRoundById(ctx, id)
      }
      case 'get_recent_rounds': {
        const raw = typeof input.limit === 'number' ? input.limit : 5
        const limit = Math.max(1, Math.min(10, raw))
        return await getRecentRounds(ctx, limit)
      }
      case 'get_course_details': {
        const id = typeof input.course_id === 'string' ? input.course_id : null
        if (!id) return { ok: false, error: 'Falta course_id' }
        return await getCourseDetails(ctx, id)
      }
      case 'get_course_scorecard': {
        const ref = typeof input.course === 'string' ? input.course : null
        if (!ref) return { ok: false, error: 'Falta course (nombre o UUID de la cancha)' }
        return await getCourseScorecard(ctx, ref)
      }
      case 'get_round_by_date': {
        const date = typeof input.date === 'string' ? input.date : null
        const courseName = typeof input.course_name === 'string' ? input.course_name : null
        if (!date) return { ok: false, error: 'Falta date (YYYY-MM-DD)' }
        return await getRoundByDate(ctx, date, courseName)
      }
      case 'get_all_rounds_summary':
        return await getAllRoundsSummary(ctx)
      case 'find_rounds': {
        const filters: CoachRoundFilters = {
          course: typeof input.course === 'string' ? input.course : null,
          desde: typeof input.desde === 'string' ? input.desde : null,
          hasta: typeof input.hasta === 'string' ? input.hasta : null,
          holes: typeof input.holes === 'number' ? input.holes : null,
          limit: typeof input.limit === 'number' ? input.limit : undefined,
          orden: typeof input.orden === 'string'
            ? (input.orden as CoachRoundFilters['orden'])
            : undefined,
        }
        const res = await findRoundsForCoach(ctx.supabase, ctx.userId, filters)
        return { ok: true, data: res }
      }
      case 'get_playing_handicap': {
        const course = typeof input.course === 'string' ? input.course : null
        if (!course) return { ok: false, error: 'Falta course (nombre o UUID de la cancha)' }
        const tee = typeof input.tee === 'string' ? input.tee : null
        const holes = typeof input.holes === 'number' ? input.holes : null
        const res = await computePlayingHandicapForCoach(ctx.supabase, ctx.userId, { course, tee, holes })
        if (!res.ok) return { ok: false, error: res.reason }
        const { ok: _ok, ...data } = res
        return { ok: true, data }
      }
      case 'save_plan':
        return await dispatchSavePlan(ctx, input)
      // Tools de Ola 2 "el coach te conoce" (sólo activas con cerebro_v3_enabled).
      case 'set_target':
        return await setTarget(ctx, input)
      case 'remember_fact':
        return await rememberFact(ctx, input)
      case 'recall_facts':
        return await recallFacts(ctx, input)
      case 'get_focus':
        return await getFocusTool(ctx)
      case 'get_progress':
        return await getProgress(ctx)
      // Ola 1b "priors externos": contexto de campo (vs hándicap / población / cancha).
      case 'field_context':
        return await fieldContext(ctx, input)
      case 'compute_score_projection':
        return await computeScoreProjection(ctx, input)
      default:
        return { ok: false, error: `Tool desconocida: ${name}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error ejecutando tool'
    return { ok: false, error: msg }
  }
}

// ---------- Implementaciones ----------

type HistoricalDetailRow = {
  id: string
  course_id: string | null
  course_name: string | null
  played_at: string | null
  scores: number[] | Record<string, number> | null
  total_gross: number | null
  holes_played: number | null
  par_per_hole?: unknown
}

/** Carga los pares (numero→par) de una o varias canchas en un solo query. */
async function loadParsByCourse(
  supabase: SupabaseClient,
  courseIds: Array<string | null>,
): Promise<Record<string, Record<number, number>>> {
  const parsByCourse: Record<string, Record<number, number>> = {}
  const ids = Array.from(new Set(courseIds.filter((x): x is string => !!x)))
  if (ids.length === 0) return parsByCourse
  const { data: holes } = await supabase
    .from('course_holes')
    .select('course_id, numero, par')
    .in('course_id', ids)
  for (const h of (holes ?? []) as Array<{ course_id: string; numero: number; par: number }>) {
    if (!parsByCourse[h.course_id]) parsByCourse[h.course_id] = {}
    parsByCourse[h.course_id][h.numero] = h.par
  }
  return parsByCourse
}

/** Lee el score de un hoyo tolerando ambas formas de `scores` en historical_rounds:
 *  array [n,…] (índice 0 = hoyo 1) u objeto {"1":n,…}. */
function scoreForHole(scores: HistoricalDetailRow['scores'], hole: number): number | null {
  if (Array.isArray(scores)) {
    const v = scores[hole - 1]
    return typeof v === 'number' ? v : null
  }
  if (scores && typeof scores === 'object') {
    const v = (scores as Record<string, number>)[String(hole)]
    return typeof v === 'number' ? v : null
  }
  return null
}

/** Arma el detalle hoyo-por-hoyo de una ronda de `historical_rounds`. Fuente
 *  compartida por get_latest_round y get_round_by_date. Solo hoyos jugados. */
function mapHistoricalRoundDetail(
  row: HistoricalDetailRow,
  parsByCourse: Record<string, Record<number, number>>,
) {
  // Pares de la ronda: PREFIERE el par_per_hole importado (autoritativo, inmune al
  // catálogo Damas/Varones sucio), cae a course_holes por los hoyos que falten.
  const catalogPars = row.course_id ? parsByCourse[row.course_id] ?? null : null
  const pars = resolveRoundPars(row.par_per_hole, catalogPars)
  const maxHole = row.holes_played && row.holes_played > 0 ? row.holes_played : 18
  const hoyos: Array<{ hoyo: number; par: number | null; strokes: number; vs_par: number | null }> = []
  let totalStrokes = 0
  let totalPar = 0
  for (let h = 1; h <= maxHole; h++) {
    const strokes = scoreForHole(row.scores, h) ?? 0
    if (strokes <= 0) continue
    const par = pars?.[h] ?? null
    const vsPar = par != null ? strokes - par : null
    hoyos.push({ hoyo: h, par, strokes, vs_par: vsPar })
    totalStrokes += strokes
    if (par != null) totalPar += par
  }
  return {
    id: row.id,
    ronda_id: row.id,
    fecha: row.played_at,
    cancha: row.course_name,
    course_id: row.course_id,
    holes_played: row.holes_played ?? hoyos.length,
    total_strokes: totalStrokes || row.total_gross || null,
    total_par: totalPar || null,
    vs_par: totalPar ? totalStrokes - totalPar : null,
    hoyos,
  }
}

async function getLatestRound(ctx: ToolExecutionContext): Promise<ToolResult> {
  const { supabase, userId, defaultRondaId } = ctx

  // Si el chat está dentro de una ronda en-vivo concreta, devolvemos su detalle
  // rico desde la tabla en-vivo (tiene tees/formato/estado que el historial no).
  if (defaultRondaId) return await getRoundById(ctx, defaultRondaId)

  // Fuente única: la última ronda del historial unificado (importada o en-vivo).
  // Antes leía solo ronda_libre_jugadores → un usuario importado-only veía
  // "no tenés rondas" aunque tuviera cientos. Bug P0 de campo (inbox 09-jun).
  const { data, error } = await supabase
    .from('historical_rounds')
    .select('id, course_id, course_name, played_at, scores, total_gross, holes_played, par_per_hole')
    .eq('user_id', userId)
    .or(OR_EXCLUDE_FEDEGOLF) // tarjetas FedeGolf (score-only) no son "la última ronda" del coach
    .not('total_gross', 'is', null)
    .order('played_at', { ascending: false })
    .limit(1)

  if (error) return { ok: false, error: `Error DB historial: ${error.message}` }
  const row = (data ?? [])[0] as HistoricalDetailRow | undefined
  if (!row) return { ok: false, error: 'El jugador todavía no tiene rondas registradas' }

  const parsByCourse = await loadParsByCourse(supabase, [row.course_id])
  return { ok: true, data: mapHistoricalRoundDetail(row, parsByCourse) }
}

async function getRoundById(ctx: ToolExecutionContext, rondaId: string): Promise<ToolResult> {
  const { supabase, userId } = ctx

  const { data: ronda, error: rErr } = await supabase
    .from('rondas_libres')
    .select('id, codigo, course_id, course_name, tees, holes, fecha, estado, modo_juego, formato_juego')
    .eq('id', rondaId)
    .maybeSingle()

  if (rErr) return { ok: false, error: `Error DB rondas: ${rErr.message}` }
  if (!ronda) return { ok: false, error: 'Ronda no encontrada' }

  const { data: jugador } = await supabase
    .from('ronda_libre_jugadores')
    .select('id, nombre, scores, user_id')
    .eq('ronda_id', rondaId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!jugador) return { ok: false, error: 'El jugador no participó en esta ronda' }

  // Pares de la cancha
  let pars: Record<number, number> = {}
  let courseParTotal: number | null = null
  if (ronda.course_id) {
    const { data: holes } = await supabase
      .from('course_holes')
      .select('numero, par')
      .eq('course_id', ronda.course_id)
      .order('numero')
    for (const h of holes ?? []) pars[h.numero] = h.par
    const { data: course } = await supabase
      .from('courses')
      .select('par_total')
      .eq('id', ronda.course_id)
      .maybeSingle()
    courseParTotal = course?.par_total ?? null
  }

  const scores = (jugador.scores ?? {}) as Record<string, number>
  const holeDetail: Array<{ hoyo: number; par: number | null; strokes: number; vs_par: number | null; resultado: string | null }> = []
  let totalStrokes = 0
  let totalPar = 0
  for (let h = 1; h <= ronda.holes; h++) {
    const strokes = scores[String(h)] ?? 0
    const par = pars[h] ?? null
    const vsPar = par != null && strokes > 0 ? strokes - par : null
    let resultado: string | null = null
    if (vsPar != null) {
      if (vsPar <= -2) resultado = 'eagle o mejor'
      else if (vsPar === -1) resultado = 'birdie'
      else if (vsPar === 0) resultado = 'par'
      else if (vsPar === 1) resultado = 'bogey'
      else if (vsPar === 2) resultado = 'doble bogey'
      else resultado = `+${vsPar}`
    }
    holeDetail.push({ hoyo: h, par, strokes, vs_par: vsPar, resultado })
    if (strokes > 0) totalStrokes += strokes
    if (par != null) totalPar += par
  }

  return {
    ok: true,
    data: {
      ronda_id: ronda.id,
      codigo: ronda.codigo,
      fecha: ronda.fecha,
      cancha: ronda.course_name,
      course_id: ronda.course_id,
      tees: ronda.tees,
      holes: ronda.holes,
      formato: ronda.formato_juego,
      estado: ronda.estado,
      total_strokes: totalStrokes,
      total_par: totalPar || null,
      vs_par: totalPar ? totalStrokes - totalPar : null,
      hoyos: holeDetail,
    },
  }
}

async function getRecentRounds(ctx: ToolExecutionContext, limit: number): Promise<ToolResult> {
  const { supabase, userId } = ctx

  // Fuente única: historial unificado (importadas + en-vivo) vía la data-layer.
  // Antes leía solo ronda_libre_jugadores → un usuario importado-only veía vacío.
  const res = await findRoundsForCoach(supabase, userId, { limit, orden: 'reciente' })
  const rondas = res.rounds.map(r => ({
    ronda_id: r.id,
    fecha: r.fecha,
    cancha: r.cancha,
    holes: r.holes_played,
    total_strokes: r.total_gross,
    source: r.source,
  }))

  return { ok: true, data: { rondas } }
}

async function getRoundByDate(
  ctx: ToolExecutionContext,
  date: string,
  courseName: string | null,
): Promise<ToolResult> {
  const { supabase, userId } = ctx
  // `played_at` es columna DATE (no timestamp). Un rango con literales de
  // timestamp (`${date}T00:00:00` / `T23:59:59`) los castea a DATE → trunca la
  // hora → queda `played_at >= D AND played_at < D`, contradicción que devuelve
  // CERO filas para CUALQUIER fecha. Se compara fecha contra fecha (igualdad).
  let query = supabase
    .from('historical_rounds')
    .select('id, course_id, course_name, played_at, scores, total_gross, holes_played, par_per_hole')
    .eq('user_id', userId)
    .or(OR_EXCLUDE_FEDEGOLF) // no matchear una tarjeta FedeGolf al buscar la ronda de una fecha
    .eq('played_at', date)
    .order('played_at', { ascending: false })

  if (courseName) {
    query = query.ilike('course_name', `%${courseName}%`)
  }

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: `No hay rondas del jugador en la fecha ${date}${courseName ? ` en ${courseName}` : ''}` }
  }

  // Pares hoyo por hoyo de las canchas de las rondas encontradas + detalle.
  const parsByCourse = await loadParsByCourse(supabase, data.map(r => r.course_id))
  const rounds = data.map(r => mapHistoricalRoundDetail(r as HistoricalDetailRow, parsByCourse))

  return { ok: true, data: { count: rounds.length, rounds } }
}

type HistoricalRow = {
  total_gross: number
  course_id: string | null
  course_name: string
  played_at: string
  holes_played: number | null
  scores: number[] | Record<string, number> | null
}

export function summarizeBucket(arr: HistoricalRow[]) {
  if (arr.length === 0) return null
  const totals = arr.map(r => r.total_gross)
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length
  const best = Math.min(...totals)
  const worst = Math.max(...totals)
  const last10 = totals.slice(0, 10)
  const last10Avg = last10.length > 0 ? last10.reduce((a, b) => a + b, 0) / last10.length : null

  // Agrupar por IDENTIDAD de cancha (course_id), no por el texto del nombre.
  // Una misma cancha física puede aparecer con variantes de nombre
  // ("Los Leones" / "Club De Golf Los Leones" / "Club de Golf Los Leones");
  // agrupar por string fragmenta las stats y el coach la ve como varias canchas
  // distintas, dando promedios separados de la misma cancha. Cuando no hay
  // course_id (rondas viejas) caemos al nombre normalizado como key.
  const byCourse: Record<string, { course_id: string | null; count: number; sum: number; nombres: Record<string, number> }> = {}
  for (const r of arr) {
    const key = r.course_id ?? `name:${(r.course_name || 'Sin cancha').trim().toLowerCase()}`
    if (!byCourse[key]) byCourse[key] = { course_id: r.course_id ?? null, count: 0, sum: 0, nombres: {} }
    byCourse[key].count++
    byCourse[key].sum += r.total_gross
    const nombre = r.course_name || 'Sin cancha'
    byCourse[key].nombres[nombre] = (byCourse[key].nombres[nombre] || 0) + 1
  }
  const topCourses = Object.values(byCourse)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(v => ({
      // Nombre representativo: la variante más frecuente para esa identidad.
      cancha: Object.entries(v.nombres).sort((a, b) => b[1] - a[1])[0][0],
      // course_id canónico de la identidad — el coach lo necesita para pedir el
      // scorecard/detalle sin adivinar. null en rondas viejas sin course_id.
      course_id: v.course_id,
      rondas: v.count,
      avg_score: Math.round((v.sum / v.count) * 10) / 10,
    }))

  return {
    total: arr.length,
    avg_score: Math.round(avg * 10) / 10,
    best_score: best,
    worst_score: worst,
    last10_avg: last10Avg != null ? Math.round(last10Avg * 10) / 10 : null,
    tendencia_ultimas_10_vs_total: last10Avg != null ? Math.round((last10Avg - avg) * 10) / 10 : null,
    top_canchas: topCourses,
  }
}

async function getAllRoundsSummary(ctx: ToolExecutionContext): Promise<ToolResult> {
  const { supabase, userId } = ctx
  const { data, error } = await supabase
    .from('historical_rounds')
    .select('total_gross, course_id, course_name, played_at, holes_played, scores')
    .eq('user_id', userId)
    .or(OR_EXCLUDE_FEDEGOLF) // tarjetas FedeGolf (score-only) fuera del análisis del coach
    .not('total_gross', 'is', null)
    .order('played_at', { ascending: false })

  if (error) return { ok: false, error: error.message }
  const rounds = (data ?? []) as HistoricalRow[]
  if (rounds.length === 0) return { ok: true, data: { total: 0 } }

  const rounds18 = rounds.filter(r => inferHoles(r) === 18)
  const rounds9 = rounds.filter(r => inferHoles(r) === 9)
  const indeterminadas = rounds.filter(r => inferHoles(r) === null)

  return {
    ok: true,
    data: {
      total: rounds.length,
      primera_ronda: rounds[rounds.length - 1].played_at,
      ultima_ronda: rounds[0].played_at,
      rondas_18: summarizeBucket(rounds18),
      rondas_9: summarizeBucket(rounds9),
      rondas_indeterminadas: {
        total: indeterminadas.length,
        nota: 'Rondas viejas sin holes_played ni scores en formato reconocible. Excluidas de los promedios — no inventar score promedio para este grupo.',
      },
      nota_metodologia: 'Los buckets rondas_18 y rondas_9 están separados estrictamente por hole count (inferido desde holes_played o scores.length). NUNCA promediar entre buckets.',
    },
  }
}

async function getCourseDetails(ctx: ToolExecutionContext, courseId: string): Promise<ToolResult> {
  const { supabase } = ctx

  const [courseRes, holesRes] = await Promise.all([
    supabase.from('courses').select('id, nombre, ciudad, par_total').eq('id', courseId).maybeSingle(),
    supabase.from('course_holes').select('numero, par, stroke_index').eq('course_id', courseId).order('numero'),
  ])

  if (courseRes.error) return { ok: false, error: courseRes.error.message }
  if (!courseRes.data) return { ok: false, error: 'Cancha no encontrada' }

  return {
    ok: true,
    data: {
      id: courseRes.data.id,
      nombre: courseRes.data.nombre,
      ciudad: courseRes.data.ciudad,
      par_total: courseRes.data.par_total,
      hoyos: (holesRes.data ?? []).map((h) => ({
        numero: h.numero,
        par: h.par,
        stroke_index: h.stroke_index ?? null,
      })),
    },
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Scorecard de una cancha aceptando NOMBRE o UUID.
 *
 * El coach conoce las canchas por su nombre (del resumen / del jugador), no por
 * su UUID. Antes solo existía get_course_details(UUID), así que el coach no podía
 * pedir los pares de "Lomas de la Dehesa" — terminaba pidiéndoselos al jugador.
 * Acá resolvemos nombre→cancha con el matcher canónico compartido
 * (`matchCourseInDB`, mismo que usa import + torneos) y degradamos honesto si la
 * cancha no está en el catálogo: NUNCA se le pide el scorecard al jugador.
 */
async function getCourseScorecard(ctx: ToolExecutionContext, ref: string): Promise<ToolResult> {
  const { supabase } = ctx
  const trimmed = ref.trim()
  if (!trimmed) return { ok: false, error: 'Falta el nombre o UUID de la cancha' }

  // Camino directo: ya es un UUID.
  if (UUID_RE.test(trimmed)) return await getCourseDetails(ctx, trimmed)

  // Camino por nombre: resolver con el matcher canónico.
  const match = await matchCourseInDB(trimmed, supabase)
  if (!match) {
    return {
      ok: false,
      error: `No hay ninguna cancha que coincida con "${trimmed}" en el catálogo. NO le pidas los pares al jugador: la app no tiene esa cancha catalogada todavía. Ofrece el mejor análisis posible con los scores que sí tengas.`,
    }
  }

  const details = await getCourseDetails(ctx, match.id)
  if (!details.ok) return details
  return {
    ok: true,
    data: {
      ...(details.data as Record<string, unknown>),
      resolved_from: trimmed,
      match_confidence: match.score,
    },
  }
}

/**
 * Calculadora determinista de score para el coach. El absoluto SOLO se emite con
 * par COMPLETO verificado desde course_holes (exactamente `holes` hoyos con par válido):
 * un parTotal que tipee el LLM no produce absoluto (puede inventarlo o pasarlo parcial —
 * cierra el caso "17 de 18 hoyos → absoluto plausible pero mal con sello de garantía").
 * Sin course_id confiable, devuelve solo "+N sobre par".
 */
async function computeScoreProjection(
  ctx: ToolExecutionContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const holes = typeof input.holes === 'number' ? input.holes : 18
  const targetOver = typeof input.targetOver === 'number' ? input.targetOver : undefined
  const distribution =
    input.distribution && typeof input.distribution === 'object'
      ? (input.distribution as Partial<Distribution>)
      : undefined
  const courseId = typeof input.course_id === 'string' ? input.course_id : null

  // El par confiable se lee de la BD por course_id; debe estar COMPLETO (= holes hoyos).
  let verifiedParTotal: number | null = null
  if (courseId) {
    const { data: holesRows } = await ctx.supabase
      .from('course_holes')
      .select('par')
      .eq('course_id', courseId)
      .order('numero')
    const pars = (holesRows ?? [])
      .map((h: { par: number | null }) => h.par)
      .filter((p): p is number => typeof p === 'number')
    if (pars.length === holes) {
      verifiedParTotal = pars.reduce((a, b) => a + b, 0)
    }
  }

  const r = projectScore({ parTotal: verifiedParTotal, holes, targetOver, distribution })
  return { ok: true, data: r }
}

// ---------- save_plan dispatcher ----------

/**
 * Valida la entrada de la tool save_plan y delega al plan-engine.
 * El schema del tool ya garantiza enums + minLength/maxLength desde el LLM,
 * pero validamos defensivamente para fallar rápido si llega data malformada.
 */
async function dispatchSavePlan(
  ctx: ToolExecutionContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const parsed = parseSavePlanInput(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const result = await savePlan(
    { supabase: ctx.supabase, userId: ctx.userId, sessionId: ctx.sessionId ?? null },
    parsed.value,
  )

  if (!result.ok) return { ok: false, error: result.error }
  return {
    ok: true,
    data: {
      plan_id: result.plan_id,
      superseded_plan_id: result.superseded_plan_id,
      summary: result.summary,
    },
  }
}

function parseSavePlanInput(
  raw: Record<string, unknown>,
): { ok: true; value: SavePlanInput } | { ok: false; error: string } {
  const patternId = raw.pattern_id
  if (typeof patternId !== 'string' || !(PATTERN_IDS as readonly string[]).includes(patternId)) {
    return { ok: false, error: 'pattern_id inválido' }
  }

  const obs = raw.observation_data
  if (!isObj(obs)) return { ok: false, error: 'observation_data faltante' }
  const dataPoints = obs.data_points
  const metricValue = obs.metric_value
  const confidence = obs.confidence
  if (typeof dataPoints !== 'number' || !Number.isInteger(dataPoints) || dataPoints < 1) {
    return { ok: false, error: 'observation_data.data_points debe ser entero >=1' }
  }
  if (typeof metricValue !== 'number' || !Number.isFinite(metricValue)) {
    return { ok: false, error: 'observation_data.metric_value debe ser número finito' }
  }
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    return { ok: false, error: 'observation_data.confidence debe estar entre 0 y 1' }
  }

  const hypothesis = raw.hypothesis
  if (typeof hypothesis !== 'string' || hypothesis.length < 20 || hypothesis.length > 500) {
    return { ok: false, error: 'hypothesis debe ser string 20-500 chars' }
  }

  const plan = raw.plan
  if (!isObj(plan)) return { ok: false, error: 'plan faltante' }
  const rule = plan.rule
  const metric = plan.metric
  const targetValue = plan.target_value
  const targetOp = plan.target_op
  const durationDays = plan.duration_days

  if (typeof rule !== 'string' || rule.length < 10 || rule.length > 800) {
    return { ok: false, error: 'plan.rule debe ser string 10-800 chars' }
  }
  if (typeof metric !== 'string' || !(PLAN_METRICS as readonly string[]).includes(metric)) {
    return { ok: false, error: 'plan.metric inválido' }
  }
  if (typeof targetValue !== 'number' || !Number.isFinite(targetValue)) {
    return { ok: false, error: 'plan.target_value debe ser número finito' }
  }
  if (targetOp !== 'lte' && targetOp !== 'gte' && targetOp !== 'eq') {
    return { ok: false, error: 'plan.target_op debe ser lte|gte|eq' }
  }
  if (typeof durationDays !== 'number' || !Number.isInteger(durationDays) || durationDays < 7 || durationDays > 90) {
    return { ok: false, error: 'plan.duration_days debe ser entero 7-90' }
  }

  return {
    ok: true,
    value: {
      pattern_id: patternId as SavePlanInput['pattern_id'],
      observation_data: { data_points: dataPoints, metric_value: metricValue, confidence },
      hypothesis,
      plan: {
        rule,
        metric: metric as SavePlanInput['plan']['metric'],
        target_value: targetValue,
        target_op: targetOp,
        duration_days: durationDays,
      },
    },
  }
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}
