import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { puedeCrearJuegoPersonalizado } from '@/lib/auth/juego-personalizado'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'

// GET /api/ronda-libre/permiso-timba — si el usuario de la sesión puede crear una Timba libre. La regla es
// `puedeCrearJuegoPersonalizado` (fuente única, la misma de `POST /create`): la UI no la copia, la pregunta.
// Falla CERRADO: sin sesión o con error, `false` (el selector muestra "Próximamente").

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: sesion } = await supabase.auth.getClaims()
    const userId = sesion?.claims?.sub
    const puedeCrear = userId ? await puedeCrearJuegoPersonalizado(userId) : false
    return NextResponse.json({ puedeCrear }, { headers: HEADERS_PRIVADO_NO_STORE })
  } catch (err) {
    captureError(err, { context: 'ronda-libre.permiso-timba', level: 'warning' })
    return NextResponse.json({ puedeCrear: false }, { headers: HEADERS_PRIVADO_NO_STORE })
  }
}
