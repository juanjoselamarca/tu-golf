// Contexto del jugador: interface TaigerContext + buildContextString.
// Mantenida la firma exacta. Extraído literal de prompts.ts (Ola 0 Task 10).
//
// El placeholder {PLAYER_CONTEXT} en TAIGER_SYSTEM_PROMPT se reemplaza en runtime
// con la salida de buildContextString(context).

export const PLAYER_CONTEXT_PLACEHOLDER = '{PLAYER_CONTEXT}'

export interface TaigerContext {
  player: {
    name: string
    handicap: number | null
    indice?: number | null
    total_rounds: number
    // Campos opcionales emitidos por buildPlayerContext (no consumidos por buildContextString)
    indice_golfers?: number | null
    nivel?: number
    indice_nota?: string | null
  }
  stats: {
    // Modelo híbrido (15-may-2026):
    // avg_score y best_score son SIEMPRE en escala "equivalente 18 hoyos":
    // cada ronda se normaliza con gross × (18/holes_played) y el promedio
    // se computa sobre todas las rondas. Alineado con WHS chileno (la
    // federación proyecta 9h linealmente a 18h al ingresar al historial).
    avg_score: number | null
    best_score: number | null
    // Métricas reales por bucket — NO normalizadas. Le permiten al coach
    // hablar de 18h o 9h reales y calcular cansancio mental.
    real_avg_18h: number | null
    real_avg_9h: number | null
    rounds_18h: number
    rounds_9h: number
    // Cansancio mental cuantificado:
    //   mental_fatigue_delta = real_avg_18h − (real_avg_9h × 2)
    // > 0 → el jugador pierde golpes en la segunda mitad (cansancio normal/alto).
    // = 0 → mismo nivel proyectado vs real (disciplina mental sólida).
    // < 0 → juega MEJOR en 18h reales que su proyección de 9h.
    // null cuando no hay ≥3 rondas en cada bucket (no es estadísticamente útil).
    mental_fatigue_delta: number | null
    total_birdies: number
    total_eagles: number
    front9_avg: number | null
    back9_avg: number | null
  }
  patterns: Array<{
    pattern_type: string
    confidence: number
    metadata: Record<string, unknown>
    status: string
  }>
  recent_rounds: Array<{
    played_at?: string
    course_name?: string
    course_id?: string
    total_gross: number
    over_under?: number
    scores?: (number | null)[] | null
    course_pars?: Record<number, number> | null
  }>
  last_session: {
    session_type: string
    created_at: string
    next_focus: string | null
    techniques_assigned: unknown[]
  } | null
  recent_sessions?: Array<{
    id: string
    session_type: string
    created_at: string
    next_focus: string | null
    messages?: Array<{ role: string; content: string }>
  }>
  active_recommendations?: Array<{
    recommendation: string
    category: string
    focus_area: string
    status: string
    score_before: number | null
    score_after: number | null
    created_at: string
  }>
  collective_insights?: Array<{
    pattern_type: string
    insight: string
    sample_size: number
    confidence: number
  }>
  active_plan?: {
    id: string
    pattern_id: string
    hypothesis: string
    rule: string
    metric: string
    target_value: number
    target_op: 'lte' | 'gte' | 'eq'
    baseline_value: number | null
    duration_days: number
    created_at: string
  } | null
  recent_outcomes?: Array<{
    played_at: string
    metric_value: number
    delta_vs_baseline: number | null
    target_reached: boolean
    compliance: 'full' | 'partial' | 'none' | 'unknown'
  }>
  plan_history?: Array<{
    pattern_id: string
    resolution_reason: string | null
    created_at: string
    resolved_at: string | null
    total_outcomes: number
    full_compliance_count: number
  }>
}

