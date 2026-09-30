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
 * Rate limit por usuario/IP y por ronda. El de la ronda se cobra DESPUÉS de
 * comprobar que quien pide participa en ella (lectura barata: estado +
 * participantes): un tercero con el código no puede agotar el presupuesto de
 * push del que anota (review #449 M2). Una ronda FINALIZADA no pasa por el
 * límite por ronda: el "Resultado final" no se puede perder detrás de los
 * guardados del último hoyo. El limitador es en memoria POR INSTANCIA de Vercel
 * (src/lib/rate-limit.ts); el tope real de fan-out lo pone
 * MAX_WATCHERS_PER_ROUND y el `topic` colapsa pendientes en el servicio de push.
 *
 * Respuesta 502 si el resultado final no llegó a alguien por un fallo
 * transitorio: el cliente reintenta (force) y los watchers pendientes lo
 * reciben. Con 200 el reintento no se disparaba nunca (review #449 M1).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, clientIpFrom, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { RondaCodigoSchema } from '@/lib/push/schemas'
import { loadRoundAccess, loadRoundForPush, isRoundParticipant, isRoundPlayer } from '@/lib/push/round-snapshot'
import { needsRetry, pushRoundUpdate } from '@/lib/push/round-update'

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

    // 1. Lectura barata (estado + participantes) → ¿puede empujar esta ronda?
    const access = await loadRoundAccess(admin, codigo)
    if (!access) {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }
    const allowed = (userId != null && isRoundParticipant(access, userId))
      || (jugadorId != null && isRoundPlayer(access, jugadorId))
    if (!allowed) {
      return NextResponse.json({ error: 'No participas en esta ronda' }, { status: 403 })
    }

    // 2. Límite por ronda, sólo a quien participa. Una ronda finalizada no pasa
    // por el límite — el "Resultado final" no se puede perder.
    if (access.estado !== 'finalizada') {
      const rlRonda = checkRateLimit(`push-round-codigo:${codigo}`, 12, 60_000)
      if (!rlRonda.allowed) return tooMany(rlRonda)
    }

    // 3. Snapshot completo (par por hoyo, equipos) y envío.
    const snapshot = await loadRoundForPush(admin, codigo)
    if (!snapshot) {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }

    const result = await pushRoundUpdate(admin, codigo, undefined, snapshot)
    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }
    const body = { sent: result.sent, failed: result.failed, transientFailed: result.transientFailed, cleaned: result.cleaned, finished: result.finished }
    if (needsRetry(result)) {
      return NextResponse.json({ ...body, error: 'El resultado final no llegó a todos los seguidores' }, { status: 502 })
    }
    return NextResponse.json(body)
  } catch (err) {
    void captureError(err, { context: 'push.round-update', userId, meta: { codigo } })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
