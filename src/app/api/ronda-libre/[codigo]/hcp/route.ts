import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cargarRondaLibreEnVivo } from '@/lib/data/ronda-libre'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { CODIGO_RONDA_VALIDO } from '@/lib/api-en-vivo'

// GET /api/ronda-libre/[codigo]/hcp — handicaps de la ronda PARA UN VISOR CON SESIÓN.
// (En una ronda neto la ruta pública no lleva el handicap de nadie: con esto el
// visor con sesión arma el neto. En gross completa el de jugadores con cuenta.)
//
// Privacidad (decisión de Juanjo, 08-oct-2026): el course handicap de un jugador
// con cuenta (se despeja su índice) se muestra SÓLO a visores con sesión. La ruta
// pública cacheada (`/live`) no lee perfiles; ésta lo completa con el cliente de la
// sesión (RLS: `profiles` legible por authenticated). Privada y no-store: nunca al
// CDN. El cliente la pide UNA vez por carga (y si cambia la lista de jugadores),
// sólo cuando algún jugador con cuenta no fijó índice en la tarjeta.

export const dynamic = 'force-dynamic'

const PRIVADO = HEADERS_PRIVADO_NO_STORE

export async function GET(_req: Request, props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params
  if (!CODIGO_RONDA_VALIDO.test(codigo)) return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: PRIVADO })
  try {
    const supabase = await createClient()
    // getClaims: verifica el JWT en local (prod firma ES256) y, si venció, lo refresca
    // y @supabase/ssr escribe la cookie nueva (esta ruta sale antes del middleware).
    const { data: sesion } = await supabase.auth.getClaims()
    if (!sesion?.claims?.sub) return NextResponse.json({ error: 'Requiere sesión' }, { status: 401, headers: PRIVADO })
    const res = await cargarRondaLibreEnVivo(supabase, codigo)
    if (res.status === 'not_found') return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: PRIVADO })
    if (res.status !== 'ok') return NextResponse.json({ error: 'No disponible' }, { status: 503, headers: PRIVADO })
    const { courseHcpMap, displayHcpMap, sinIndice } = res
    const handicapPorJugador = Object.fromEntries(res.ronda.ronda_libre_jugadores.map(j => [j.id, j.handicap ?? null]))
    const handicapPorEquipo = Object.fromEntries(res.equipos.map(e => [e.id, e.handicap_equipo ?? null]))
    return NextResponse.json({ courseHcpMap, displayHcpMap, sinIndice, handicapPorJugador, handicapPorEquipo }, { headers: PRIVADO })
  } catch (err) {
    void captureError(err, { context: 'api.ronda-libre.hcp', meta: { codigo } })
    return NextResponse.json({ error: 'Algo salió mal' }, { status: 500, headers: PRIVADO })
  }
}
