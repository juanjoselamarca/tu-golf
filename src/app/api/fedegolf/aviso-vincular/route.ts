import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { captureError } from '@/lib/error-tracking'
import { fetchDebeMostrarAvisoVincular, marcarAvisoVincularVisto } from '@/lib/data/fedegolf-aviso-vincular'

export const dynamic = 'force-dynamic'

/**
 * Aviso «Vincula tu FedeGolf» al abrir la app (AvisoVincularFedegolf).
 * GET  → { mostrar }: ante cualquier error, `false` (fail-closed: nunca rompe la pantalla).
 * POST → marca el aviso como visto para siempre (se llama al mostrarlo).
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ mostrar: false })
    return NextResponse.json({ mostrar: await fetchDebeMostrarAvisoVincular(supabase, user) })
  } catch (err) {
    void captureError(err, { context: 'api.fedegolf.aviso-vincular.GET', level: 'warning' })
    return NextResponse.json({ mostrar: false })
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
    const ok = await marcarAvisoVincularVisto(supabase)
    return NextResponse.json({ ok }, { status: ok ? 200 : 500 })
  } catch (err) {
    void captureError(err, { context: 'api.fedegolf.aviso-vincular.POST', level: 'warning' })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
