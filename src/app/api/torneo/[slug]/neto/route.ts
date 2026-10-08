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
// 10 s como en `/live`. La sesión se verifica con `getClaims()` (JWT ES256 verificado
// en local con la JWKS: sin consulta a la base por poll).

export const dynamic = 'force-dynamic'

const PRIVADO = HEADERS_PRIVADO_NO_STORE

const armadoCompartido = (slug: string) =>
  unstable_cache(
    () => armarTorneoEnVivoParaRuta(slug, { soloGross: false }),
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
    const torneo = await armadoCompartido(slug)
    if (!torneo) return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: PRIVADO })
    return NextResponse.json(torneo, { headers: PRIVADO })
  } catch (err) {
    void captureError(err, { context: 'api.torneo.neto', meta: { slug } })
    return NextResponse.json({ error: 'No disponible. Reintentando.' }, { status: 503, headers: PRIVADO })
  }
}
