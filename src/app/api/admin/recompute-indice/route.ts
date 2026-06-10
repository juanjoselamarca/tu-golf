import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { recomputeRoundsFromCatalog } from '@/lib/data/recompute-tee-rounds'

export const dynamic = 'force-dynamic'

/**
 * Recompute on-demand de los diferenciales de un usuario desde el catálogo
 * (la arquitectura re-ejecutable que reemplaza al "diferencial congelado").
 *
 * - `dryRun` por defecto TRUE: devuelve antes/después sin escribir nada.
 * - Para aplicar: `{ dryRun: false }`. Al aplicar, recomputa también el índice
 *   oficial vía RPC `calcular_indice_golfers` y lo devuelve.
 *
 * Solo admin. La cuenta a recomputar va explícita en `userId` (no se infiere del
 * caller) para que sea una herramienta de operación, no una acción accidental.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })
  }

  let body: { userId?: string; dryRun?: boolean; genero?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido (se espera JSON)' }, { status: 400 })
  }

  const userId = body.userId?.trim()
  if (!userId) {
    return NextResponse.json({ error: 'Falta userId' }, { status: 400 })
  }
  // Default seguro: dryRun salvo que se pida explícitamente aplicar.
  const dryRun = body.dryRun !== false

  const admin = createAdminClient()

  // Género: el del body si viene; si no, el del perfil (el resolver lo necesita
  // para desambiguar tees mismo-color M/F con ratings distintos).
  let genero = body.genero ?? null
  if (genero == null) {
    const { data: prof } = await admin.from('profiles').select('genero').eq('id', userId).single()
    genero = prof?.genero ?? null
  }

  const result = await recomputeRoundsFromCatalog(admin, userId, { dryRun, genero })

  // Al aplicar, el índice oficial lo recalcula el RPC desde la columna diferencial.
  let indiceGolfers: number | null = null
  if (!dryRun) {
    const { error: rpcErr } = await admin.rpc('calcular_indice_golfers', { p_user_id: userId })
    if (rpcErr) {
      return NextResponse.json(
        { error: 'Recompute aplicado pero el RPC del índice falló', detalle: rpcErr.message, result },
        { status: 500 },
      )
    }
    const { data: prof } = await admin.from('profiles').select('indice_golfers').eq('id', userId).single()
    indiceGolfers = prof?.indice_golfers ?? null
  }

  return NextResponse.json({ ok: true, userId, dryRun, genero, indiceGolfers, result })
}
