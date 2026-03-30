import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

// ─── Fix Definitions ────────────────────────────────────────────────────────

const FIXES: Record<
  string,
  {
    label: string
    run: (admin: SupabaseClient) => Promise<{ fixed: number; detail: string }>
  }
> = {
  'orphaned-jugadores': {
    label: 'Limpiar jugadores huerfanos',
    run: async (admin) => {
      const { data } = await admin.rpc('exec_sql', {
        query:
          "DELETE FROM ronda_libre_jugadores WHERE ronda_id NOT IN (SELECT id FROM rondas_libres) RETURNING id",
      })
      const count = Array.isArray(data) ? data.length : 0
      return { fixed: count, detail: `${count} jugadores huerfanos eliminados` }
    },
  },
  'orphaned-rounds': {
    label: 'Limpiar rounds huerfanos',
    run: async (admin) => {
      await admin.rpc('exec_sql', {
        query:
          "DELETE FROM hole_scores WHERE round_id IN (SELECT r.id FROM rounds r LEFT JOIN tournaments t ON t.id = r.tournament_id WHERE t.id IS NULL)",
      })
      const { data } = await admin.rpc('exec_sql', {
        query:
          "DELETE FROM rounds WHERE tournament_id NOT IN (SELECT id FROM tournaments) RETURNING id",
      })
      const count = Array.isArray(data) ? data.length : 0
      return {
        fixed: count,
        detail: `${count} rounds huerfanos eliminados (con sus scores)`,
      }
    },
  },
  'orphaned-scores': {
    label: 'Limpiar scores huerfanos',
    run: async (admin) => {
      const { data } = await admin.rpc('exec_sql', {
        query:
          "DELETE FROM hole_scores WHERE round_id NOT IN (SELECT id FROM rounds) RETURNING id",
      })
      const count = Array.isArray(data) ? data.length : 0
      return { fixed: count, detail: `${count} scores huerfanos eliminados` }
    },
  },
  'abandoned-rondas': {
    label: 'Cerrar rondas abandonadas',
    run: async (admin) => {
      const { data } = await admin.rpc('exec_sql', {
        query:
          "UPDATE rondas_libres SET estado='finalizada' WHERE estado='en_curso' AND created_at < NOW() - INTERVAL '48 hours' RETURNING id",
      })
      const count = Array.isArray(data) ? data.length : 0
      return { fixed: count, detail: `${count} rondas cerradas` }
    },
  },
  'duplicate-push': {
    label: 'Limpiar push duplicados',
    run: async (admin) => {
      const { data } = await admin.rpc('exec_sql', {
        query:
          "DELETE FROM push_subscriptions WHERE id NOT IN (SELECT DISTINCT ON (endpoint) id FROM push_subscriptions ORDER BY endpoint, updated_at DESC) RETURNING id",
      })
      const count = Array.isArray(data) ? data.length : 0
      return {
        fixed: count,
        detail: `${count} suscripciones duplicadas eliminadas`,
      }
    },
  },
  'invalid-ronda-estados': {
    label: 'Corregir estados de rondas invalidos',
    run: async (admin) => {
      const { data } = await admin.rpc('exec_sql', {
        query:
          "UPDATE rondas_libres SET estado='finalizada' WHERE estado NOT IN ('en_curso','finalizada') RETURNING id",
      })
      const count = Array.isArray(data) ? data.length : 0
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
      metadata: {
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
