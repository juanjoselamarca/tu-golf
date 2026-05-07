import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const GITHUB_REPO = 'juanjoselamarca/tu-golf'
const GITHUB_WORKFLOW = 'e2e-trigger.yml'
const DEFAULT_BASE_URL = 'https://golfersplus.vercel.app'

// GET /api/admin/e2e/runs — lista las últimas 20 corridas
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'No tienes permisos' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('e2e_runs')
    .select('id, status, triggered_by, github_run_url, branch, commit_sha, base_url, started_at, finished_at, summary, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ runs: data ?? [] })
}

// POST /api/admin/e2e/runs — dispara una nueva corrida
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'No tienes permisos' }, { status: 403 })
  }

  const pat = process.env.GITHUB_PAT
  if (!pat) {
    return NextResponse.json({
      error: 'GITHUB_PAT no configurado. Generá un token con scope `workflow` y agregalo a las env vars de Vercel.',
    }, { status: 503 })
  }

  let body: { base_url?: string; branch?: string } = {}
  try {
    body = await req.json()
  } catch {
    // body vacío es OK; usamos defaults
  }
  const baseUrl = body.base_url ?? DEFAULT_BASE_URL
  const branch = body.branch ?? 'main'

  // 1. Crear fila queued (con cliente del usuario para auditoría triggered_by).
  const { data: run, error: insertError } = await supabase
    .from('e2e_runs')
    .insert({
      status: 'queued',
      triggered_by: user!.id,
      branch,
      base_url: baseUrl,
    })
    .select('id')
    .single()

  if (insertError || !run) {
    return NextResponse.json({
      error: insertError?.message ?? 'No se pudo crear la corrida',
    }, { status: 500 })
  }

  // 2. Disparar workflow_dispatch en GitHub.
  const dispatchUrl = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`
  const ghRes = await fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: branch,
      inputs: {
        run_id: run.id,
        base_url: baseUrl,
      },
    }),
  })

  if (!ghRes.ok) {
    const ghError = await ghRes.text()
    // Marcar la corrida como error y devolver mensaje accionable.
    const admin = createAdminClient()
    await admin.from('e2e_runs').update({
      status: 'error',
      finished_at: new Date().toISOString(),
      error_message: `GitHub API ${ghRes.status}: ${ghError.slice(0, 500)}`,
    }).eq('id', run.id)

    return NextResponse.json({
      error: 'GitHub no aceptó el dispatch. ¿El workflow existe? ¿El PAT tiene scope `workflow`?',
      details: ghError.slice(0, 500),
      run_id: run.id,
    }, { status: 502 })
  }

  return NextResponse.json({ run_id: run.id, status: 'queued' })
}