export function buildContextString(context: TaigerContext): string {
  const { player, stats, patterns, recent_rounds, last_session, recent_sessions, active_recommendations, collective_insights, active_plan, recent_outcomes, plan_history } = context
  const indice = player.indice ?? player.handicap ?? null

  const indexLevel = !indice ? 'sin índice registrado' :
    indice > 25 ? 'principiante' :
    indice > 15 ? 'amateur medio' :
    indice > 5 ? 'amateur bueno' :
    'single digit / élite amateur'

  const trend = (recent_rounds ?? []).length >= 3
    ? (() => {
        const scores = recent_rounds.slice(0, 3).map(r => r.total_gross)
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length
        const last = scores[0]
        return last < avg - 2 ? 'en buena forma' :
               last > avg + 2 ? 'forma irregular' :
               'forma estable'
      })()
    : 'sin datos suficientes'

  const patternDescriptions: Record<string, string> = {
    back_nine_collapse: 'colapso en los últimos 9 hoyos',
    three_putt_frequency: 'exceso de 3-putts',
    par_3_weakness: 'debilidad en par 3',
    pressure_deterioration: 'baja el rendimiento bajo presión',
    driving_inconsistency: 'inconsistencia con el driver',
    front_nine_struggles: 'arranque lento en el campo',
    short_game_weakness: 'juego corto deficiente',
    post_bogey_spiral: 'espiral post-bogey',
    first_hole_anxiety: 'ansiedad en hoyo 1',
  }

  const patternText = (patterns ?? []).length > 0
    ? (patterns ?? []).map(p =>
        `- ${patternDescriptions[p.pattern_type] ?? p.pattern_type} (confianza: ${Math.round((p.confidence ?? 0) * 100)}%)`
      ).join('\n')
    : 'Sin patrones estadísticos aún (necesita más rondas)'

  // Render del bloque de stats (modelo híbrido 15-may-2026):
  //
  // 1. Score primario = avg_score, SIEMPRE en escala equivalente 18 hoyos
  //    (proyección lineal × 18/holes_played por ronda, alineado con WHS
  //    chileno). Coincide con cómo la federación ve el handicap del
  //    jugador, evitando que el user vea un avg "del coach" inconsistente
  //    con su perfil.
  //
  // 2. Detalle por bucket (real_avg_18h / real_avg_9h) se cita solo si hay
  //    rondas en ambos buckets — info granular para que el LLM la use si
  //    el user pregunta específico, sin abrumar a quien juega una sola
  //    modalidad.
  //
  // 3. Cansancio mental: si mental_fatigue_delta está computado, lo
  //    exponemos al LLM con instrucción explícita de cuándo mencionarlo.
  let sgText: string
  if (!stats.avg_score || !indice) {
    sgText = 'Sin suficientes datos estadísticos'
  } else {
    const lines: string[] = []
    lines.push(`Score promedio (equivalente 18 hoyos): ${stats.avg_score.toFixed(1)}`)
    lines.push(`Mejor vuelta (equivalente 18 hoyos): ${stats.best_score?.toFixed(1) ?? 'Sin datos'}`)
    lines.push(`Índice actual: ${indice}`)
    if (stats.rounds_18h > 0 && stats.rounds_9h > 0) {
      lines.push(
        `Detalle real por bucket — usar solo si el user pregunta específico:` +
        ` 18h real ${stats.real_avg_18h?.toFixed(1) ?? '—'} (${stats.rounds_18h} rondas),` +
        ` 9h real ${stats.real_avg_9h?.toFixed(1) ?? '—'} (${stats.rounds_9h} rondas).`,
      )
    }
    if (stats.mental_fatigue_delta != null) {
      const fd = stats.mental_fatigue_delta
      const interpretation = fd > 3
        ? `cansancio mental ALTO (+${fd.toFixed(1)} strokes que se pierden por fatiga después del hoyo 9). Insight relevante — comentarlo si la conversación lo amerita.`
        : fd > 1
          ? `cansancio mental NORMAL (+${fd.toFixed(1)} strokes). No es señal, no lo menciones espontáneamente.`
          : fd < -1
            ? `juega ${Math.abs(fd).toFixed(1)} strokes MEJOR en 18h reales que la proyección lineal de su 9h — calentamiento lento o foco creciente. Comentar si pertinente.`
            : `cansancio mental NULO (${fd.toFixed(1)}). Disciplina mental sólida — felicitar si el user pregunta sobre su segunda vuelta.`
      lines.push(`Cansancio mental: ${interpretation}`)
    }
    sgText = lines.join('\n')
  }

  // Build session history section
  const sessionsText = (recent_sessions ?? []).length > 0
    ? (recent_sessions ?? []).map((s, i) => {
        const date = new Date(s.created_at).toLocaleDateString('es-CL')
        const msgs = s.messages ?? []
        const assistantMsgs = msgs.filter(m => m.role === 'assistant')
        const summary = assistantMsgs.length > 0
          ? assistantMsgs[0].content.substring(0, 150) + '...'
          : s.next_focus ?? 'Sin resumen'
        return `Sesión ${i + 1} (${date}, ${s.session_type}): ${summary}`
      }).join('\n')
    : 'Sin sesiones previas'

  // Build recommendations section
  const recsText = (active_recommendations ?? []).length > 0
    ? (active_recommendations ?? []).map(r => {
        const scoreChange = r.score_before != null && r.score_after != null
          ? ` | Score: ${r.score_before} -> ${r.score_after}`
          : r.score_before != null
            ? ` | Score al momento: ${r.score_before}`
            : ''
        return `- [${r.category}/${r.focus_area}] ${r.recommendation}${scoreChange}`
      }).join('\n')
    : 'Sin recomendaciones activas'

  // Build collective insights section
  const insightsText = (collective_insights ?? []).length > 0
    ? (collective_insights ?? []).map(ci =>
        `- ${ci.insight} (n=${ci.sample_size}, confianza: ${Math.round(ci.confidence * 100)}%)`
      ).join('\n')
    : 'Sin datos colectivos disponibles'

  return `
=== PERFIL DEL JUGADOR ===
Nombre: ${player.name}
Índice oficial: ${indice ?? 'No registrado'}
Nivel: ${indexLevel}
Rondas registradas: ${player.total_rounds ?? 0}
Tendencia actual: ${trend}

=== ESTADÍSTICAS ===
${sgText}
Promedio Front 9: ${stats.front9_avg?.toFixed(1) ?? 'Sin datos'}
Promedio Back 9: ${stats.back9_avg?.toFixed(1) ?? 'Sin datos'}
Total birdies: ${stats.total_birdies ?? 0}
Total eagles: ${stats.total_eagles ?? 0}

=== PATRONES DETECTADOS ===
${patternText}

=== ÚLTIMA SESIÓN ===
${last_session
  ? `Tipo: ${last_session.session_type} | Fecha: ${new Date(last_session.created_at).toLocaleDateString('es-CL')}\nFoco asignado: ${last_session.next_focus ?? 'No definido'}`
  : 'Primera sesión con tAIger+'}

=== HISTORIAL DE SESIONES ===
${sessionsText}

=== RECOMENDACIONES ACTIVAS ===
${recsText}

=== DATOS COLECTIVOS (jugadores de nivel similar) ===
${insightsText}

=== PLAN ACTIVO DEL CEREBRO ===
${active_plan
  ? `Patrón: ${active_plan.pattern_id}
Hipótesis: ${active_plan.hypothesis}
Regla: ${active_plan.rule}
Métrica: ${active_plan.metric} ${active_plan.target_op} ${active_plan.target_value}${active_plan.baseline_value != null ? ` (baseline ${active_plan.baseline_value})` : ''}
Duración: ${active_plan.duration_days} días desde ${new Date(active_plan.created_at).toLocaleDateString('es-CL')}`
  : 'Sin plan activo. Si el jugador necesita uno, llamá la tool save_plan con datos reales.'}

=== ÚLTIMOS OUTCOMES DEL PLAN ===
${(recent_outcomes ?? []).length > 0
  ? (recent_outcomes ?? []).map(o =>
      `- ${new Date(o.played_at).toLocaleDateString('es-CL')}: métrica=${o.metric_value} | ${o.target_reached ? '✓ target alcanzado' : '✗ fuera de target'} | compliance=${o.compliance}${o.delta_vs_baseline != null ? ` | Δ baseline=${o.delta_vs_baseline >= 0 ? '+' : ''}${o.delta_vs_baseline.toFixed(2)}` : ''}`
    ).join('\n')
  : active_plan ? 'Aún sin rondas medidas contra este plan' : 'N/A'}

=== HISTORIAL DE PLANES PREVIOS ===
${(plan_history ?? []).length > 0
  ? (plan_history ?? []).map(p => {
      const start = new Date(p.created_at).toLocaleDateString('es-CL')
      const end = p.resolved_at ? new Date(p.resolved_at).toLocaleDateString('es-CL') : '?'
      const ratio = p.total_outcomes > 0 ? `${p.full_compliance_count}/${p.total_outcomes} cumplidas` : 'sin outcomes'
      return `- ${p.pattern_id} (${start} → ${end}): ${p.resolution_reason ?? 'resuelto'} | ${ratio}`
    }).join('\n')
  : 'Sin planes previos'}

=== ÚLTIMAS 3 RONDAS (DETALLE HOYO POR HOYO) ===
${(recent_rounds ?? []).slice(0, 3).map((r, i) => {
  const header = `Ronda ${i + 1}: ${r.total_gross} golpes en ${r.course_name ?? 'cancha no registrada'} (${r.played_at ? new Date(r.played_at).toLocaleDateString('es-CL') : 'fecha desconocida'}) [${(r.over_under ?? 0) > 0 ? '+' : ''}${r.over_under ?? 0}]`
  const scores = r.scores as (number | null)[] | null | undefined
  const pars = r.course_pars as Record<number, number> | null | undefined
  if (!scores || !Array.isArray(scores) || scores.length === 0) return header
  const holeLines = scores.map((s, idx) => {
    if (s == null || s === 0) return null
    const holeNum = idx + 1
    const par = pars?.[holeNum] ?? null
    const vsPar = par != null ? s - par : null
    const label = vsPar == null ? '' : vsPar <= -2 ? ' (eagle+)' : vsPar === -1 ? ' (birdie)' : vsPar === 0 ? '' : vsPar === 1 ? ' (bogey)' : vsPar === 2 ? ' (doble)' : ` (+${vsPar})`
    return `  H${holeNum}: ${s}${par != null ? ` (par ${par})` : ''}${label}`
  }).filter(Boolean)
  return header + '\\n' + holeLines.join('\\n')
}).join('\\n\\n') || 'Sin rondas registradas'}
`.trim()
}

/**
 * Único starter para la sesión continua. El coach detecta el modo (post-ronda,
 * plan semanal, pre-torneo, consulta libre) por lo que el jugador escribe,
 * no por un parámetro de UI.
 */
