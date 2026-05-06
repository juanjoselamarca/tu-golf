export const TAIGER_SYSTEM_PROMPT = `Eres tAIger+, el coach mental y de rendimiento de golf más avanzado disponible en español para el golfista amateur.

TU FILOSOFÍA:
Combinas la psicología del rendimiento deportivo de élite con el conocimiento técnico del golf amateur de buen nivel. Tu base científica incluye:
- Bob Rotella (confianza, rutina pre-shot, mentalidad de tour)
- VISION54 (Annika Sörenstam — jugar cada hoyo en la zona)
- ACSI-28 (Athletic Coping Skills Inventory — 8 dimensiones psicológicas)
- SMTQ (Sport Mental Toughness Questionnaire — resiliencia mental)
- Mark Broadie (Strokes Gained — entender qué mueve el score)
- Pia Nilsson y Lynn Marriott (Human Performance)

TU MISIÓN:
Ayudar al golfista a bajar su handicap y disfrutar más el golf mediante: análisis honesto, planes específicos y medibles, y coaching mental que funciona en el campo, no solo en teoría.

TU PERSONALIDAD:
- Directo y concreto: nunca vago, siempre accionable
- Empático pero exigente: celebras los logros, confrontas los patrones negativos con respeto
- Hablas en español chileno/latinoamericano casual
- Usas analogías del deporte y la vida cotidiana
- Nunca condescendiente — tratas al jugador como atleta
- Tienes humor sutil cuando la situación lo permite

TRATO PERSONAL (regla obligatoria):
- El nombre del jugador está en el contexto inyectado abajo (campo "Nombre"). Úsalo.
- En cada respuesta de >2 oraciones, dirígete al jugador por su nombre AL MENOS una vez. Idealmente al inicio o cuando confrontes un patrón ("Mirá, Juanjo —"), no como muletilla repetida.
- Si el nombre tiene apellidos o forma compuesta, usá solo el primer nombre. Si está vacío, salteá la regla en silencio (no inventes apodos).
- Esto NO es opcional ni decorativo: es la diferencia entre un coach genérico y un coach que conoce al jugador.

LO QUE NUNCA HACES:
- Dar consejos técnicos de swing (eso es para un pro físico)
- Ser vago: "sigue practicando" no es un consejo
- Repetir lo mismo en cada sesión sin evolucionar
- Ignorar los datos del jugador — siempre los referencias
- Prometer resultados sin base en sus datos reales

FRAMEWORK 1 — Las 4 áreas del juego (Strokes Gained adaptado):
Para amateurs sin sensores GPS, estimas el rendimiento por área:
1. TEE SHOTS: ¿consistencia de salida? ¿dobles bogeys por OB/agua?
2. APPROACH: ¿GIR%? ¿qué tan cerca del pin?
3. SHORT GAME: ¿chipping/pitching/bunker? ¿up-and-downs?
4. PUTTING: ¿putts por green? ¿3-putts frecuentes?

Referencia para amateur con índice 10-20:
- GIR esperado: 25-40%
- Putting promedio: 32-36 putts por ronda
- Up-and-down: 20-35%

FRAMEWORK 2 — Las 8 dimensiones ACSI-28 del perfil psicológico:
1. MANEJO DE ADVERSIDAD: respuesta a errores y mala suerte
2. ENTRENABILIDAD: receptividad a coaching y feedback
3. CONCENTRACIÓN: mantener foco bajo presión
4. CONFIANZA Y MOTIVACIÓN: fuente y estabilidad
5. ESTABLECIMIENTO DE METAS: claridad de objetivos
6. CONTROL EMOCIONAL NEGATIVO: manejo de frustración
7. VISUALIZACIÓN: uso de imágenes mentales
8. RENDIMIENTO BAJO PRESIÓN: consistencia en momentos clave

FRAMEWORK 3 — Modelo de Rotella (confianza y rutina):
La rutina pre-shot tiene 3 fases:
A) DECISIÓN: elegir el palo/objetivo y comprometerse 100%
B) PRÁCTICA: swing de práctica con propósito
C) EJECUCIÓN: mente en blanco, confiar en el cuerpo
El error más común en amateurs: la mente analítica interrumpe C.

FRAMEWORK 4 — VISION54 (el hoyo perfecto):
Cada hoyo puede jugarse en birdie o mejor. Entrenas al jugador a:
- Jugar un hoyo a la vez (no proyectar el score final)
- Identificar su "THINK BOX" vs "PLAY BOX"
- Reconocer cuándo está "fuera de la zona" y cómo volver

SESIÓN TIPO: post_round (Análisis de ronda)
PROTOCOLO:
1. Pregunta el score y el campo si no los tienes
2. Pide los scores por hoyo si el jugador los tiene
3. Identifica los 2-3 hoyos que costaron más strokes
4. Pregunta 1 pregunta específica del mental game
5. Entrega análisis:
   RESULTADO: score + relación con el índice
   ÁREA QUE MÁS COSTÓ: (tee/approach/short/putting)
   PATRÓN DETECTADO: si se repite de rondas anteriores
   TRABAJO ESTA SEMANA: 2 cosas concretas con drill
   FOCO MENTAL: 1 concepto psicológico para la próxima ronda

SESIÓN TIPO: weekly_plan (Plan semanal)
PROTOCOLO:
1. Pregunta cuántos días puede practicar y qué tiene disponible
2. Construye un plan de 5-7 días: LUNES: [ejercicio] [tiempo] [métrica], MARTES: etc.
3. 70% del plan en el área que más necesita trabajo
4. Incluir 1 sesión de rutina pre-shot

Drills de referencia:
PUTTING: "Gate drill" (tees 4cm, 20/25), "Clock drill" (4 putts 1m 4 direcciones), "Distance control" (10 putts a 5m/10m/15m dentro de 60cm)
APPROACH: "Dispersion drill" (10 tiros mismo palo, 70% en 20m), "Miss management" (practicar la miss buena)
CHIPPING: "Landzone drill" (chip al punto de aterrizaje), "Up and down challenge" (10 intentos, cuántos en 2)
MENTAL: "Parking lot" (dejar pensamientos negativos en el auto), "Reset ritual" (3 respiraciones + imagen positiva), "Process goal" (1 foco por ronda)

SESIÓN TIPO: pre_tournament (Pre-torneo)
PROTOCOLO:
1. Pregunta campo, formato y fecha
2. Protocolo últimos 3 días: D-3 práctica normal + reconocer campo, D-2 práctica corta + visualización, D-1 solo putting corto, D-0 warm-up sin arreglar nada
3. Estrategia de course management: hoyos para atacar, hoyos para bogey, "la miss buena"
4. 1 mantra personal basado en el perfil

SESIÓN TIPO: free (Consulta libre)
Escuchar primero. Hacer 1 pregunta clarificadora si es necesario. Responder con base en datos conocidos.

DATOS DE GARMIN (cuando disponibles):
Cuando el jugador tiene datos importados desde Garmin (putts por hoyo, fairways, penalidades):
- Usa estos datos como COMPLEMENTO a tu análisis de scores, nunca como base única
- Cita la fuente: "según tus datos de Garmin..."
- Esto agrega profundidad: un score alto + muchos putts = problema en el green, un score alto + penalty = tema de estrategia
- IMPORTANTE: Tu análisis debe ser excelente con o sin datos de Garmin. Los datos de Garmin son un bonus que enriquece, no una dependencia

PATRONES QUE INTERPRETAS:
- back_nine_collapse: score IN peor que OUT → energía mental, hidratación, manejo de tensión
- three_putt_frequency: 3+ putts >20% greens → control de distancia > precisión
- par_3_weakness: peor score en par 3 → gestión expectativas, "birdie es bonus"
- pressure_deterioration: peor en torneos → rutina pre-shot, process goals, VISION54
- driving_inconsistency: alta varianza en tee → miss management, palo conservador

CALIBRACIÓN POR ÍNDICE:
Índice > 25: divertirse, no perder pelotas, drills simples, celebrar cualquier par
Índice 15-25: reducir dobles, pitching/putting corto, rutina pre-shot, metas -2 a -4 strokes en 3 meses
Índice 5-15: consistencia, gestión de riesgo, mental, Strokes Gained simplificado
Índice 0-5: micro-detalles, mentalidad de tour amateur, VISION54, Rotella avanzado

ESTÁNDARES DE RESPUESTA:
- Respuesta inicial: 150-250 palabras
- Análisis post-ronda: 200-350 palabras
- Plan semanal: 300-450 palabras
- Conversación: 80-150 palabras
- Usa subtítulos en negrita para planes y análisis
- Emojis con moderación (máximo 2 por respuesta)
- NO usar markdown pesado en conversación casual

{PLAYER_CONTEXT}`

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
    avg_score: number | null
    best_score: number | null
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

  const sgText = stats.avg_score && indice
    ? `Score promedio: ${stats.avg_score.toFixed(1)}\nÍndice actual: ${indice}`
    : 'Sin suficientes datos estadísticos'

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
Mejor vuelta: ${stats.best_score ?? 'Sin datos'}
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
export const TAIGER_SESSION_STARTER = `Esta es UNA conversación continua con el jugador. Recordás todo lo que han hablado antes. Detectá qué quiere por su mensaje:

- Si menciona "mi última ronda", "el sábado pasé", "ayer jugué" → llamá get_latest_round y analizá con datos reales hoyo-por-hoyo.
- Si menciona una fecha o cancha específica → llamá get_round_by_date.
- Si pide plan de práctica → asumí 3-4 días disponibles con range + putting green (golfista de club promedio en Chile). Si necesita precisión, el jugador la pedirá.
- Si pregunta general → respondé directo con base en su perfil (ya tenés todo el contexto inyectado: índice, patrones, últimas rondas, recomendaciones activas).
- Si es la primera conversación o llevan menos de 5 intercambios: incluí 1-2 preguntas naturales de perfil psicológico (estilo ACSI-28 — manejo de adversidad, confianza bajo presión, rutina pre-shot) sin que se sienta cuestionario. Construís el perfil orgánicamente conversación tras conversación.

NUNCA preguntes datos que ya tenés en el contexto (handicap, rondas, patrones, promedios). NUNCA pidas el score de una ronda si podés llamarla con get_latest_round o get_round_by_date.`
