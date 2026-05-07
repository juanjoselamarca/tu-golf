import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// POST /api/admin/e2e/runs/[id]/callback — endpoint que llama el workflow
// de GitHub Actions cuando arranca, progresa o termina la corrida.
// Auth: header `x-e2e-callback-secret` debe matchear E2E_CALLBACK_SECRET.
// No usa cookie de usuario porque GH Actions no las tiene.

const callbackSchema = z.object({
  status: z.enum(['running', 'passed', 'failed', 'error']),
  github_run_id: z.number().int().optional(),
  github_run_url: z.string().url().optional(),
  commit_sha: z.string().optional(),
  summary: z.object({
    total: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
  }).optional(),
  results: z.array(z.object({
    name: z.string(),
    status: z.enum(['passed', 'failed', 'skipped', 'timedOut', 'interrupted']),
    duration_ms: z.number().optional(),
    error: z.string().optional(),
    file: z.string().optional(),
  })).optional(),
  error_message: z.string().optional(),
})

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
  const provided = req.headers.get('x-e2e-callback-secret')
  if (provided !== secret) {
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
