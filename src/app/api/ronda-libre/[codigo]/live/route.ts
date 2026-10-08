import { NextResponse } from 'next/server'
import { createAnonClient } from '@/utils/supabase/anon'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { cargarRondaLibreEnVivo } from '@/lib/data/ronda-libre'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'

// GET /api/ronda-libre/[codigo]/live — datos de la vista en vivo de una ronda libre.
//
// Reemplaza a Supabase Realtime (incidente torneo Los Leones 04-oct-2026: cada
// arranque del tenant de Realtime hacía DDL → PostgREST recargaba su schema cache
// → con la base cargada la recarga caía por statement timeout → API caída). Los
// espectadores hacen polling a ESTA ruta y el CDN de Vercel colapsa las consultas:
// M espectadores ≈ 1 armado por ronda cada `s-maxage` segundos.
//
// Para que el CDN pueda colapsar, la respuesta NO depende de quién pregunta:
// cliente anónimo sin cookies (`createAnonClient`) y el navegador pide con
// `credentials: 'omit'`. Sólo viaja lo que la vista pública ya mostraba (tablas
// con RLS de lectura pública). La única lectura privilegiada es `profiles.indice`
// de los jugadores con cuenta sin índice en la tarjeta, y de ahí sólo sale el
// course handicap derivado (la columna HCP), nunca el índice crudo.

export const dynamic = 'force-dynamic'

/**
 * Cache SÓLO en el CDN de Vercel (`Vercel-CDN-Cache-Control`, que Vercel no reenvía
 * al navegador). Al navegador va `max-age=0, must-revalidate`: si recibiera el
 * `stale-while-revalidate`, Chrome lo aplica en SU caché y cada poll mostraría la
 * respuesta ANTERIOR (verificado con Playwright: +10 s de atraso por poll).
 * Ojo: el cliente NO debe pedir con `cache: 'no-store'` (manda `Pragma: no-cache`
 * y Vercel revalida en primer plano → cada poll pegaría a la base).
 */
const HEADERS_EN_VIVO = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': 'max-age=10, stale-while-revalidate=30',
} as const
/** 404 real: corto y sin stale, por si el código se crea justo después. */
const HEADERS_NO_ENCONTRADA = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': 'max-age=10',
} as const

/** Códigos de ronda: alfanuméricos cortos (`/api/ronda-libre/create`). Lo demás ni se consulta. */
const CODIGO_VALIDO = /^[A-Za-z0-9_-]{1,40}$/

export async function GET(_req: Request, props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params
  if (!CODIGO_VALIDO.test(codigo)) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: HEADERS_NO_ENCONTRADA })
  }
  try {
    // service role SÓLO para `profiles(id, indice)`, y sólo si algún jugador lo necesita.
    const clienteIndices = { from: (tabla: string) => createAdminClient().from(tabla) }
    const res = await cargarRondaLibreEnVivo(createAnonClient(), codigo, clienteIndices)
    if (res.status === 'ok') {
      const { ronda, parMap, siMap, courseHcpMap, displayHcpMap, sinIndice, equipos } = res
      return NextResponse.json(
        { ronda, parMap, siMap, courseHcpMap, displayHcpMap, sinIndice, equipos },
        { headers: HEADERS_EN_VIVO },
      )
    }
    if (res.status === 'not_found') {
      return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: HEADERS_NO_ENCONTRADA })
    }
    // transient / error: nunca al CDN (el próximo poll reintenta contra la base).
    return NextResponse.json({ error: 'No disponible. Reintentando.' }, { status: 503, headers: HEADERS_PRIVADO_NO_STORE })
  } catch (err) {
    void captureError(err, { context: 'api.ronda-libre.live', meta: { codigo } })
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500, headers: HEADERS_PRIVADO_NO_STORE })
  }
}
