/**
 * Valida lo que `POST /api/admin/e2e/runs` le pasa al workflow `e2e-trigger.yml`.
 *
 * El workflow corre Playwright contra `base_url` con las credenciales del usuario E2E
 * (`E2E_USER_EMAIL/PASSWORD`) y hace checkout de `branch` con los secrets del repo. Sin esta
 * validación, una sesión de admin robada podía mandar esas credenciales a un host ajeno
 * (`base_url: "https://atacante.example"`). El panel `/admin/e2e` manda `{}`: los defaults
 * cubren el uso real, así que la lista blanca es solo prod.
 */

export const BASE_URL_E2E_POR_DEFECTO = 'https://golfersplus.vercel.app'
export const RAMA_E2E_POR_DEFECTO = 'main'

/** Orígenes contra los que el workflow puede correr (comparación exacta de `origin`). */
const ORIGENES_PERMITIDOS: ReadonlySet<string> = new Set([BASE_URL_E2E_POR_DEFECTO])

/** Nombre de rama de git razonable: sin espacios, sin `..`, sin empezar con `-` ni `/`. */
const RAMA_VALIDA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/

export type EntradaCorrida =
  | { ok: true; baseUrl: string; branch: string }
  | { ok: false; error: string }

export function validarEntradaCorrida(body: unknown): EntradaCorrida {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}

  let baseUrl = BASE_URL_E2E_POR_DEFECTO
  if (b.base_url !== undefined && b.base_url !== null) {
    if (typeof b.base_url !== 'string') return { ok: false, error: 'base_url inválido' }
    let origen: string
    try {
      origen = new URL(b.base_url).origin
    } catch {
      return { ok: false, error: 'base_url inválido' }
    }
    if (!ORIGENES_PERMITIDOS.has(origen)) return { ok: false, error: 'base_url no permitido' }
    baseUrl = origen
  }

  let branch = RAMA_E2E_POR_DEFECTO
  if (b.branch !== undefined && b.branch !== null) {
    if (typeof b.branch !== 'string' || !RAMA_VALIDA.test(b.branch) || b.branch.includes('..') || b.branch.endsWith('/')) {
      return { ok: false, error: 'branch inválido' }
    }
    branch = b.branch
  }

  return { ok: true, baseUrl, branch }
}
