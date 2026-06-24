// Derivación PURA del opener proactivo + chips de arranque del coach tAIger+.
//
// Extraído de `src/app/api/taiger/intro/route.ts` (regla "el que toca, ordena":
// el handler queda delgado — solo las 5 queries — y la lógica de selección vive
// acá, pura y testeable sin red ni Supabase).
//
// El opener es determinístico (cero costo LLM): usa la data del jugador para un
// hook concreto. Los `chips` son 3 preguntas sugeridas (voz del usuario) que
// arrancan la conversación, derivadas del mismo contexto (foco / plan / ronda).

export type HookType =
  | 'recent_round'
  | 'last_round_with_score'
  | 'plan_with_progress'
  | 'plan_no_progress'
  | 'long_absence'
  | 'newcomer'
  | 'fallback'

export interface IntroContext {
  name: string
  roundDaysAgo: number | null
  courseLabel: string
  lastGross: number | null
  hasPlan: boolean
  planPatternId: string | null
  outcomesCount: number
  targetsReached: number
  totalRounds: number
}

export interface IntroResult {
  opener: string
  hook_type: HookType
  /** 3 preguntas sugeridas (voz del usuario) para arrancar el chat de un toque. */
  chips: string[]
}

export function humanPattern(id: string | null): string {
  if (!id) return 'tu plan activo'
  const map: Record<string, string> = {
    back_nine_collapse: 'el back nine',
    front_nine_struggles: 'el front nine',
    first_hole_anxiety: 'el primer hoyo',
    par_3_weakness: 'los pares 3',
    short_game_weakness: 'el juego corto',
    post_bogey_spiral: 'la recuperación post-bogey',
    three_putt_frequency: 'los three putts',
    pressure_deterioration: 'el cierre bajo presión',
    driving_inconsistency: 'la consistencia desde el tee',
  }
  return map[id] ?? 'tu plan activo'
}

/**
 * Chips de arranque por tipo de hook. Voz del usuario (lo que tocaría para
 * preguntarle al coach), en tuteo chileno — consistente con el resto de la UI.
 * Siempre 3: foco + plan de la semana + última ronda (adaptados al contexto).
 */
function chipsFor(hook: HookType, patternLabel: string | null): string[] {
  const foco = patternLabel ? `¿Cómo trabajo ${patternLabel}?` : '¿En qué debería enfocarme?'
  switch (hook) {
    case 'recent_round':
    case 'last_round_with_score':
      return ['Analiza mi última ronda', foco, 'Dame un plan para esta semana']
    case 'plan_with_progress':
    case 'plan_no_progress':
      return [foco, 'Dame ejercicios para esta semana', '¿Vamos bien con el plan?']
    case 'long_absence':
      return ['Quiero volver a jugar', 'Arma un plan para retomar', '¿Por dónde empiezo?']
    case 'newcomer':
      return ['¿Cómo me puedes ayudar?', 'Quiero bajar mi score', 'Analiza mi juego']
    case 'fallback':
    default:
      return ['¿En qué debería enfocarme?', 'Dame un plan para esta semana', 'Analiza mi última ronda']
  }
}

/**
 * Selecciona el opener + chips según el contexto del jugador. Reglas de prioridad
 * (primer match gana) — idénticas al route original, ahora con chips:
 *  1. Última ronda hoy           4. Plan sin outcomes
 *  2. Última ronda 1-7d c/score   5. >7d sin jugar
 *  3. Plan con outcomes           6. <3 rondas (newcomer)  7. fallback
 */
export function buildIntro(ctx: IntroContext): IntroResult {
  const { name, roundDaysAgo, courseLabel, lastGross, hasPlan, outcomesCount, targetsReached, totalRounds } = ctx
  const pattern = hasPlan ? humanPattern(ctx.planPatternId) : null
  const greeting = name ? `${name}, ` : ''
  const make = (opener: string, hook_type: HookType): IntroResult => ({ opener, hook_type, chips: chipsFor(hook_type, pattern) })

  // 1) Última ronda hoy (< 24h)
  if (roundDaysAgo === 0) {
    return make(
      name ? `Vi que jugaste hoy en ${courseLabel}, ${name}. ¿Cómo te sentiste?`
           : `Vi que jugaste hoy en ${courseLabel}. ¿Cómo te sentiste?`,
      'recent_round',
    )
  }

  // 2) Última ronda 1-7 días, con score
  if (roundDaysAgo !== null && roundDaysAgo >= 1 && roundDaysAgo <= 7 && typeof lastGross === 'number') {
    const dayWord = roundDaysAgo === 1 ? 'ayer' : `hace ${roundDaysAgo} días`
    return make(
      `${greeting}${dayWord} jugaste ${lastGross} en ${courseLabel}. ¿Quieres repasar la ronda o trabajar algo puntual?`,
      'last_round_with_score',
    )
  }

  // 3) Plan activo con outcomes registrados
  if (hasPlan && outcomesCount > 0) {
    const trend = targetsReached >= Math.ceil(outcomesCount / 2) ? 'viene mejorando' : 'todavía está en progreso'
    return make(
      `${greeting}tu plan actual sobre ${pattern} ${trend} (${targetsReached}/${outcomesCount} rondas en target). ¿Cómo lo sentís?`,
      'plan_with_progress',
    )
  }

  // 4) Plan activo sin outcomes aún
  if (hasPlan && outcomesCount === 0) {
    return make(
      `${greeting}arrancamos hace poco con foco en ${pattern}. ¿Pudiste salir a la cancha o practicar?`,
      'plan_no_progress',
    )
  }

  // 5) >7 días sin jugar
  if (roundDaysAgo !== null && roundDaysAgo > 7) {
    return make(
      name ? `Hace ${roundDaysAgo} días que no anotas una ronda, ${name}. ¿Cuándo sales de nuevo?`
           : `Hace ${roundDaysAgo} días que no anotas una ronda. ¿Cuándo sales de nuevo?`,
      'long_absence',
    )
  }

  // 6) Newcomer: <3 rondas
  if (totalRounds < 3) {
    return make(
      name ? `Bienvenido, ${name}. Para arrancar fuerte: cuéntame cómo viene tu juego últimamente o pásame el score de tu última ronda.`
           : `Bienvenido. Para arrancar fuerte: cuéntame cómo viene tu juego últimamente o pásame el score de tu última ronda.`,
      'newcomer',
    )
  }

  // 7) Fallback
  return make(
    name ? `Hola ${name}, ¿en qué te puedo ayudar hoy?` : `Hola, ¿en qué te puedo ayudar hoy?`,
    'fallback',
  )
}
