// ─── Rutas públicas "en vivo" cacheables en el CDN ──────────────────────────
// Fuente única de las reglas que comparten /api/ronda-libre/[codigo]/live y
// /api/torneo/[slug]/live (reemplazo de Supabase Realtime, incidente torneo
// Los Leones 04-oct-2026): headers de cache, la regla de privacidad y el
// rechazo de query strings que saltarían el CDN.

import { NextResponse } from 'next/server'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'

/**
 * Cache SÓLO en el CDN de Vercel (`Vercel-CDN-Cache-Control`, que Vercel no reenvía
 * al navegador). Al navegador va `max-age=0, must-revalidate`: si recibiera el
 * `stale-while-revalidate`, Chrome lo aplica en SU caché y cada poll mostraría la
 * respuesta ANTERIOR (verificado con Playwright: +10 s de atraso por poll).
 * Ojo: el cliente NO debe pedir con `cache: 'no-store'` (manda `Pragma: no-cache`
 * y Vercel revalida en primer plano → cada poll pegaría a la base).
 */
export const HEADERS_EN_VIVO_CDN = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': 'max-age=10, stale-while-revalidate=30',
} as const

/** 404 real: corto y sin stale, por si el recurso se crea justo después. */
export const HEADERS_EN_VIVO_NO_ENCONTRADA = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': 'max-age=10',
} as const

/**
 * ¿La respuesta pública (cacheada, la ve cualquiera con el link) usa el índice
 * del PERFIL de los jugadores con cuenta? `profiles` sólo es legible por usuarios
 * autenticados y del course handicap se puede despejar el índice.
 *
 * false (camino conservador, decisión de producto pendiente de Juanjo): sólo el
 * índice declarado en la tarjeta/inscripción; los jugadores con cuenta sin índice
 * en la tarjeta salen `sinIndice`, igual que los ve hoy un anónimo.
 * true: se lee `profiles(id, indice)` con service role acotado a los jugadores del
 * recurso; sale sólo lo derivado, nunca el índice crudo.
 */
export const PUBLICAR_INDICE_DE_PERFIL_EN_VIVO = false

/**
 * Un query string (`?x=<random>`) es otra clave de cache en el CDN: cada valor
 * nuevo sería un MISS que pega a la base. Estas rutas no aceptan parámetros, así
 * que se rechazan SIN consultar nada.
 */
export function rechazarQueryString(req: Request): NextResponse | null {
  if (!new URL(req.url).search) return null
  return NextResponse.json({ error: 'Parámetros no admitidos' }, { status: 400, headers: HEADERS_PRIVADO_NO_STORE })
}
