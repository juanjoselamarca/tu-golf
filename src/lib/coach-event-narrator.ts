/**
 * Coach Event Narrator — convierte un coach_event raw en una tarjeta
 * legible en español natural, sin jerga técnica.
 *
 * Usado por:
 *  - /admin/sistema/taiger/live (feed en vivo)
 *  - /admin/sistema/taiger/[userId] timeline (drill por usuario)
 */

export type NarratorLevel = 'success' | 'warning' | 'danger' | 'info' | 'muted'

export interface NarratorOutput {
  icon: string
  level: NarratorLevel
  /** Frase principal en español natural */
  title: string
  /** Detalle opcional debajo del title */
  subtitle?: string
  /** Si true → card destacada. Si false → línea fina (para no saturar el feed). */
  important: boolean
}

const PATTERN_LABELS: Record<string, string> = {
  back_nine_collapse: 'caída en los últimos 9 hoyos',
  three_putt_frequency: 'demasiados 3-putts',
  par_3_weakness: 'debilidad en par 3',
  pressure_deterioration: 'baja bajo presión',
  driving_inconsistency: 'inconsistencia con el driver',
  front_nine_struggles: 'arranque lento',
  short_game_weakness: 'juego corto débil',
  post_bogey_spiral: 'espiral post-bogey',
  first_hole_anxiety: 'nervios en hoyo 1',
}

const METRIC_LABELS: Record<string, string> = {
  back9_minus_front9_strokes: 'diferencia back-front',
  avg_first_hole_score: 'score hoyo 1',
  par3_avg_vs_par: 'par 3 sobre par',
  three_putts_per_round: '3-putts por ronda',
  post_bogey_score_avg: 'score después de bogey',
  double_or_worse_pct: '% dobles o peor',
  last4holes_minus_rest_strokes: 'últimos 4 vs resto',
  total_gross_cv: 'inconsistencia de score',
  short_game_strokes_per_round: 'tiros de juego corto',
}

const TOOL_LABELS: Record<string, string> = {
  get_latest_round: 'última ronda',
  get_round_by_id: 'una ronda específica',
  get_round_by_date: 'ronda por fecha',
  get_recent_rounds: 'rondas recientes',
  get_all_rounds_summary: 'historial completo',
  get_course_details: 'datos de cancha',
  get_course_scorecard: 'pares de la cancha',
  find_rounds: 'tus rondas',
  save_plan: 'asignar plan',
}

/**
 * Frase corta en presente continuo para mostrar al usuario mientras el coach
 * piensa. Usada por el chat (/coach/sesion/[id]) durante el streaming.
 *
 *   get_latest_round  → "Leyendo tu última ronda…"
 *   save_plan         → "Asignando tu plan…"
 */
export function toolActivityLabel(toolName: string): string {
  switch (toolName) {
    case 'get_latest_round':       return 'Leyendo tu última ronda…'
    case 'get_round_by_id':        return 'Buscando esa ronda…'
    case 'get_round_by_date':      return 'Buscando la ronda de esa fecha…'
    case 'get_recent_rounds':      return 'Comparando tus últimas rondas…'
    case 'get_all_rounds_summary': return 'Repasando tu historial completo…'
    case 'get_course_details':     return 'Mirando los pares de la cancha…'
    case 'get_course_scorecard':   return 'Mirando los pares de la cancha…'
    case 'find_rounds':            return 'Buscando tus rondas…'
    case 'save_plan':              return 'Asignando tu plan…'
    default:                       return 'Pensando…'
  }
}

/** Nombre humano del patrón (mismo set que usa el narrator interno). */
export function friendlyPatternName(patternId: string): string {
  return PATTERN_LABELS[patternId] ?? patternId
}

/** Nombre humano de la métrica del plan. */
export function friendlyMetricName(metric: string): string {
  return METRIC_LABELS[metric] ?? metric
}

