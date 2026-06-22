import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { captureError } from '@/lib/error-tracking'
export const dynamic = 'force-dynamic'

/**
 * Voto 👍/👎 por mensaje del coach (PR2, enmienda E2). NO reusa /api/taiger/feedback
 * (estrellas 1-5 por sesión, semántica distinta consumida por dashboards). Escribe
 * en taiger_message_feedback (-1/+1 por message_index).
 *
 * vote ∈ {-1, 1} → upsert (toggle / cambio de voto). vote === 0 → borra el voto.
 * Verifica que la sesión sea del usuario antes de escribir (mismo patrón que
 * /feedback): RLS cubre user_id, pero la pertenencia de la sesión es app-level.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

    const body = await req.json()
    const { session_id, message_index, vote } = body as {
      session_id?: string
      message_index?: number
      vote?: number
    }

    if (
      !session_id ||
      typeof message_index !== 'number' ||
      !Number.isInteger(message_index) ||
      message_index < 0 ||
      typeof vote !== 'number' ||
      ![-1, 0, 1].includes(vote)
    ) {
      return NextResponse.json(
        { error: 'session_id, message_index (entero ≥0) y vote (-1, 0, 1) requeridos' },
        { status: 400 },
      )
    }

    // La sesión debe pertenecer al usuario (RLS valida user_id, no la sesión).
    const { data: session } = await supabase
      .from('taiger_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    if (vote === 0) {
      // Toggle off: el usuario retira su voto.
      const { error: delError } = await supabase
        .from('taiger_message_feedback')
        .delete()
        .eq('session_id', session_id)
        .eq('message_index', message_index)
        .eq('user_id', user.id)

      if (delError) {
        captureError(delError, { context: 'taiger/message-feedback', meta: { op: 'delete' } })
        return NextResponse.json({ error: 'Error al guardar feedback' }, { status: 500 })
      }
      return NextResponse.json({ success: true, vote: 0 })
    }

    // Upsert sobre la constraint COMPLETA (session_id, message_index): registra o
    // cambia el voto. updated_at se refresca explícitamente (no hay trigger).
    const { error: upsertError } = await supabase
      .from('taiger_message_feedback')
      .upsert(
        {
          session_id,
          user_id: user.id,
          message_index,
          vote,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,message_index' },
      )

    if (upsertError) {
      captureError(upsertError, { context: 'taiger/message-feedback', meta: { op: 'upsert' } })
      return NextResponse.json({ error: 'Error al guardar feedback' }, { status: 500 })
    }

    return NextResponse.json({ success: true, vote })
  } catch (err) {
    captureError(err, { context: 'taiger/message-feedback', meta: { op: 'handler' } })
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
