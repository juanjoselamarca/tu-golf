import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CheckItem {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  category: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function statusIcon(status: string): string {
  switch (status) {
    case 'fail':
      return '🔴'
    case 'warn':
      return '🟡'
    default:
      return '🟢'
  }
}

function buildReport(checks: CheckItem[], timestamp: string): string {
  const lines: string[] = [
    '# ISSUE URGENTE — Health Check Failed',
    `**Fecha:** ${timestamp}`,
    '**Reportado por:** Admin desde Health Check Suite',
    '',
    '## Problemas detectados:',
  ]

  for (const check of checks) {
    lines.push('')
    lines.push(
      `### ${statusIcon(check.status)} ${check.name} (${check.category})`
    )
    lines.push(`**Estado:** ${check.status}`)
    lines.push(`**Detalle:** ${check.message}`)
  }

  lines.push('')
  lines.push('## Acción requerida:')
  lines.push(
    'Estos problemas no se pudieron resolver automáticamente.'
  )
  lines.push('Revisar y arreglar cada uno antes de continuar.')
  lines.push('')

  return lines.join('\n')
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })
  }

  const body = await request.json()
  const { checks } = body as { checks?: CheckItem[] }

  if (!checks || !Array.isArray(checks) || checks.length === 0) {
    return NextResponse.json(
      { error: 'No se proporcionaron checks para escalar' },
      { status: 400 }
    )
  }

  const timestamp = new Date().toISOString()
  const report = buildReport(checks, timestamp)

  // Save to analytics_events
  const admin = createAdminClient()
  await admin.from('analytics_events').insert({
    event_type: 'health_escalation',
    metadata: {
      checks,
      report,
      escalated_by: user?.id,
      timestamp,
      fail_count: checks.filter((c) => c.status === 'fail').length,
      warn_count: checks.filter((c) => c.status === 'warn').length,
    },
  })

  return NextResponse.json({
    success: true,
    report,
  })
}
