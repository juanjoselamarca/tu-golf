'use client'
import { type ReactNode } from 'react'
import { useEntitlement } from '@/hooks/useEntitlement'
import type { Feature } from '@/golf/billing/plans'

interface ProGateProps {
  feature: Feature
  fallback: ReactNode
  children: ReactNode
}

/** Envuelve contenido premium: muestra children si el usuario tiene acceso, si no el fallback. */
export function ProGate({ feature, fallback, children }: ProGateProps) {
  const { allowed, loading } = useEntitlement(feature)
  if (loading) return null
  return <>{allowed ? children : fallback}</>
}
