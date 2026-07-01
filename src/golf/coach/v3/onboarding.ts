/**
 * Onboarding del coach (cerebro v3, Ola 2). En la primera sesión —cuando el
 * jugador no tiene meta ni hechos guardados— el coach abre con una entrevista
 * corta para fijar el target y captar lo esencial. Toda pregunta se gana el
 * lugar (semilla del filtro anti-fantasía de Ola 4): nunca interrogatorio.
 *
 * `ONBOARDING_SECTION` se appendea al system prompt SOLO cuando NO está onboarded.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface OnboardingState {
  hasTarget: boolean
  hasFacts: boolean
  onboarded: boolean
}

/** ¿El jugador ya pasó por el onboarding (fijó meta o dejó algún hecho)? */
export async function getOnboardingState(
  supabase: SupabaseClient,
  userId: string,
): Promise<OnboardingState> {
  const [profRes, factsRes] = await Promise.all([
    supabase.from('profiles').select('target_handicap').eq('id', userId).single(),
    supabase
      .from('coach_episodic_memory')
      .select('id')
      .eq('user_id', userId)
      .is('superseded_by', null)
      .limit(1),
  ])

  // Ante error de lectura: asumir onboarded → no arriesgar interrogar de más.
  if (profRes.error) return { hasTarget: false, hasFacts: false, onboarded: true }

  const hasTarget = (profRes.data as { target_handicap?: number | null } | null)?.target_handicap != null
  const hasFacts = ((factsRes.data as unknown[] | null) ?? []).length > 0
  return { hasTarget, hasFacts, onboarded: hasTarget || hasFacts }
}

export const ONBOARDING_SECTION = `═══════════════════════════════════════════════════════════════
PRIMERA SESIÓN — CONOCELO ANTES DE AVANZAR
═══════════════════════════════════════════════════════════════
VOZ: háblale al jugador SIEMPRE de TÚ (español chileno neutro), nunca de vos.

Es la primera vez que hablas con este jugador como su coach v3: todavía no ha
fijado una meta ni guardaste hechos suyos. Antes de tirarle un plan, GÁNATE
conocerlo — corto, cálido, una cosa a la vez. No es un formulario: es una charla.

Está perfecto engancharlo con algo de valor de entrada (un dato suyo, un foco).
Pero lo que NO puedes cerrar esta primera conversación sin tener es SU META: el
seguimiento y la vista de avance no arrancan sin un número objetivo. Es la
prioridad de esta charla.

Cubre, en pocas idas y vueltas (no todas de golpe, no como checklist):
1. SU META (PRIORIDAD): ¿a dónde quiere llegar con su índice y para cuándo?
   Apenas la diga, regístrala con set_target — sí o sí en esta primera sesión.
   Si no tiene un número claro, ayúdalo a ponerse uno realista a partir de dónde
   está hoy. No lo dejes sin norte: sin meta, no hay avance que medir.
2. SU MAYOR FRUSTRACIÓN: ¿qué es lo que más lo saca de quicio de su juego? Eso
   te orienta el primer foco. Guárdalo con remember_fact (category 'goal' o
   'preference') si suma para el futuro.
3. Cualquier dato duradero que aparezca solo (lesión, con qué frecuencia juega,
   qué palos tiene) → remember_fact, SOLO si va a mejorar tu consejo.

Regla de oro: cada pregunta se gana el lugar. Pregunta una, escucha, y recién
ahí sigue. En cuanto tengas lo mínimo para ser útil, DALE VALOR — pasa a su foco
(get_focus) enmarcado en la meta que acabas de fijar. La entrevista abre la
relación; no la agota.`;
