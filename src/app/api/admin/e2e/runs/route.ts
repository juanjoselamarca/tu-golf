import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { checkRateLimit } from '@/lib/rate-limit'

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

  // Rate limit: 5 disparos por hora por admin. Sin esto, un admin (o cuenta
  // comprometida) puede inundar GitHub Actions consumiendo los 2000 min/mes
  // gratuitos en horas, y dejar la tabla e2e_runs creciendo sin freno.
  const rl = checkRateLimit(`e2e-trigger:${user!.id}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({
      error: `Demasiadas corridas en la última hora (máx 5). Esperá ${Math.ceil((rl.resetAt - Date.now()) / 60000)} min.`,
    }, { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } })
  }

  // Guard contra doble-click / doble-tab: si ya hay una corrida activa,
  // rechazamos. Evita disparar dos workflows simultáneos por error humano.
  const { count: activeCount } = await supabase
    .from('e2e_runs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'running'])
  if ((activeCount ?? 0) > 0) {
    return NextResponse.json({
      error: 'Ya hay una corrida activa. Esperá que termine antes de disparar otra.',
    }, { status: 409 })
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
