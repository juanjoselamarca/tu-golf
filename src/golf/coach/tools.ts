import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Definiciones de tools que tAIger+ puede llamar durante una conversación.
 * Formato Anthropic tool use. Resuelven el problema de que el coach no tenía
 * acceso al detalle hoyo-por-hoyo ni a los pares de la cancha.
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
      'Resumen estadístico agregado del 100% de las rondas históricas del jugador: totales, promedio, mejor y peor score, distribución por cancha, tendencia últimas 10 vs total. Úsala cuando el jugador pregunte sobre evolución, tendencias generales, o comparaciones a largo plazo.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
] as const

// ---------- Executor ----------

export type ToolExecutionContext = {
  supabase: SupabaseClient
  userId: string
  defaultRondaId?: string | null
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

async function getAllRoundsSummary(ctx: ToolExecutionContext): Promise<ToolResult> {
  const { supabase, userId } = ctx
  const { data, error } = await supabase
    .from('historical_rounds')
    .select('total_gross, course_name, played_at, holes_played')
    .eq('user_id', userId)
    .not('total_gross', 'is', null)
    .order('played_at', { ascending: false })

  if (error) return { ok: false, error: error.message }
  const rounds = (data ?? []) as Array<{ total_gross: number; course_name: string; played_at: string; holes_played: number | null }>
  if (rounds.length === 0) return { ok: true, data: { total: 0 } }

  const totals = rounds.map(r => r.total_gross)
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length
  const best = Math.min(...totals)
  const worst = Math.max(...totals)
  const last10 = totals.slice(0, 10)
  const last10Avg = last10.length > 0 ? last10.reduce((a, b) => a + b, 0) / last10.length : null

  // Distribucion por cancha (top 5)
  const byCourse: Record<string, { count: number; sum: number }> = {}
  for (const r of rounds) {
    const key = r.course_name || 'Sin cancha'
    if (!byCourse[key]) byCourse[key] = { count: 0, sum: 0 }
    byCourse[key].count++
    byCourse[key].sum += r.total_gross
  }
  const topCourses = Object.entries(byCourse)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([cancha, v]) => ({ cancha, rondas: v.count, avg_score: Math.round((v.sum / v.count) * 10) / 10 }))

  return {
    ok: true,
    data: {
      total: rounds.length,
      avg_score: Math.round(avg * 10) / 10,
      best_score: best,
      worst_score: worst,
      last10_avg: last10Avg != null ? Math.round(last10Avg * 10) / 10 : null,
      tendencia_ultimas_10_vs_total: last10Avg != null ? Math.round((last10Avg - avg) * 10) / 10 : null,
      primera_ronda: rounds[rounds.length - 1].played_at,
      ultima_ronda: rounds[0].played_at,
      top_canchas: topCourses,
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
