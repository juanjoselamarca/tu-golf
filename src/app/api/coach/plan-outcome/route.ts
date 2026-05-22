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
import { createClient } from '@/utils/supabase/server'
import { computePlanOutcomeForRound, type RoundSource } from '@/golf/coach/compute-plan-outcome'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as
      | { historical_round_id?: string; ronda_libre_id?: string }
      | null

    if (!body) {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const roundSource: RoundSource | null = body.historical_round_id
      ? { historical_round_id: body.historical_round_id }
      : body.ronda_libre_id
        ? { ronda_libre_id: body.ronda_libre_id }
        : null

    if (!roundSource) {
      return NextResponse.json(
        { error: 'Falta historical_round_id o ronda_libre_id' },
        { status: 400 },
      )
    }

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
