/**
 * Health check de admin: corre las 6 categorías en paralelo contra la base (cliente service role)
 * y arma el resultado que muestra `/admin/sistema` y que lee el CTO antes de cada push de sprint.
 * La ruta `/api/admin/health-check` solo verifica que quien llama sea admin.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resumirChecks, type HealthCheckResult } from './base'
import { checkServices } from './servicios'
import { checkDataIntegrity } from './integridad-datos'
import { checkRouteAndRoleIntegrity } from './rutas-y-roles'
import { checkRLSPolicies } from './rls'
import { checkFlows } from './flujos'
import { checkAntiRegresionP0 } from './anti-regresion-p0'

export type { Check, Category, HealthCheckResult } from './base'

export async function correrHealthCheckAdmin(admin: SupabaseClient): Promise<HealthCheckResult> {
  const start = Date.now()
  // Performance category removida en audit 2026-05-08 (umbral teatro).
  const categories = await Promise.all([
    checkServices(admin),
    checkDataIntegrity(admin),
    checkRouteAndRoleIntegrity(admin),
    checkRLSPolicies(admin),
    checkFlows(admin),
    checkAntiRegresionP0(admin),
  ])
  return {
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - start,
    summary: resumirChecks(categories),
    categories,
  }
}
