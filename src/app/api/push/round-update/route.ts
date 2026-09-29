/**
 * POST /api/push/round-update — empuja el estado de una ronda libre a quienes
 * la siguen (app cerrada / en segundo plano).
 *
 * Body: { codigo }. El servidor lee la ronda de la BD y arma la notificación
 * con la fuente única (src/lib/push/round-update.ts). Antes el cliente mandaba
 * los puntajes: llegaba un snapshot viejo con maxHole=0 y Zod lo rechazaba con
 * 400 → ningún push, nunca (inbox f6cca8e3). Además cualquier logueado podía
 * inventar puntajes para los seguidores de cualquier ronda.
 *
 * Sólo lo dispara quien anota en la ronda: creador, admin de grupo o jugador
 * con cuenta (403 si no). Rate limit por usuario y por ronda. El limitador es
 * en memoria POR INSTANCIA de Vercel (src/lib/rate-limit.ts): acota el abuso
 * por instancia, no globalmente; el tope real de fan-out lo pone
 * MAX_WATCHERS_PER_ROUND y el `topic` colapsa pendientes en el servicio de push.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { RondaCodigoSchema } from '@/lib/push/schemas'
import { loadRoundForPush, isRoundParticipant } from '@/lib/push/round-snapshot'
import { pushRoundUpdate } from '@/lib/push/round-update'

export const dynamic = 'force-dynamic'

const RoundUpdateSchema = z.object({ codigo: RondaCodigoSchema })

export async function POST(request: NextRequest) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const rlUser = checkRateLimit(`push-round:${user.id}`, 30, 60_000)
  if (!rlUser.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: rateLimitHeaders(rlUser) })
  }

  const parsed = RoundUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const { codigo } = parsed.data

  const rlRonda = checkRateLimit(`push-round-codigo:${codigo}`, 12, 60_000)
  if (!rlRonda.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: rateLimitHeaders(rlRonda) })
  }

  try {
    const admin = createAdminClient()
    const snapshot = await loadRoundForPush(admin, codigo)
    if (!snapshot) {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }
    if (!isRoundParticipant(snapshot, user.id)) {
      return NextResponse.json({ error: 'No participas en esta ronda' }, { status: 403 })
    }

    const result = await pushRoundUpdate(admin, codigo, undefined, snapshot)
    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }
    return NextResponse.json({ sent: result.sent, failed: result.failed, cleaned: result.cleaned, finished: result.finished })
  } catch (err) {
    void captureError(err, { context: 'push.round-update', userId: user.id, meta: { codigo } })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
