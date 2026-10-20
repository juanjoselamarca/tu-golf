/**
 * Gate de plan de la inscripción de invitados a un torneo (server-only: lee la suscripción
 * del organizador). Archivo aparte de `joinFlow.ts` porque la página de inscripción importa
 * ese módulo en el cliente.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { checkFeatureAccess } from '@/golf/billing/require-feature'
import { captureError } from '@/lib/error-tracking'

/** Feature de billing que habilita inscribir invitados en un torneo (la exige `guest-join`). */
export const FEATURE_INVITADOS = 'guest-tournament' as const

/**
 * ¿El plan del organizador cierra la inscripción de invitados? Mismo gate que `guest-join`,
 * consultado ANTES para que el visitante no llene un formulario que siempre termina en 403.
 * Si el plan no se pudo leer devuelve `false`: se muestra el formulario y `guest-join`
 * responde 503 con su mensaje de reintento (un Pro con un hipo de Supabase no pierde invitados).
 * Un error inesperado tampoco tumba la ficha del torneo: se reporta y se muestra el formulario.
 */
export async function invitadosCerradosPorPlan(admin: SupabaseClient, organizerId: string): Promise<boolean> {
  try {
    const access = await checkFeatureAccess(admin, organizerId, FEATURE_INVITADOS)
    return !access.allowed && !access.planNoVerificado
  } catch (err) {
    void captureError(err, { context: 'torneo.join-info.invitados-por-plan', level: 'warning', meta: { organizerId } })
    return false
  }
}
