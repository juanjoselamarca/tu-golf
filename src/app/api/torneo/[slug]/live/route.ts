import { NextResponse } from 'next/server'
import { createAnonClient } from '@/utils/supabase/anon'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { armarTorneoEnVivo, fetchTorneoEnVivoRow } from '@/lib/data/tournaments/en-vivo'
import type { Client } from '@/lib/data/tournaments/leaderboard'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { HEADERS_EN_VIVO_CDN, HEADERS_EN_VIVO_NO_ENCONTRADA, rechazarQueryString } from '@/lib/api-en-vivo'

// GET /api/torneo/[slug]/live — leaderboard en vivo de un torneo, cacheable en el CDN.
//
// Reemplaza a Supabase Realtime + router.refresh() (incidente torneo Los Leones
// 04-oct-2026). Un render de la página son ≥8 round-trips por espectador; acá el
// CDN de Vercel colapsa a TODOS los espectadores en ~1 armado por torneo cada 10 s.
//
// La respuesta NO depende de quién pregunta: cliente anónimo sin cookies y el
// navegador pide con `credentials: 'omit'`. Sólo lee tablas con RLS de lectura
// pública (tournaments públicos, players, rounds, hole_scores, categories,
// tournament_groups/_players, course_*, ronda_equipos, ronda_libre_jugadores).
// El gate PRO es de la VISTA (/torneo/[slug]/en-vivo), no de los datos: /tv los
// lee igual desde el navegador.
//
// Privacidad: `profiles` no es legible por anon. El nombre del perfil NO sale de
// acá (sin él, el motor usa el nombre de inscripción; la vista conserva el nombre
// que ya trajo su render inicial). El índice del perfil sólo lo lee un service
// role ACOTADO a `profiles(id, indice)` para los equipos, y de ahí sólo salen
// puntos y totales netos derivados (ya públicos en el board): nunca el course
// handicap ni el índice crudo.

export const dynamic = 'force-dynamic'

/** Slugs: minúsculas, dígitos y guiones (lo demás ni se consulta). */
const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{0,119}$/

export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const conQuery = rechazarQueryString(req)
  if (conQuery) return conQuery
  const { slug } = await props.params
  if (!SLUG_VALIDO.test(slug)) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: HEADERS_EN_VIVO_NO_ENCONTRADA })
  }
  try {
    const anon = createAnonClient()
    const row = await fetchTorneoEnVivoRow(anon, slug)
    if (!row) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: HEADERS_EN_VIVO_NO_ENCONTRADA })
    }
    // Service role SÓLO para `profiles(id, indice)` de los equipos, y sólo si se pide.
    // Decisión de Juanjo (08-oct): en torneos neto los puntos/totales DERIVADOS se
    // calculan con el índice real (si no, el neto sale mal); la respuesta nunca
    // lleva course handicap ni índice de jugadores con cuenta.
    // TODO(#509): usar la fuente única `src/lib/data/indices-de-perfil.ts` cuando #509 esté en main.
    const clienteIndices = {
      from: (tabla: string) => {
        if (tabla !== 'profiles') throw new Error(`clienteIndices sólo lee profiles (pidió ${tabla})`)
        return createAdminClient().from('profiles')
      },
    }
    const data = await armarTorneoEnVivo(anon as unknown as Client, row, clienteIndices)
    return NextResponse.json(data, { headers: HEADERS_EN_VIVO_CDN })
  } catch (err) {
    // Base caída / statement timeout: nunca al CDN; el próximo poll reintenta.
    void captureError(err, { context: 'api.torneo.live', meta: { slug } })
    return NextResponse.json({ error: 'No disponible. Reintentando.' }, { status: 503, headers: HEADERS_PRIVADO_NO_STORE })
  }
}
