import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { TAIGER_SYSTEM_PROMPT, buildContextString } from '@/golf/coach/prompts'
export const dynamic = 'force-dynamic'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Servicio no configurado' }, { status: 503 })
    }

    const body = await req.json()
    const { ronda_libre_id } = body as { ronda_libre_id: string }

    if (!ronda_libre_id) {
      return NextResponse.json({ error: 'ronda_libre_id requerido' }, { status: 400 })
    }

    // Prevent duplicate sessions for same ronda_libre_id
    const { data: existing } = await supabase
      .from('taiger_sessions')
      .select('id, coach_response')
      .eq('user_id', user.id)
      .eq('ronda_libre_id', ronda_libre_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        session_id: existing.id,
        analysis: existing.coach_response,
        cached: true,
      })
    }

    // Freemium limit: 3 sessions/month (exclude onboarding)
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('taiger_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .neq('session_type', 'onboarding')
      .gte('created_at', startOfMonth.toISOString())

    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: 'Límite mensual alcanzado (3 sesiones). Próximamente plan Premium.' },
        { status: 429 }
      )
    }

    // Recalculate patterns first
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003'
    const cookieHeader = req.headers.get('cookie') || ''

    try {
      await fetch(`${baseUrl}/api/taiger/patterns`, {
        method: 'POST',
        headers: { cookie: cookieHeader },
      })
    } catch (fetchErr) {
      console.error('[tAIger/analyze-round] Error recalculating patterns:', fetchErr)
      // Non-fatal: continue without updated patterns
    }

    // Fetch context
    let ctxRes: Response
    try {
      ctxRes = await fetch(`${baseUrl}/api/taiger/context`, {
        headers: { cookie: cookieHeader },
      })
    } catch (fetchErr) {
      console.error('[tAIger/analyze-round] Error fetching context:', fetchErr)
      return NextResponse.json({ error: 'No se pudo conectar con el servicio de contexto' }, { status: 502 })
    }

    if (!ctxRes.ok) {
      return NextResponse.json({ error: 'No se pudo obtener contexto del jugador' }, { status: 502 })
    }

    const ctx = await ctxRes.json()
    const contextString = buildContextString(ctx)

    // Fetch ronda data — try by codigo first, then by id
    let rondaQuery = await supabase
      .from('rondas_libres')
      .select('id, course_name, fecha, holes')
      .eq('codigo', ronda_libre_id)
      .maybeSingle()

    if (!rondaQuery.data) {
      rondaQuery = await supabase
        .from('rondas_libres')
        .select('id, course_name, fecha, holes')
        .eq('id', ronda_libre_id)
        .maybeSingle()
    }

    let rondaDetail = ''
    const rondaId = rondaQuery.data?.id

    if (rondaQuery.data) {
      const ronda = rondaQuery.data
      rondaDetail += `\nRONDA ANALIZADA: ${ronda.course_name ?? 'cancha desconocida'} el ${ronda.fecha ?? 'fecha desconocida'}`

      if (rondaId) {
        const { data: jugador } = await supabase
          .from('ronda_libre_jugadores')
          .select('nombre, scores')
          .eq('ronda_id', rondaId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (jugador) {
          const scores = jugador.scores as (number | null)[] | null
          if (Array.isArray(scores)) {
            const front9 = scores.slice(0, 9).filter((s): s is number => s != null)
            const back9 = scores.slice(9, 18).filter((s): s is number => s != null)
            const front9Total = front9.reduce((a, b) => a + b, 0)
            const back9Total = back9.reduce((a, b) => a + b, 0)
            const total = front9Total + back9Total

            rondaDetail += `\nJugador: ${jugador.nombre}`
            rondaDetail += `\nScores hoyo a hoyo: ${scores.map((s, i) => `H${i + 1}:${s ?? '-'}`).join(' ')}`
            rondaDetail += `\nFront 9: ${front9Total} | Back 9: ${back9Total} | Total: ${total}`
          }
        }
      }
    }

    // Call Claude (non-streaming)
    const anthropic = new Anthropic({ apiKey })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `${TAIGER_SYSTEM_PROMPT}\n\nDATOS DEL JUGADOR:\n${contextString}${rondaDetail}`,
      messages: [
        {
          role: 'user',
          content: 'Analiza mi última ronda. Dame tu evaluación como coach mental.',
        },
      ],
    })

    const analysis = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')

    // Save session
    const { data: session } = await supabase
      .from('taiger_sessions')
      .insert({
        user_id: user.id,
        session_type: 'post_round',
        ronda_libre_id,
        user_message: 'Análisis post-ronda automático',
        coach_response: analysis,
        techniques_assigned: [],
        next_focus: null,
      })
      .select('id')
      .single()

    return NextResponse.json({
      session_id: session?.id ?? null,
      analysis,
    })
  } catch (err) {
    console.error('[tAIger/analyze-round] Error interno:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
