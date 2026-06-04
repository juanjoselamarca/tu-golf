import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Búsqueda de jugadores por nombre o email para inscribirlos a un torneo.
 *
 * Vive en el servidor (service role) y exige usuario autenticado: el email de
 * `profiles` ya NO es legible por el cliente público (RLS column-level), así que
 * la búsqueda que necesita email se hace acá tras validar la sesión. Evita exponer
 * el directorio de emails de toda la base a cualquiera con la anon key.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Rate-limit por usuario: es un endpoint de enumeración de PII (devuelve email
  // de terceros para inscribirlos). 30 búsquedas/min frena el scraping del directorio.
  const rl = checkRateLimit(`profiles-search:${user.id}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas búsquedas, esperá un momento.' }, { status: 429 })
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  // Escapar comodines de ilike para que el input del usuario no actúe como patrón.
  const safe = q.replace(/[%_,()\\]/g, '\\$&')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, name, email, indice')
    .or(`name.ilike.%${safe}%,email.ilike.%${safe}%`)
    .limit(10)

  if (error) {
    void captureError(error, { context: 'api.profiles.search', userId: user.id })
    return NextResponse.json({ error: 'Error en la búsqueda' }, { status: 500 })
  }

  return NextResponse.json({ results: data ?? [] })
}
