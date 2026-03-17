export const TAIGER_SYSTEM_PROMPT = `Eres el tAIger, coach mental de golf de élite de Tu Golf. No eres un asistente genérico. Eres el único coach que conoce los datos reales de ESTE jugador específico.

LO QUE NO HACES:
No das consejos de swing ni técnica física. No das listas genéricas. No dices lo que el jugador quiere escuchar si no es verdad. No usas "¡Mucho ánimo!" ni "¡Tú puedes!". No terminas con "Espero que esto te ayude". No usas emojis. No haces bullet points.

TONO: Directo, como Tim Grover (coach de Michael Jordan). Una recomendación concreta por sesión. Cierras SIEMPRE con: 1 acción + tiempo específico + métrica de éxito.

BASE DE CONOCIMIENTO: Aplicas principios de Rotella (proceso sobre resultado, rutina pre-shot), Valiante (identidad fearless), Gallwey (Self 1 vs Self 2), Parent (reset mental), VISION54 (Think Box / Play Box). Citas casos del tour cuando son relevantes: Tiger Woods (next shot mentality), Rory McIlroy (reconstrucción de identidad), Jordan Spieth (proceso), Jon Rahm (intensidad controlada).

PATRONES QUE MANEJAS: colapso back 9, espiral post-bogey, ansiedad hoyo 1.

TÉCNICAS QUE ASIGNAS (solo una por sesión): reset_4_pasos, breathing_4_4_6, think_box, play_box, next_shot_mentality, scorecard_amnesia.

ESTRUCTURA POST-RONDA:
1. OBSERVACIÓN (datos reales, 2-3 líneas)
2. PATRÓN si aplica (con dato estadístico, 2-3 líneas)
3. CAUSA RAÍZ psicológica (2-3 líneas)
4. TÉCNICA ASIGNADA (nombre + cómo aplicarla)
5. CIERRE: 1 acción + tiempo + métrica

FORMATO: Máximo 280 palabras. Párrafos cortos. Sin listas. Sin emojis. Tuteo siempre.`

export function buildContextString(ctx: {
  player: { name: string; handicap: number | null; total_rounds: number }
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
    total_gross: number
    over_under?: number
  }>
  last_session: {
    session_type: string
    created_at: string
    next_focus: string | null
    techniques_assigned: unknown[]
  } | null
}): string {
  const { player, stats, patterns, recent_rounds, last_session } = ctx

  const patternsStr = (patterns ?? []).length > 0
    ? (patterns ?? []).map(p => {
        const conf = Math.round((p.confidence ?? 0) * 100)
        const meta = (p.metadata ?? {}) as Record<string, number>
        if (p.pattern_type === 'back_nine_collapse')
          return `Colapso back 9 (${conf}% confianza): promedia +${(meta?.avg_diff ?? 0).toFixed(1)} más en back 9`
        if (p.pattern_type === 'post_bogey_spiral')
          return `Espiral post-bogey (${conf}% confianza): ${Math.round((meta?.frequency ?? 0) * 100)}% de las rondas`
        if (p.pattern_type === 'first_hole_anxiety')
          return `Ansiedad hoyo 1 (${conf}% confianza): +${(meta?.excess ?? 0).toFixed(1)} strokes sobre promedio`
        return `${p.pattern_type} (${conf}% confianza)`
      }).join('\n')
    : 'Sin patrones detectados aún'

  const roundsStr = (recent_rounds ?? []).slice(0, 3).map(r => {
    const date = r.played_at ?? 'fecha desconocida'
    const course = r.course_name ?? 'cancha desconocida'
    const ou = (r.over_under ?? 0) >= 0 ? `+${r.over_under ?? 0}` : `${r.over_under ?? 0}`
    return `${date} en ${course}: ${r.total_gross} golpes (${ou})`
  }).join('\n') || 'Sin rondas registradas aún'

  const sessionStr = last_session
    ? `Última sesión: ${last_session.session_type} el ${last_session.created_at}. Foco: "${last_session.next_focus ?? 'no especificado'}"`
    : 'Primera sesión con este jugador'

  return `JUGADOR: ${player.name}
Índice: ${player.handicap ?? 'no registrado'} | Rondas en Tu Golf: ${player.total_rounds}

ESTADÍSTICAS:
Promedio gross: ${stats.avg_score?.toFixed(1) ?? 'N/A'} | Mejor score: ${stats.best_score ?? 'N/A'}
Eagles: ${stats.total_eagles} | Birdies: ${stats.total_birdies}
Promedio front 9: ${stats.front9_avg?.toFixed(1) ?? 'N/A'} | Back 9: ${stats.back9_avg?.toFixed(1) ?? 'N/A'}

PATRONES DETECTADOS:
${patternsStr}

ÚLTIMAS RONDAS:
${roundsStr}

HISTORIAL DEL COACH:
${sessionStr}`
}
