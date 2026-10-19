/**
 * Verificación server-side de acceso a features de billing.
 *
 * Combina getSubscription (I/O) con canAccess (pura) y devuelve
 * un resultado rico para que el caller pueda construir mensajes de upsell.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSubscription, SubscriptionReadError, type Subscription } from '@/lib/data/billing/subscription'
import { captureError } from '@/lib/error-tracking'
import { accedeSinPlan, canAccess, isPaywallEnabled, type AccessContext } from './entitlements'
import { FEATURE_MIN_TIER, type Feature, type NetoFeature } from './plans'
import { featureDelModo, MENSAJE_FUNCION_PRO, MENSAJE_NETO_PRO, MENSAJE_PLAN_NO_VERIFICADO } from './modo-por-plan'

export interface FeatureAccessResult {
  allowed: boolean
  tier: string
  requiredTier: string
  /**
   * `true` = no se pudo leer el plan (red, timeout, RLS) y `allowed` es el
   * fail-closed, no un veredicto. Los gates de contenido premium lo ignoran
   * (cerrado ante la duda, igual que antes); `checkModoAccess` responde 503.
   */
  planNoVerificado?: boolean
}

export async function checkFeatureAccess(
  supabase: SupabaseClient,
  userId: string,
  feature: Feature,
): Promise<FeatureAccessResult> {
  // Si hasta un usuario sin plan pasa (paywall apagado = todo permitido, regla
  // de `canAccess`), no se lee la suscripción: con el paywall off, un hipo de
  // Supabase no puede cerrar nada ni devolver 503. `tier` queda en 'free'
  // porque no se leyó (ningún caller lo usa cuando `allowed` es true).
  const paywallEnabled = isPaywallEnabled()
  if (accedeSinPlan(feature, paywallEnabled)) {
    return { allowed: true, tier: 'free', requiredTier: FEATURE_MIN_TIER[feature] }
  }
  let sub: Subscription
  try {
    sub = await getSubscription(supabase, userId)
  } catch (err) {
    if (!(err instanceof SubscriptionReadError)) throw err
    void captureError(err, { context: 'billing.plan_no_verificado', level: 'warning', userId, meta: { feature } })
    return { allowed: false, tier: 'free', requiredTier: FEATURE_MIN_TIER[feature], planNoVerificado: true }
  }
  const ctx: AccessContext = {
    tier: sub.tier,
    status: sub.status,
    isAdmin: sub.isAdmin,
  }
  return {
    allowed: canAccess(ctx, feature, paywallEnabled),
    tier: sub.tier,
    requiredTier: FEATURE_MIN_TIER[feature],
  }
}

/** Rechazo por plan: cuerpo del 403 (el usuario es free de verdad). */
export interface ProRequerido<F extends Feature = Feature> {
  error: 'pro_required'
  feature: F
  requiredTier: string
  /** Texto para el usuario: la UI lo muestra tal cual. */
  message: string
}

/** Rechazo del gate de modo: el 403 trae el copy del neto (`MENSAJE_NETO_PRO`). */
export type ModoProRequerido = ProRequerido<NetoFeature>

/** No se pudo leer el plan: cuerpo del 503 (reintentable, no es un "no"). */
export interface PlanNoVerificado {
  error: 'plan_unavailable'
  message: string
}

/** Rechazo de un gate de feature, con el status HTTP que corresponde. */
export type RechazoFeature<F extends Feature = Feature> =
  | { status: 403; body: ProRequerido<F> }
  | { status: 503; body: PlanNoVerificado }

/** Rechazo del gate de modo, con el status HTTP que corresponde. */
export type RechazoModo =
  | { status: 403; body: ModoProRequerido }
  | { status: 503; body: PlanNoVerificado }

/**
 * Traduce un `FeatureAccessResult` a la respuesta de una API route: `null` si
 * pasa; 503 `plan_unavailable` si el plan no se pudo leer (un Pro con un hipo
 * de Supabase no recibe un "necesitas Pro"); 403 `pro_required` si es free de
 * verdad. Toda ruta que gatea con `checkFeatureAccess` responde con esto.
 */
export function rechazoDeFeature<F extends Feature>(
  access: FeatureAccessResult,
  feature: F,
  mensajes: { proRequerido?: string; planNoVerificado?: string } = {},
): RechazoFeature<F> | null {
  if (access.allowed) return null
  if (access.planNoVerificado) {
    return {
      status: 503,
      body: { error: 'plan_unavailable', message: mensajes.planNoVerificado ?? MENSAJE_PLAN_NO_VERIFICADO },
    }
  }
  // Siempre con texto humano: sin él la UI mostraba el código `pro_required` o un "Intenta nuevamente".
  const body: ProRequerido<F> = {
    error: 'pro_required', feature, requiredTier: access.requiredTier,
    message: mensajes.proRequerido ?? MENSAJE_FUNCION_PRO,
  }
  return { status: 403, body }
}

/**
 * Gate de servidor del modo de scoring (gross libre; neto de los formatos de
 * `NETO_FEATURE_BY_FORMAT` exige Pro). Lo corre TODO camino que crea una
 * ronda o un torneo. Devuelve `null` si se puede jugar así; si no, el status
 * y el cuerpo a responder: 403 `pro_required` (free de verdad) o 503
 * `plan_unavailable` (no se pudo leer el plan: un Pro sin señal no recibe un
 * "hazte Pro"). Gross no consulta la suscripción.
 */
export async function checkModoAccess(
  supabase: SupabaseClient,
  userId: string,
  formato: string,
  modo: string,
): Promise<RechazoModo | null> {
  const feature = featureDelModo(formato, modo)
  if (!feature) return null
  const access = await checkFeatureAccess(supabase, userId, feature)
  return rechazoDeFeature(access, feature, { proRequerido: MENSAJE_NETO_PRO })
}
