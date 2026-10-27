import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { cargarJuegoDeLaRonda } from '@/lib/data/ronda-libre-timba'
import { indicesDePerfil } from '@/lib/data/indices-de-perfil'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { CODIGO_RONDA_VALIDO } from '@/lib/api-en-vivo'

// GET /api/ronda-libre/[codigo]/juego — el juego de una Timba libre (formato `personalizado`), calculado en el
// servidor. Requiere sesión, privada y no-store (como `/hcp`).
//
// Qué ve el grupo en una Timba neto (decisión de Juanjo, 27-oct): los puntos y la marca de golpe recibido por
// hoyo de cada jugador. NUNCA el índice ni el hándicap de juego de otro: la respuesta es `VistaDelJuego`, que
// no los trae. El neto se calcula acá con el lector de servicio (`indicesDePerfil`), nunca desde la respuesta
// pública de `/live` (`courseHcpMap: {}`).

export const dynamic = 'force-dynamic'

const PRIVADO = HEADERS_PRIVADO_NO_STORE

export async function GET(_req: Request, props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params
  if (!CODIGO_RONDA_VALIDO.test(codigo)) return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: PRIVADO })
  try {
    const supabase = await createClient()
    const { data: sesion } = await supabase.auth.getClaims()
    if (!sesion?.claims?.sub) return NextResponse.json({ error: 'Requiere sesión' }, { status: 401, headers: PRIVADO })

    const juego = await cargarJuegoDeLaRonda(createAdminClient(), codigo, indicesDePerfil)
    switch (juego.status) {
      case 'ok':
        return NextResponse.json({ estado: 'ok', ...juego.vista }, { headers: PRIVADO })
      case 'sin_juego':
        return NextResponse.json({ estado: 'sin_juego', motivo: juego.motivo }, { headers: PRIVADO })
      case 'no_es_timba':
      case 'not_found':
        return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: PRIVADO })
      default:
        return NextResponse.json({ error: 'No disponible' }, { status: 503, headers: PRIVADO })
    }
  } catch (err) {
    void captureError(err, { context: 'api.ronda-libre.juego', meta: { codigo } })
    return NextResponse.json({ error: 'Algo salió mal' }, { status: 500, headers: PRIVADO })
  }
}
