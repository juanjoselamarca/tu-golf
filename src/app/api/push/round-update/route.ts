/**
 * POST /api/push/round-update — empuja el estado de una ronda libre a quienes
 * la siguen (app cerrada / en segundo plano).
 *
 * Body: { codigo, jugadorId? }. El servidor lee la ronda de la BD y arma la
 * notificación con la fuente única (src/lib/push/round-update.ts). Antes el
 * cliente mandaba los puntajes: llegaba un snapshot viejo con maxHole=0 y Zod lo
 * rechazaba con 400 → ningún push, nunca (inbox f6cca8e3).
 *
 * Quién puede dispararlo (quien anota en la ronda):
 *  - con sesión: creador, admin de grupo o jugador con cuenta → si no, 403.
 *  - sin sesión (invitado; en prod 94/139 jugadores recientes no tienen cuenta):
 *    `jugadorId` de su fila en ronda_libre_jugadores — la misma prueba que usa
 *    la RPC de guardado. Sin sesión ni jugadorId → 401.
 *
 * Rate limit por usuario/IP y por ronda. Una ronda FINALIZADA no pasa por el
 * límite por ronda: el "Resultado final" no se puede perder detrás de los
 * guardados del último hoyo. El limitador es en memoria POR INSTANCIA de Vercel
 * (src/lib/rate-limit.ts); el tope real de fan-out lo pone
 * MAX_WATCHERS_PER_ROUND y el `topic` colapsa pendientes en el servicio de push.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, clientIpFrom, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { RondaCodigoSchema } from '@/lib/push/schemas'
import { loadRoundForPush, isRoundParticipant, isRoundPlayer } from '@/lib/push/round-snapshot'
import { pushRoundUpdate } from '@/lib/push/round-update'

export const dynamic = 'force-dynamic'

const RoundUpdateSchema = z.object({
  codigo: RondaCodigoSchema,
  jugadorId: z.string().uuid().optional(),
})

function tooMany(rl: ReturnType<typeof checkRateLimit>) {
  return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: rateLimitHeaders(rl) })
}

export async function POST(request: NextRequest) {
  let userId: string | null = null
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    userId = user?.id ?? null
  } catch { /* sin sesión */ }

  const rlCaller = checkRateLimit(`push-round:${userId ?? `ip:${clientIpFrom(request)}`}`, 30, 60_000)
  if (!rlCaller.allowed) return tooMany(rlCaller)

  const parsed = RoundUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const { codigo, jugadorId } = parsed.data

  if (!userId && !jugadorId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // Límite por ronda ANTES de cargar el snapshot completo (par por hoyo,
    // equipos): sólo una lectura de una columna. Una ronda finalizada no pasa por
    // el límite — el "Resultado final" no se puede perder.
    const { data: estadoRow } = await admin
      .from('rondas_libres')
      .select('estado')
      .eq('codigo', codigo)
      .maybeSingle()
    if (!estadoRow) {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }
    if (estadoRow.estado !== 'finalizada') {
      const rlRonda = checkRateLimit(`push-round-codigo:${codigo}`, 12, 60_000)
      if (!rlRonda.allowed) return tooMany(rlRonda)
    }

    const snapshot = await loadRoundForPush(admin, codigo)
    if (!snapshot) {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }

    const allowed = (userId != null && isRoundParticipant(snapshot, userId))
      || (jugadorId != null && isRoundPlayer(snapshot, jugadorId))
    if (!allowed) {
      return NextResponse.json({ error: 'No participas en esta ronda' }, { status: 403 })
    }

    const result = await pushRoundUpdate(admin, codigo, undefined, snapshot)
    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }
    return NextResponse.json({ sent: result.sent, failed: result.failed, cleaned: result.cleaned, finished: result.finished })
  } catch (err) {
    void captureError(err, { context: 'push.round-update', userId, meta: { codigo } })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
