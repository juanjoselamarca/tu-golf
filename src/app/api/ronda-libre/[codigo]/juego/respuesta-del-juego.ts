import { NextResponse } from 'next/server'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import type { JuegoDeLaRonda } from '@/lib/data/ronda-libre-timba'

/**
 * El juego de una Timba como respuesta HTTP. Lo comparten la ruta con sesión (`/juego`, no-store) y la pública
 * (`/juego/publico`, cacheable en el CDN): el cuerpo es el mismo, cambian solo los headers. Un error nunca se cachea.
 */
export function respuestaDelJuego(
  juego: JuegoDeLaRonda,
  headers: { ok: Record<string, string>; noEncontrada: Record<string, string> },
): NextResponse {
  switch (juego.status) {
    case 'ok':
      return NextResponse.json({ estado: 'ok', ...juego.vista }, { headers: headers.ok })
    case 'sin_juego':
      return NextResponse.json({ estado: 'sin_juego', motivo: juego.motivo }, { headers: headers.ok })
    case 'no_es_timba':
    case 'not_found':
      return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: headers.noEncontrada })
    default:
      return NextResponse.json({ error: 'No disponible' }, { status: 503, headers: HEADERS_PRIVADO_NO_STORE })
  }
}
