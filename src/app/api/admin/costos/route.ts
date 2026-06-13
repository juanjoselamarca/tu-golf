/**
 * Dashboard de costo de IA — datos para /admin/costos.
 *
 * Responde la pregunta de rentabilidad: costo de IA por usuario activo/mes,
 * costo por conversación del coach, margen vs precio del plan, desglose por
 * surface/modelo/día y top-spenders. Lee `ai_usage` con service-role (agregado;
 * el user_id NUNCA se expone crudo salvo en el top de costo, solo para admins).
 *
 * Spec: docs/superpowers/specs/2026-06-11-medicion-costo-ia-design.md §5
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isAdmin } from '@/lib/admin'
import { getCostSummary } from '@/lib/ai/cost-summary'

export const dynamic = 'force-dynamic'

/** Precio mensual de referencia del plan pago para el cálculo de margen. */
const DEFAULT_PLAN_PRICE_USD = Number(process.env.AI_PLAN_PRICE_USD) || 5

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const days = clamp(Number(searchParams.get('days')) || 30, 1, 365)
  const planRaw = Number(searchParams.get('plan'))
  const planPriceUsd = Number.isFinite(planRaw) && planRaw >= 0 ? planRaw : DEFAULT_PLAN_PRICE_USD

  try {
    const summary = await getCostSummary(days, planPriceUsd)
    return NextResponse.json(summary)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error consultando costos' },
      { status: 500 },
    )
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
