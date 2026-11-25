import { NextResponse } from 'next/server'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarJuegoDeLaRonda, type JuegoDeLaRonda } from '@/lib/data/ronda-libre-timba'
import { cargarSkinsDelScorer, type SkinsDelScorer } from '@/lib/data/ronda-libre-skins'
import { indicesDePerfil } from '@/lib/data/indices-de-perfil'
import { esFormatoSkins } from '@/golf/formats/skins'

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
      return NextResponse.json({ estado: 'sin_juego', motivo: juego.motivo, rondaCerrada: juego.rondaCerrada }, { headers: headers.ok })
    case 'no_es_timba':
    case 'not_found':
      return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: headers.noEncontrada })
    default:
      return NextResponse.json({ error: 'No disponible' }, { status: 503, headers: HEADERS_PRIVADO_NO_STORE })
  }
}

/**
 * El skins como respuesta HTTP (vista del scorer + tabla en vivo). Mismo contrato que `respuestaDelJuego`: el cuerpo
 * es igual con o sin sesión, cambian los headers; un error nunca se cachea.
 */
export function respuestaDelSkins(
  skins: SkinsDelScorer,
  headers: { ok: Record<string, string>; noEncontrada: Record<string, string> },
): NextResponse {
  switch (skins.status) {
    case 'ok':
      return NextResponse.json({ estado: 'ok', ...skins.vista }, { headers: headers.ok })
    case 'sin_juego':
      return NextResponse.json({ estado: 'sin_juego', motivo: 'reglas_invalidas', rondaCerrada: skins.rondaCerrada }, { headers: headers.ok })
    case 'no_es_skins':
    case 'not_found':
      return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: headers.noEncontrada })
    default:
      return NextResponse.json({ error: 'No disponible' }, { status: 503, headers: HEADERS_PRIVADO_NO_STORE })
  }
}

/** El juego de la ronda (Timba o Skins) como respuesta HTTP: la Timba primero; si la ronda es un skins, el skins. */
export async function respuestaDelJuegoDeLaRonda(
  admin: SupabaseClient,
  codigo: string,
  headers: { ok: Record<string, string>; noEncontrada: Record<string, string> },
): Promise<NextResponse> {
  const juego = await cargarJuegoDeLaRonda(admin, codigo, indicesDePerfil)
  if (juego.status === 'no_es_timba' && esFormatoSkins(juego.formato)) return respuestaDelSkins(await cargarSkinsDelScorer(admin, codigo), headers)
  return respuestaDelJuego(juego, headers)
}
