'use client'
import { type ReactNode } from 'react'
import { useEntitlement } from '@/hooks/useEntitlement'
import type { Feature } from '@/golf/billing/plans'

interface ProGateProps {
  feature: Feature
  /**
   * Qué mostrar sin acceso. Como función recibe `signedIn` para que el upsell
   * ofrezca "Entrar" sólo sin sesión (mismo criterio que el gate server-side).
   */
  fallback: ReactNode | ((ctx: { signedIn: boolean }) => ReactNode)
  children: ReactNode
  /**
   * Qué mostrar mientras se resuelve el acceso. Por defecto nada; en usos sobre
   * el pliegue pasar `<UpsellCardSkeleton />` para que la página no salte.
   */
  loadingFallback?: ReactNode
}

/** Envuelve contenido premium: muestra children si el usuario tiene acceso, si no el fallback. */
export function ProGate({ feature, fallback, children, loadingFallback = null }: ProGateProps) {
  const { allowed, loading, signedIn } = useEntitlement(feature)
  if (loading) return <>{loadingFallback}</>
  if (allowed) return <>{children}</>
  return <>{typeof fallback === 'function' ? fallback({ signedIn: signedIn ?? false }) : fallback}</>
}