export function narrateEvent(event: {
  type: string
  payload: Record<string, unknown> | null
  created_at: string
}): NarratorOutput {
  const p = event.payload ?? {}

  switch (event.type) {
    case 'plan_assigned': {
      const pat = (p.pattern_id as string) ?? '?'
      const label = PATTERN_LABELS[pat] ?? pat
      const supersededId = p.superseded_plan_id as string | null
      return {
        icon: '🎯',
        level: 'success',
        title: 'Coach asignó un plan',
        subtitle: supersededId
          ? `Sobre "${label}". Reemplazó un plan anterior.`
          : `Sobre "${label}".`,
        important: true,
      }
    }

    case 'plan_resolved':
      return {
        icon: '🏆',
        level: 'success',
        title: 'Plan completado con éxito',
        subtitle: 'El jugador llegó a la meta 3 rondas seguidas.',
        important: true,
      }

    case 'plan_superseded':
      return {
        icon: '🔄',
        level: 'warning',
        title: 'Plan anterior reemplazado',
        subtitle: 'El coach detectó algo más prioritario y cambió el plan.',
        important: true,
      }

    case 'plan_outcome': {
      const reached = Boolean(p.target_reached)
      const compliance = p.compliance as string
      if (compliance === 'unknown') {
        return {
          icon: '❓',
          level: 'muted',
          title: 'Ronda medida pero no se pudo evaluar',
          subtitle: 'La métrica del plan necesita datos que la app todavía no captura.',
          important: false,
        }
      }
      const m = METRIC_LABELS[p.metric as string] ?? (p.metric as string)
      return {
        icon: reached ? '📈' : '📉',
        level: reached ? 'success' : 'info',
        title: reached ? 'Ronda dentro de la meta' : 'Ronda fuera de la meta',
        subtitle: `Medida: ${m} = ${formatNum(p.metric_value)}.`,
        important: reached,
      }
    }

    case 'pattern_detected': {
      const pat = (p.pattern_id as string) ?? '?'
      const label = PATTERN_LABELS[pat] ?? pat
      const conf = typeof p.confidence === 'number' ? Math.round(p.confidence * 100) : null
      return {
        icon: '🔍',
        level: 'info',
        title: `Coach detectó patrón: ${label}`,
        subtitle: conf != null ? `Confianza ${conf}%.` : undefined,
        important: false,
      }
    }

    case 'pattern_resolved':
      return {
        icon: '✓',
        level: 'success',
        title: 'Patrón resuelto — el jugador lo superó',
        important: false,
      }

    case 'tool_called': {
      const tool = (p.tool_name as string) ?? '?'
      const label = TOOL_LABELS[tool] ?? tool
      const ok = Boolean(p.ok)
      const ms = (p.ms as number) ?? 0
      if (!ok) {
        return {
          icon: '🛑',
          level: 'danger',
          title: `Falló al consultar: ${label}`,
          subtitle: (p.error as string) ?? undefined,
          important: true,
        }
      }
      return {
        icon: '🔧',
        level: 'muted',
        title: `Coach consultó: ${label}`,
        subtitle: `${ms} ms`,
        important: false,
      }
    }

    case 'hallucination_check': {
      const flagged = Boolean(p.flagged)
      if (!flagged) {
        return {
          icon: '✓',
          level: 'muted',
          title: 'Coach respondió sin inventar',
          important: false,
        }
      }
      const warnings = (p.warnings as Array<{ kind: string; evidence: string }>) ?? []
      const kinds = Array.from(new Set(warnings.map(w => w.kind)))
      const numbers = kinds.includes('unknown_number')
      const courses = kinds.includes('unknown_course')
      let what = 'algo no verificable'
      if (numbers && courses) what = 'números y nombres de canchas no verificables'
      else if (numbers) what = 'números que no están en su contexto'
      else if (courses) what = 'una cancha que no jugó el usuario'
      return {
        icon: '⚠️',
        level: 'danger',
        title: `Coach pudo haber inventado ${what}`,
        subtitle: warnings.length === 1
          ? `Específicamente: "${warnings[0].evidence}".`
          : `${warnings.length} cosas detectadas — clic para revisar.`,
        important: true,
      }
    }

    case 'extractor_shadow': {
      const count = (p.regex_extracted_count as number) ?? 0
      if (count === 0) {
        return {
          icon: '·',
          level: 'muted',
          title: 'Respuesta sin lenguaje de plan',
          important: false,
        }
      }
      return {
        icon: '👻',
        level: 'warning',
        title: `Habló de un plan en prosa (${count} consejo${count === 1 ? '' : 's'})`,
        subtitle: 'No comprometió formalmente — el coach debería haber asignado un plan estructurado.',
        important: false,
      }
    }

    case 'hallucination_review': {
      const verdict = p.verdict as string
      const isFP = verdict === 'false_positive'
      return {
        icon: '👤',
        level: 'muted',
        title: isFP ? 'Admin marcó como falsa alarma' : 'Admin confirmó que el coach inventó',
        important: false,
      }
    }

    case 'round_processed': {
      const course = (p.course_name as string) ?? 'cancha desconocida'
      const total = p.total_gross != null ? `${p.total_gross} golpes` : 'ronda'
      const backfilled = Boolean(p.backfilled)
      return {
        icon: '⛳',
        level: 'muted',
        title: backfilled ? 'Ronda histórica registrada' : 'Ronda nueva entró al sistema',
        subtitle: `${course} · ${total}`,
        important: false,
      }
    }

    case 'session_message':
      return {
        icon: '💬',
        level: 'muted',
        title: 'Mensaje de conversación',
        important: false,
      }

    case 'context_built':
      return {
        icon: '🧠',
        level: 'muted',
        title: 'Coach armó contexto del jugador',
        important: false,
      }

    case 'admin_override':
      return {
        icon: '👤',
        level: 'warning',
        title: 'Admin intervino manualmente',
        important: true,
      }

    default:
      return {
        icon: '·',
        level: 'muted',
        title: event.type,
        important: false,
      }
  }
}

function formatNum(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  if (Math.abs(v) < 1) return v.toFixed(2)
  if (Math.abs(v) < 10) return v.toFixed(1)
  return Math.round(v).toString()
}
