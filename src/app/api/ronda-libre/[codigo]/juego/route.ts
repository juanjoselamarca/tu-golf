import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { cargarJuegoDeLaRonda } from '@/lib/data/ronda-libre-timba'
import { cargarSkinsDelScorer } from '@/lib/data/ronda-libre-skins'
import { esFormatoSkins } from '@/golf/formats/skins'
import { indicesDePerfil } from '@/lib/data/indices-de-perfil'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { CODIGO_RONDA_VALIDO } from '@/lib/api-en-vivo'
import { respuestaDelJuego } from './respuesta-del-juego'

// GET /api/ronda-libre/[codigo]/juego — el juego de una Timba libre (formato `personalizado`), calculado en el
// servidor. Con sesión, privada y no-store (como `/hcp`): el scorer ve al tiro lo que acaba de anotar. Sin sesión,
// 401 y el cliente lee el mismo cuerpo de `/juego/publico` (cacheada en el CDN).
//
// Qué ve el grupo en una Timba neto: los puntos y la marca de golpe recibido por hoyo de cada jugador. La respuesta
// es `VistaDelJuego`: no trae el índice crudo ni el hándicap de juego; desde el 18-nov sí el HCP de 18 a mostrar
// (`hcpAMostrar`, solo en neto, igual para todo visor; ver docs/specs/formato-personalizado.md). El neto se calcula acá con el lector de servicio (`indicesDePerfil`), nunca desde la respuesta
// pública de `/live` (`courseHcpMap: {}`).
//
// Un skins (`formato_juego = 'skins'`) responde aquí lo que el scorer necesita para marcar puntos especiales
// (`VistaDelSkinsEnElScorer`, con `formato: 'skins'`): puntos, marcas y retiros. `/juego/publico` sigue siendo solo
// de la Timba: el espectador del skins lo verá con el leaderboard.

export const dynamic = 'force-dynamic'

const PRIVADO = HEADERS_PRIVADO_NO_STORE

export async function GET(_req: Request, props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params
  if (!CODIGO_RONDA_VALIDO.test(codigo)) return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: PRIVADO })
  try {
    const supabase = await createClient()
    const { data: sesion } = await supabase.auth.getClaims()
    if (!sesion?.claims?.sub) return NextResponse.json({ error: 'Requiere sesión' }, { status: 401, headers: PRIVADO })

    const admin = createAdminClient()
    const juego = await cargarJuegoDeLaRonda(admin, codigo, indicesDePerfil)
    if (juego.status === 'no_es_timba' && esFormatoSkins(juego.formato)) return respuestaDelSkins(await cargarSkinsDelScorer(admin, codigo))
    return respuestaDelJuego(juego, { ok: PRIVADO, noEncontrada: PRIVADO })
  } catch (err) {
    void captureError(err, { context: 'api.ronda-libre.juego', meta: { codigo } })
    return NextResponse.json({ error: 'Algo salió mal' }, { status: 500, headers: PRIVADO })
  }
}

function respuestaDelSkins(skins: Awaited<ReturnType<typeof cargarSkinsDelScorer>>): NextResponse {
  switch (skins.status) {
    case 'ok':
      return NextResponse.json({ estado: 'ok', ...skins.vista }, { headers: PRIVADO })
    case 'sin_juego':
      return NextResponse.json({ estado: 'sin_juego', motivo: 'reglas_invalidas', rondaCerrada: skins.rondaCerrada }, { headers: PRIVADO })
    case 'no_es_skins':
    case 'not_found':
      return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: PRIVADO })
    default:
      return NextResponse.json({ error: 'No disponible' }, { status: 503, headers: PRIVADO })
  }
}
