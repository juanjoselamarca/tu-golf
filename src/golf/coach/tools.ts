import type { SupabaseClient } from '@supabase/supabase-js'
import { savePlan, PATTERN_IDS, PLAN_METRICS, type SavePlanInput } from './plan-engine'
import { inferHoles } from '@/golf/core/holes'

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
      'Obtén la última ronda libre finalizada del jugador con el detalle hoyo-por-hoyo, pares de la cancha y strokes sobre par por hoyo. Úsala cuando el jugador haga referencia a "mi última ronda", "la vuelta de hoy" o similar sin identificar una ronda específica.',
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
      'Obtén información de una cancha: pares por hoyo, stroke index, par total. Úsala cuando necesites calcular strokes sobre par o analizar dificultad por hoyo.',
    input_schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'UUID de la cancha' },
      },
      required: ['course_id'],
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
      'Resumen estadístico de las rondas históricas del jugador, SEPARADO entre rondas de 18 hoyos y de 9 hoyos. Devuelve `rondas_18`, `rondas_9` y `rondas_indeterminadas` (count only). NUNCA mezcles los promedios de 18h con los de 9h al razonar. Usá rondas_18 para tendencia general; rondas_9 para sub-segmento corto; indeterminadas son rondas viejas sin metadata suficiente — no inventes promedio para ellas. Para análisis ronda-por-ronda usá get_latest_round / get_round_by_date.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'save_plan',
    description:
      'Asigna o actualiza un plan estructurado al jugador. ÚNICA forma de comprometer un plan — NUNCA escribir el plan en prosa sin llamar esta tool. Si la llamás, el sistema persiste el plan, marca cualquier plan activo previo como superseded, y el cerebro empieza a medir adherencia automáticamente. Llamala SOLO cuando tengas: (1) un patrón confirmado del jugador con datos reales, (2) hipótesis clara, (3) métrica medible, (4) target numérico realista para 2-12 semanas.',
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
      case 'get_round_by_date': {
        const date = typeof input.date === 'string' ? input.date : null
        const courseName = typeof input.course_name === 'string' ? input.course_name : null
        if (!date) return { ok: false, error: 'Falta date (YYYY-MM-DD)' }
        return await getRoundByDate(ctx, date, courseName)
      }
      case 'get_all_rounds_summary':
        return await getAllRoundsSummary(ctx)
      case 'save_plan':
        return await dispatchSavePlan(ctx, input)
      default:
        return { ok: false, error: `Tool desconocida: ${name}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error ejecutando tool'
    return { ok: false, error: msg }
  }
}

// ---------- Implementaciones ----------

async function getLatestRound(ctx: ToolExecutionContext): Promise<ToolResult> {
  const { supabase, userId, defaultRondaId } = ctx

  let rondaId = defaultRondaId ?? null
  if (!rondaId) {
    const { data: jug } = await supabase
      .from('ronda_libre_jugadores')
      .select('ronda_id, created_at, rondas_libres!inner(id, estado, fecha)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    const first = (jug ?? []).find(
      (r: { rondas_libres?: { estado?: string } | Array<{ estado?: string }> }) => {
        const rl = Array.isArray(r.rondas_libres) ? r.rondas_libres[0] : r.rondas_libres
        return rl?.estado === 'finalizada'
      },
    ) as { ronda_id?: string } | undefined
    rondaId = first?.ronda_id ?? null
  }

  if (!rondaId) return { ok: false, error: 'El jugador no tiene rondas libres finalizadas' }
  return await getRoundById(ctx, rondaId)
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

  const { data: jugadores, error } = await supabase
    .from('ronda_libre_jugadores')
    .select('ronda_id, scores, rondas_libres!inner(id, course_name, fecha, holes, estado, formato_juego)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit * 2)

  if (error) return { ok: false, error: error.message }

  const rondas = (jugadores ?? [])
    .map((j) => {
      const rl = Array.isArray(j.rondas_libres) ? j.rondas_libres[0] : j.rondas_libres
      if (!rl || rl.estado !== 'finalizada') return null
      const scores = (j.scores ?? {}) as Record<string, number>
      const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0)
      return {
        ronda_id: j.ronda_id,
        fecha: rl.fecha,
        cancha: rl.course_name,
        holes: rl.holes,
        formato: rl.formato_juego,
        total_strokes: total,
      }
    })
    .filter(Boolean)
    .slice(0, limit)

  return { ok: true, data: { rondas } }
}

async function getRoundByDate(
  ctx: ToolExecutionContext,
  date: string,
  courseName: string | null,
): Promise<ToolResult> {
  const { supabase, userId } = ctx
  let query = supabase
    .from('historical_rounds')
    .select('id, course_id, course_name, played_at, scores, total_gross, holes_played')
    .eq('user_id', userId)
    .gte('played_at', `${date}T00:00:00`)
    .lt('played_at', `${date}T23:59:59`)
    .order('played_at', { ascending: false })

  if (courseName) {
    query = query.ilike('course_name', `%${courseName}%`)
  }

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: `No hay rondas del jugador en la fecha ${date}${courseName ? ` en ${courseName}` : ''}` }
  }

  // Cargar pares hoyo por hoyo de las canchas de las rondas encontradas
  const courseIds = Array.from(new Set(data.map(r => r.course_id).filter((x): x is string => !!x)))
  const parsByCourse: Record<string, Record<number, number>> = {}
  if (courseIds.length > 0) {
    const { data: holes } = await supabase
      .from('course_holes')
      .select('course_id, numero, par')
      .in('course_id', courseIds)
    for (const h of (holes ?? []) as Array<{ course_id: string; numero: number; par: number }>) {
      if (!parsByCourse[h.course_id]) parsByCourse[h.course_id] = {}
      parsByCourse[h.course_id][h.numero] = h.par
    }
  }

  const rounds = data.map(r => {
    const scores = Array.isArray(r.scores) ? (r.scores as (number | null)[]) : []
    const pars = r.course_id ? parsByCourse[r.course_id] : null
    const hoyos = scores.map((s, idx) => {
      const holeNum = idx + 1
      const par = pars?.[holeNum] ?? null
      return {
        hoyo: holeNum,
        par,
        strokes: s,
        vs_par: par != null && s != null && s > 0 ? s - par : null,
      }
    }).filter(h => h.strokes != null && h.strokes > 0)
    return {
      id: r.id,
      fecha: r.played_at,
      cancha: r.course_name,
      total_strokes: r.total_gross,
      holes_played: r.holes_played,
      hoyos,
    }
  })

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
  const byCourse: Record<string, { count: number; sum: number; nombres: Record<string, number> }> = {}
  for (const r of arr) {
    const key = r.course_id ?? `name:${(r.course_name || 'Sin cancha').trim().toLowerCase()}`
    if (!byCourse[key]) byCourse[key] = { count: 0, sum: 0, nombres: {} }
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
