import { NextResponse } from 'next/server'
import { armarTorneoEnVivoParaRuta, SLUG_TORNEO_VALIDO } from '@/lib/data/tournaments/en-vivo-servidor'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { HEADERS_EN_VIVO_CDN, HEADERS_EN_VIVO_NO_ENCONTRADA, rechazarQueryString } from '@/lib/api-en-vivo'

// GET /api/torneo/[slug]/live — leaderboard en vivo de un torneo, PÚBLICO y cacheable en el CDN.
//
// Reemplaza a Supabase Realtime + router.refresh() (incidente torneo Los Leones
// 04-oct-2026). Un render de la página son ≥8 round-trips por espectador; acá el
// CDN de Vercel colapsa a TODOS los espectadores en ~1 armado por torneo cada 10 s.
//
// La respuesta NO depende de quién pregunta: cliente anónimo sin cookies y el
// navegador pide con `credentials: 'omit'`. Sólo lee tablas con RLS de lectura
// pública (tournaments públicos, players, rounds, hole_scores, categories,
// tournament_groups/_players, course_*, ronda_equipos, ronda_libre_jugadores).
//
// Privacidad: regla canónica de #509 (`vistaPublica`, vista-publica.ts) para un
// visor SIN sesión. Camino de ronda libre: nada neto, y en un torneo neto sólo
// bruto (sin HCP, neto ni puntos: de ellos se deduce el handicap); el neto lo pide
// un visor con sesión a `/neto` (privada). Torneos legacy: completos (decisión 2
// de #509). El nombre del perfil no sale de acá (la vista conserva el de su render).

export const dynamic = 'force-dynamic'

export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const conQuery = rechazarQueryString(req)
  if (conQuery) return conQuery
  const { slug } = await props.params
  if (!SLUG_TORNEO_VALIDO.test(slug)) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: HEADERS_EN_VIVO_NO_ENCONTRADA })
  }
  try {
    const data = await armarTorneoEnVivoParaRuta(slug, { visorConSesion: false })
    if (!data) return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: HEADERS_EN_VIVO_NO_ENCONTRADA })
    return NextResponse.json(data, { headers: HEADERS_EN_VIVO_CDN })
  } catch (err) {
    // Base caída / statement timeout: nunca al CDN; el próximo poll reintenta.
    void captureError(err, { context: 'api.torneo.live', meta: { slug } })
    return NextResponse.json({ error: 'No disponible. Reintentando.' }, { status: 503, headers: HEADERS_PRIVADO_NO_STORE })
  }
}
