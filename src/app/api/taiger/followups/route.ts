/**
 * Follow-up chips del coach tAIger+ (D1 / enmienda E1). Endpoint AISLADO: el
 * cliente lo llama DESPUÉS de que el stream del chat cerró, pasando el último
 * intercambio (Q+A). Devuelve 2-3 preguntas de seguimiento como JSON.
 *
 * Por qué aislado y no inyectado en el stream: imposible romper la respuesta
 * principal (está fuera del path SSE), JSON fiable sin parsear texto del stream,
 * y las chips aparecen un instante después (patrón Perplexity).
 *
 * NUNCA es un error visible para el usuario: cualquier fallo (rate-limit, input
 * inválido, LLM caído, JSON malformado) → { followups: [] } y no se muestran chips.
 *
 * Handler DELGADO: la lógica (prompt + parseo) vive en src/golf/coach/followups.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { callLLM } from '@/lib/ai/gateway'
import { captureError } from '@/lib/error-tracking'
import { buildFollowupsRequest, parseFollowups } from '@/golf/coach/followups'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EMPTY = { followups: [] as string[] }

const inputSchema = z.object({
  question: z.string().min(1).max(2000),
  answer: z.string().min(1).max(8000),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })

    // Rate-limit propio: 40/h por usuario (≈ una llamada por respuesta del coach,
    // con holgura sobre los 30/h del chat). Al límite → sin chips, sin error.
    const rl = checkRateLimit(`followups:${user.id}`, 40, 60 * 60 * 1000)
    if (!rl.allowed) return NextResponse.json(EMPTY)

    const parsed = inputSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json(EMPTY)

    const { system, messages } = buildFollowupsRequest(parsed.data.question, parsed.data.answer)
    const llm = await callLLM({
      role: 'evaluator',          // Haiku-first + Gemini-lite fallback: barato, JSON, con red
      surface: 'coach_followups', // atribución de costo en /admin/costos (gate E1)
      userId: user.id,
      system,
      messages,
      responseJson: true,
      maxTokens: 160,             // 2-3 preguntas cortas → presupuesto <500 tokens/turno
      temperature: 0.4,
    })

    return NextResponse.json({ followups: parseFollowups(llm.text) })
  } catch (err) {
    void captureError(err, { context: 'taiger.followups' })
    return NextResponse.json(EMPTY)
  }
}
