import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { session_id, rating, comment } = body as {
      session_id?: string
      rating?: number
      comment?: string
    }

    if (!session_id || !rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'session_id y rating (1-5) requeridos' }, { status: 400 })
    }

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
      console.error('[tAIger/feedback] Insert error:', insertError)
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
