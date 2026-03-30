import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()

  const { data: rondas, error } = await admin
    .from('rondas_libres')
    .select('id, codigo, course_name, holes, estado, created_at, tees, modo_juego')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'Error al procesar la solicitud. Intenta de nuevo.' }, { status: 500 })

  const rondaIds = (rondas ?? []).map(r => r.id)

  let jugadorCounts: Record<string, number> = {}
  if (rondaIds.length > 0) {
    const { data: jugadores } = await admin
      .from('ronda_libre_jugadores')
      .select('ronda_id')
      .in('ronda_id', rondaIds)

    for (const j of (jugadores ?? [])) {
      jugadorCounts[j.ronda_id] = (jugadorCounts[j.ronda_id] || 0) + 1
    }
  }

  const list = (rondas ?? []).map(r => ({
    ...r,
    jugadores_count: jugadorCounts[r.id] || 0,
  }))

  return NextResponse.json({ rondas: list })
}
