import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { armarTorneoEnVivoParaRuta, SLUG_TORNEO_VALIDO } from '@/lib/data/tournaments/en-vivo-servidor'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { rechazarQueryString } from '@/lib/api-en-vivo'

// GET /api/torneo/[slug]/neto — leaderboard en vivo COMPLETO (con neto) para un visor CON SESIÓN.
//
// Decisión de Juanjo (08-oct): el neto se ve sólo con sesión; la ruta pública
// (`/live`, CDN) de un torneo neto va sólo con gross. Esta es privada (no-store,
// nunca al CDN), pero NO arma por visor: el armado se comparte en el Data Cache del
// servidor 10 s por torneo (`unstable_cache`), así N espectadores ≈ 1 armado cada
// 10 s como en `/live`. Header `x-armado-hace`: segundos desde ese armado ("Actualizado").
//
// Sesión: `getClaims()`. Prod firma con ES256 (in_use; HS256 previously_used —
// verificado 09-oct-2026), así que el JWT se verifica en LOCAL con la JWKS, sin
// consulta a Auth por poll; si venció, getClaims lo refresca y @supabase/ssr escribe
// la cookie (la ruta sale antes del middleware: src/proxy.ts, esApiEnVivo).
//
// Gate PRO: es de la VISTA (la página /torneo/[slug]/en-vivo), no de los datos.
// Esta ruta NO exige PRO: lo que devuelve es el mismo leaderboard que ve cualquier
// jugador del torneo; sólo exige sesión (decisión de Juanjo: neto sólo con sesión).

export const dynamic = 'force-dynamic'

const PRIVADO = HEADERS_PRIVADO_NO_STORE

const armadoCompartido = (slug: string) =>
  unstable_cache(
    async () => {
      const torneo = await armarTorneoEnVivoParaRuta(slug, { soloGross: false })
      return torneo ? { torneo, armadoEn: Date.now() } : null
    },
    ['torneo-en-vivo-neto', slug],
    { revalidate: 10, tags: [`torneo-en-vivo:${slug}`] },
  )()

export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const conQuery = rechazarQueryString(req)
  if (conQuery) return conQuery
  const { slug } = await props.params
  if (!SLUG_TORNEO_VALIDO.test(slug)) return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: PRIVADO })
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    if (!data?.claims?.sub) return NextResponse.json({ error: 'Requiere sesión' }, { status: 401, headers: PRIVADO })
    const armado = await armadoCompartido(slug)
    if (!armado) return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: PRIVADO })
    const hace = Math.max(0, Math.floor((Date.now() - armado.armadoEn) / 1000))
    return NextResponse.json(armado.torneo, { headers: { ...PRIVADO, 'x-armado-hace': String(hace) } })
  } catch (err) {
    void captureError(err, { context: 'api.torneo.neto', meta: { slug } })
    return NextResponse.json({ error: 'No disponible. Reintentando.' }, { status: 503, headers: PRIVADO })
  }
}
