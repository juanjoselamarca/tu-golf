import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { cargarJuegoDeLaRonda } from '@/lib/data/ronda-libre-timba'
import { indicesDePerfil } from '@/lib/data/indices-de-perfil'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { CODIGO_RONDA_VALIDO, HEADERS_EN_VIVO_CDN, HEADERS_EN_VIVO_NO_ENCONTRADA, rechazarQueryString } from '@/lib/api-en-vivo'
import { respuestaDelJuego } from '../respuesta-del-juego'

// GET /api/ronda-libre/[codigo]/juego/publico — el juego de una Timba libre para quien abre el link SIN sesión
// (decisión de Juanjo, 17-nov: el link muestra el juego en vivo y el resultado final, con puntos y sin hándicaps).
//
// Mismo cuerpo que `/juego` (`VistaDelJuego`: puntos, marcas, retiros y golpes recibidos por hoyo). No viaja el índice
// ni nada del perfil; de los golpes recibidos sí se deduce el hándicap de juego (con hándicap completo, su suma es el
// CH), y eso Juanjo lo aceptó el 27-oct. El neto se calcula acá con el lector de servicio, como en `/juego`.
//
// Como no depende de quién pregunta, se cachea en el CDN igual que `/live` (incidente Los Leones 04-oct: los
// espectadores no pueden pegarle a la base en cada poll) y no acepta query strings. Quien tiene sesión usa `/juego`
// (no-store): el scorer necesita ver al tiro lo que acaba de anotar.

export const dynamic = 'force-dynamic'

export async function GET(req: Request, props: { params: Promise<{ codigo: string }> }) {
  const conQuery = rechazarQueryString(req)
  if (conQuery) return conQuery
  const { codigo } = await props.params
  if (!CODIGO_RONDA_VALIDO.test(codigo)) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: HEADERS_EN_VIVO_NO_ENCONTRADA })
  }
  try {
    const juego = await cargarJuegoDeLaRonda(createAdminClient(), codigo, indicesDePerfil)
    return respuestaDelJuego(juego, { ok: HEADERS_EN_VIVO_CDN, noEncontrada: HEADERS_EN_VIVO_NO_ENCONTRADA })
  } catch (err) {
    void captureError(err, { context: 'api.ronda-libre.juego.publico', meta: { codigo } })
    return NextResponse.json({ error: 'Algo salió mal' }, { status: 500, headers: HEADERS_PRIVADO_NO_STORE })
  }
}
