/**
 * POST /api/coach/plan-outcome
 *
 * Wire entre useFinalizeRonda (cliente) y computePlanOutcomeForRound
 * (server, usa SERVICE_ROLE para insertar en plan_outcomes).
 *
 * Razón: sin este endpoint, plan_outcomes queda en 0 filas porque
 * computePlanOutcomeForRound nunca se ejecuta — y el coach v2 no aprende.
 *
 * Body: { historical_round_id?: string; ronda_libre_id?: string }
 * Solo uno de los dos; el endpoint elige automáticamente.
 *
 * Non-blocking desde el cliente: useFinalizeRonda lo dispara con
 * fetch().catch(() => {}) sin esperar la respuesta, igual que patterns.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { computePlanOutcomeForRound, type RoundSource } from '@/golf/coach/compute-plan-outcome'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  historical_round_id: z.string().uuid().optional(),
  ronda_libre_id: z.string().uuid().optional(),
}).refine(
  (d) => d.historical_round_id || d.ronda_libre_id,
  { message: 'Falta historical_round_id o ronda_libre_id' },
)

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })
    }

    // Rate limit: 10 per minute
    const rl = checkRateLimit(`coach-plan:${user.id}`, 10, 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    const rawBody = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
        { status: 400 },
      )
    }
    const body = parsed.data

    const roundSource: RoundSource = body.historical_round_id
      ? { historical_round_id: body.historical_round_id }
      : { ronda_libre_id: body.ronda_libre_id! }

    const result = await computePlanOutcomeForRound({
      supabase,
      userId: user.id,
      roundSource,
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 })
  }
}
