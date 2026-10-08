import { NextResponse } from 'next/server'
import { createAnonClient } from '@/utils/supabase/anon'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { cargarRondaLibreEnVivo } from '@/lib/data/ronda-libre'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import {
  HEADERS_EN_VIVO_CDN,
  HEADERS_EN_VIVO_NO_ENCONTRADA,
  PUBLICAR_INDICE_DE_PERFIL_EN_VIVO,
  rechazarQueryString,
} from '@/lib/api-en-vivo'

// GET /api/ronda-libre/[codigo]/live — datos de la vista en vivo de una ronda libre.
//
// Reemplaza a Supabase Realtime (incidente torneo Los Leones 04-oct-2026: cada
// arranque del tenant de Realtime hacía DDL → PostgREST recargaba su schema cache
// → con la base cargada la recarga caía por statement timeout → API caída). Los
// espectadores hacen polling a ESTA ruta y el CDN de Vercel colapsa las consultas:
// M espectadores ≈ 1 armado por ronda cada 10 s.
//
// Para que el CDN pueda colapsar, la respuesta NO depende de quién pregunta:
// cliente anónimo sin cookies (`createAnonClient`) y el navegador pide con
// `credentials: 'omit'`. Sólo viaja lo que un anónimo ya podía leer (tablas con
// RLS de lectura pública). El índice del perfil, según
// `PUBLICAR_INDICE_DE_PERFIL_EN_VIVO` (hoy: no).

export const dynamic = 'force-dynamic'

/** Códigos de ronda: alfanuméricos cortos (`/api/ronda-libre/create`). Lo demás ni se consulta. */
const CODIGO_VALIDO = /^[A-Za-z0-9_-]{1,40}$/

export async function GET(req: Request, props: { params: Promise<{ codigo: string }> }) {
  const conQuery = rechazarQueryString(req)
  if (conQuery) return conQuery
  const { codigo } = await props.params
  if (!CODIGO_VALIDO.test(codigo)) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: HEADERS_EN_VIVO_NO_ENCONTRADA })
  }
  try {
    // service role SÓLO para `profiles(id, indice)` y sólo si se decide publicarlo.
    const clienteIndices = PUBLICAR_INDICE_DE_PERFIL_EN_VIVO
      ? { from: (tabla: string) => createAdminClient().from(tabla) }
      : null
    const res = await cargarRondaLibreEnVivo(createAnonClient(), codigo, clienteIndices)
    if (res.status === 'ok') {
      const { ronda, parMap, siMap, courseHcpMap, displayHcpMap, sinIndice, equipos } = res
      return NextResponse.json(
        { ronda, parMap, siMap, courseHcpMap, displayHcpMap, sinIndice, equipos },
        { headers: HEADERS_EN_VIVO_CDN },
      )
    }
    if (res.status === 'not_found') {
      return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: HEADERS_EN_VIVO_NO_ENCONTRADA })
    }
    // transient / error: nunca al CDN (el próximo poll reintenta contra la base).
    return NextResponse.json({ error: 'No disponible. Reintentando.' }, { status: 503, headers: HEADERS_PRIVADO_NO_STORE })
  } catch (err) {
    void captureError(err, { context: 'api.ronda-libre.live', meta: { codigo } })
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500, headers: HEADERS_PRIVADO_NO_STORE })
  }
}
