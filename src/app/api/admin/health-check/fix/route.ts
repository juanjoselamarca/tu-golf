import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { captureError } from '@/lib/error-tracking'
import { pushRoundUpdate } from '@/lib/push/round-update'
import type { SupabaseClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

// ─── Fix Definitions ────────────────────────────────────────────────────────

/** Cerrar una ronda es su "Resultado final" para quienes la siguen (y limpia sus watchers). */
async function avisarRondasCerradas(admin: SupabaseClient, rows: unknown): Promise<void> {
  const codigos = Array.isArray(rows)
    ? rows.map(r => (r as { codigo?: string }).codigo).filter((c): c is string => typeof c === 'string')
    : []
  await Promise.allSettled(codigos.map(codigo =>
    pushRoundUpdate(admin, codigo).catch(err =>
      captureError(err, { context: 'push.round-update.health-fix', meta: { codigo } }))))
}

const FIXES: Record<
  string,
  {
    label: string
    run: (admin: SupabaseClient) => Promise<{ fixed: number; detail: string }>
  }
> = {
  'abandoned-rondas': {
    label: 'Cerrar rondas abandonadas',
    run: async (admin) => {
      // Query builder: exec_sql es solo lectura, y sin los códigos de las rondas
      // no sale el "Resultado final" a los seguidores (review C-2).
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const { data } = await admin
        .from('rondas_libres')
        .update({ estado: 'finalizada' })
        .eq('estado', 'en_curso')
        .lt('created_at', cutoff)
        .select('id, codigo')
      const count = Array.isArray(data) ? data.length : 0
      await avisarRondasCerradas(admin, data)
      return { fixed: count, detail: `${count} rondas cerradas` }
    },
  },
  'invalid-ronda-estados': {
    label: 'Corregir estados de rondas inválidos',
    run: async (admin) => {
      const { data } = await admin
        .from('rondas_libres')
        .update({ estado: 'finalizada' })
        .not('estado', 'in', '("en_curso","finalizada")')
        .select('id, codigo')
      const count = Array.isArray(data) ? data.length : 0
      await avisarRondasCerradas(admin, data)
      return {
        fixed: count,
        detail: `${count} rondas corregidas a 'finalizada'`,
      }
    },
  },
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
  const { fixId } = body as { fixId?: string }

  if (!fixId || !FIXES[fixId]) {
    return NextResponse.json(
      {
        error: 'Fix no encontrado',
        available: Object.keys(FIXES),
      },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  try {
    const result = await FIXES[fixId].run(admin)

    // Log to analytics_events
    await admin.from('analytics_events').insert({
      event_type: 'admin_action',
      event_data: {
        action: 'auto_fix',
        fixId,
        label: FIXES[fixId].label,
        result,
        executed_by: user?.id,
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      fixId,
      result,
    })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        fixId,
        error: err instanceof Error ? err.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
