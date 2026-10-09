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

/**
 * Armado DEGRADADO (no se pudo armar la tabla de equipos): se lanza desde la función
 * cacheada para que `unstable_cache` NO lo guarde como entrada nueva. OJO: eso solo
 * no alcanza — cuando la entrada vencida se revalida en BACKGROUND y la revalidación
 * lanza, `unstable_cache` se traga el error y sigue sirviendo la entrada vieja
 * (stale). Por eso el GET, además, no acepta un armado más viejo que
 * `EDAD_MAXIMA_S` (ver abajo). Cuando el rechazo llega al GET (no había entrada),
 * lo responde igual, privado y sin edad.
 */
class ArmadoDegradado extends Error {
  constructor(public torneo: NonNullable<Awaited<ReturnType<typeof armarTorneoEnVivoParaRuta>>>) {
    super('Armado del torneo degradado (equipos no disponibles)')
    this.name = 'ArmadoDegradado'
  }
}

/** Cada cuánto se rearma el torneo compartido. */
const REVALIDAR_S = 10
/**
 * Más viejo que esto, el armado del cache NO se sirve: es que las revalidaciones en
 * background vienen fallando (y `unstable_cache` se las traga). Se arma fuera del
 * cache, con el estado real (degradado o no).
 */
const EDAD_MAXIMA_S = 3 * REVALIDAR_S

const armadoCompartido = (slug: string) =>
  unstable_cache(
    async () => {
      const torneo = await armarTorneoEnVivoParaRuta(slug, { visorConSesion: true })
      if (torneo?.equiposNoDisponibles) throw new ArmadoDegradado(torneo)
      return torneo ? { torneo, armadoEn: Date.now() } : null
    },
    ['torneo-en-vivo-neto', slug],
    { revalidate: REVALIDAR_S, tags: [`torneo-en-vivo:${slug}`] },
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
    if (hace > EDAD_MAXIMA_S) {
      // Falla sostenida de las revalidaciones: el visor recibe el estado real, no el
      // armado viejo completo con la edad creciendo y sin aviso.
      const fresco = await armarTorneoEnVivoParaRuta(slug, { visorConSesion: true })
      if (!fresco) return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: PRIVADO })
      return NextResponse.json(fresco, { headers: { ...PRIVADO, 'x-armado-hace': '0' } })
    }
    return NextResponse.json(armado.torneo, { headers: { ...PRIVADO, 'x-armado-hace': String(hace) } })
  } catch (err) {
    if (err instanceof ArmadoDegradado) {
      // Ya reportado al armarlo (captureError en armarTorneoEnVivo): el resto del board sí sirve.
      return NextResponse.json(err.torneo, { headers: { ...PRIVADO, 'x-armado-hace': '0' } })
    }
    void captureError(err, { context: 'api.torneo.neto', meta: { slug } })
    return NextResponse.json({ error: 'No disponible. Reintentando.' }, { status: 503, headers: PRIVADO })
  }
}
