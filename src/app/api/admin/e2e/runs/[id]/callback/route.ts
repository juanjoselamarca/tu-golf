import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// POST /api/admin/e2e/runs/[id]/callback — endpoint que llama el workflow
// de GitHub Actions cuando arranca, progresa o termina la corrida.
// Auth: header `x-e2e-callback-secret` debe matchear E2E_CALLBACK_SECRET.
// No usa cookie de usuario porque GH Actions no las tiene.

// Caps defensivos en el payload: previene workflow comprometido (CI poisoning)
// o edge case (Playwright explota con 10K timeouts) que infle la tabla
// e2e_runs sin control. `results` se trunca a 500 tests, cada error a 2000
// chars, cada nombre/file a 500.
const callbackSchema = z.object({
  status: z.enum(['running', 'passed', 'failed', 'error']),
  github_run_id: z.number().int().optional(),
  github_run_url: z.string().url().max(500).optional(),
  commit_sha: z.string().max(64).optional(),
  summary: z.object({
    total: z.number().int().min(0).max(100000),
    passed: z.number().int().min(0).max(100000),
    failed: z.number().int().min(0).max(100000),
    skipped: z.number().int().min(0).max(100000),
  }).optional(),
  results: z.array(z.object({
    name: z.string().max(500),
    status: z.enum(['passed', 'failed', 'skipped', 'timedOut', 'interrupted']),
    duration_ms: z.number().optional(),
    error: z.string().max(2000).optional(),
    file: z.string().max(500).optional(),
  })).max(500).optional(),
  error_message: z.string().max(5000).optional(),
})

// Comparación de secrets en tiempo constante. `===` short-circuit en el
// primer byte distinto, permitiendo timing attacks para inferir el secret
// byte por byte. timingSafeEqual escanea ambos buffers completos siempre.
function secretsMatch(provided: string | null, expected: string): boolean {
  if (provided === null) return false
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Auth via shared secret. Sin esto, cualquiera podría escribir resultados.
  const secret = process.env.E2E_CALLBACK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'E2E_CALLBACK_SECRET no configurado' }, { status: 503 })
  }
  if (!secretsMatch(req.headers.get('x-e2e-callback-secret'), secret)) {
    return NextResponse.json({ error: 'Auth inválido' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  const parsed = callbackSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({
      error: 'Payload inválido',
      details: parsed.error.issues[0]?.message,
    }, { status: 400 })
  }
  const data = parsed.data

  const isTerminal = data.status !== 'running'
  const update: Record<string, unknown> = {
    status: data.status,
  }
  if (data.github_run_id !== undefined) update.github_run_id = data.github_run_id
  if (data.github_run_url !== undefined) update.github_run_url = data.github_run_url
  if (data.commit_sha !== undefined) update.commit_sha = data.commit_sha
  if (data.summary !== undefined) update.summary = data.summary
  if (data.results !== undefined) update.results = data.results
  if (data.error_message !== undefined) update.error_message = data.error_message
  if (isTerminal) update.finished_at = new Date().toISOString()

  const admin = createAdminClient()
  const { error } = await admin
    .from('e2e_runs')
    .update(update)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
