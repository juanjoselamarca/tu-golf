'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getSubscription, SubscriptionReadError, type Subscription } from '@/lib/data/billing/subscription'
import { accedeSinPlan, canAccess, isPaywallEnabled, type AccessContext } from '@/golf/billing/entitlements'
import { hasMasterOverride } from '@/golf/billing/master-code'
import { captureError } from '@/lib/error-tracking'
import type { Feature, Tier } from '@/golf/billing/plans'

export interface EntitlementResult {
  allowed: boolean
  loading: boolean
  tier: Tier | null
  /** ¿Hay sesión? `undefined` mientras carga. Decide si el upsell ofrece "Entrar". */
  signedIn?: boolean
  /**
   * `true` = no se pudo leer el plan (sin señal, timeout, RLS). `allowed` queda
   * en `false` con el paywall prendido (fail-closed para contenido premium) y en
   * `true` con el paywall apagado (todo permitido), pero NO es
   * un veredicto: el gate del modo neto (`useAccesoNeto`) no bloquea con esto y
   * deja decidir al servidor.
   */
  planDesconocido?: boolean
}

const FREE_SIN_SESION: Subscription = {
  tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null, isFoundingMember: false, isAdmin: false,
}

/** Lo que se sabe del plan: cargando (`null`), leído, o no se pudo leer. */
type EstadoPlan = Subscription | 'desconocido' | null

/** Lógica pura del hook (testeable sin React). */
export function resolveEntitlement(
  sub: Subscription | null,
  feature: Feature,
  paywallEnabled: boolean,
): EntitlementResult {
  if (sub === null) return { allowed: false, loading: true, tier: null }
  const ctx: AccessContext = {
    tier: sub.tier,
    status: sub.status,
    isAdmin: sub.isAdmin,
  }
  return {
    allowed: canAccess(ctx, feature, paywallEnabled),
    loading: false,
    tier: sub.tier,
  }
}

/** Hook React: carga la suscripción del usuario actual y resuelve el acceso. */
export function useEntitlement(feature: Feature): EntitlementResult {
  const [estado, setEstado] = useState<EstadoPlan>(null)
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (active) setSignedIn(!!user)
        if (!user) {
          if (active) setEstado(FREE_SIN_SESION)
          return
        }
        const s = await getSubscription(supabase, user.id)
        if (active) setEstado(s)
      } catch (err) {
        // Sin señal: plan desconocido, no "free". Antes esto quedaba en carga
        // eterna (getUser que lanza) o se disfrazaba de free (getSubscription).
        if (!(err instanceof SubscriptionReadError)) {
          void captureError(err, { context: 'billing.use_entitlement', level: 'warning', meta: { feature } })
        }
        if (active) setEstado('desconocido')
      }
    })()
    return () => { active = false }
  }, [feature])

  if (estado === 'desconocido') {
    // Sin plan leído, se permite sólo lo que pasa cualquiera (paywall apagado
    // = todo): con el paywall off, una señal mala no muestra upsell en plena ronda.
    const allowed = accedeSinPlan(feature, isPaywallEnabled())
    return { allowed, loading: false, tier: null, signedIn, planDesconocido: true }
  }
  const sub = estado
  const result = resolveEntitlement(sub, feature, isPaywallEnabled())

  // Master code override: eleva tier a pro pero respeta status
  if (!result.loading && !result.allowed && hasMasterOverride() && sub) {
    const elevatedCtx: AccessContext = {
      tier: 'pro',
      status: sub.status, // respeta canceled/paused
      isAdmin: sub.isAdmin,
    }
    const elevated = canAccess(elevatedCtx, feature, isPaywallEnabled())
    if (elevated) return { ...result, allowed: true, signedIn }
  }

  return { ...result, signedIn }
}
