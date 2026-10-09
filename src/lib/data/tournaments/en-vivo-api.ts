// ─── Leaderboard en vivo de un torneo desde el navegador ────────────────────
// Lo pide ya armado a `/api/torneo/[slug]/live` (cacheable en el CDN). Reemplaza
// a Supabase Realtime + router.refresh() (incidente torneo Los Leones 04-oct-2026).

import type { TorneoEnVivo } from './en-vivo'
import { fetchJsonConPlazo, JsonInvalidoError } from '@/lib/red/fetch-json-con-plazo'
import { TIMEOUT_EN_VIVO_MS } from '@/hooks/ronda/useLivePoll'

export type ResultadoTorneoEnVivo =
  | { status: 'ok'; data: TorneoEnVivo; /** Antigüedad del armado, en segundos (`Age` del CDN o `x-armado-hace` de /neto). */ edadSegundos: number }
  | { status: 'not_found' }
  | { status: 'sin-sesion' }
  | { status: 'transient' }
  | { status: 'error' }

function esTorneoEnVivo(x: unknown): x is TorneoEnVivo {
  const r = x as Partial<TorneoEnVivo> | null
  return !!r && !!r.tournament && typeof r.tournament.id === 'string'
    && Array.isArray(r.players) && Array.isArray(r.teams)
    && Array.isArray(r.categories) && Array.isArray(r.groups)
}

/**
 * `credentials: 'omit'`: la respuesta es la misma para todos; sin cookies el
 * middleware no toca la sesión (no hay `Set-Cookie`) y el CDN puede servirla.
 * NUNCA `cache: 'no-store'` (manda `Pragma: no-cache` → Vercel revalida en
 * primer plano y cada poll pegaría a la base).
 */
export async function loadTorneoEnVivo(slug: string): Promise<ResultadoTorneoEnVivo> {
  return pedir(`/api/torneo/${encodeURIComponent(slug)}/live`, { credentials: 'omit' })
}

/**
 * Torneo NETO, visor con sesión: el board completo (con neto) desde la ruta privada
 * `/api/torneo/[slug]/neto` (con cookies, no-store; armado compartido en el
 * servidor). La pública de un torneo neto sólo trae gross (decisión de Juanjo 08-oct).
 */
export async function loadTorneoNeto(slug: string): Promise<ResultadoTorneoEnVivo> {
  return pedir(`/api/torneo/${encodeURIComponent(slug)}/neto`, { credentials: 'same-origin' })
}

async function pedir(url: string, init: RequestInit): Promise<ResultadoTorneoEnVivo> {
  // Un solo plazo sobre fetch + cuerpo (fuente única): un cuerpo colgado no congela el polling.
  let res: Response
  let json: unknown
  try {
    ({ res, json } = await fetchJsonConPlazo(url, init, TIMEOUT_EN_VIVO_MS))
  } catch (e) {
    return { status: e instanceof JsonInvalidoError ? 'error' : 'transient' }
  }
  if (res.status === 404) return { status: 'not_found' }
  if (res.status === 401) return { status: 'sin-sesion' }
  if (!res.ok) return { status: 'transient' }
  if (!esTorneoEnVivo(json)) return { status: 'error' }
  // /live: `Age` del CDN. /neto (privada): `x-armado-hace`, la edad del armado compartido.
  const edad = Number(res.headers.get('x-armado-hace') ?? res.headers.get('age'))
  return { status: 'ok', data: json, edadSegundos: Number.isFinite(edad) && edad > 0 ? edad : 0 }
}
