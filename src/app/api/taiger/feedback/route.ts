import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
export const dynamic = 'force-dynamic'

const feedbackSchema = z.object({
  session_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

    const rl = checkRateLimit(`taiger-feedback:${user.id}`, 10, 60 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    const rawBody = await req.json()
    const parsed = feedbackSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Datos inválidos' }, { status: 400 })
    }
    const { session_id, rating, comment } = parsed.data

    // Verify session belongs to user
    const { data: session } = await supabase
      .from('taiger_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    // Check if already rated
    const { data: existing } = await supabase
      .from('taiger_feedback')
      .select('id')
      .eq('session_id', session_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Ya calificaste esta sesión' }, { status: 409 })
    }

    // Insert feedback
    const { error: insertError } = await supabase.from('taiger_feedback').insert({
      session_id,
      user_id: user.id,
      rating,
      comment: comment || null,
    })

    if (insertError) {
      captureError(insertError, { context: 'taiger/feedback', meta: { op: 'insert' } })
      return NextResponse.json({ error: 'Error al guardar feedback' }, { status: 500 })
    }

    // Update session rating
    await supabase
      .from('taiger_sessions')
      .update({ rating })
      .eq('id', session_id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
