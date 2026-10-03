/**
 * A dónde vuelve el usuario después de entrar — FUENTE ÚNICA.
 *
 * Todo link o redirect a /login o /register que deba devolver al usuario a la
 * página donde estaba se arma con `loginUrl(next)` / `registerUrl(next)`.
 * Nunca a mano (`'/login?next=' + ...`): el canario
 * `src/__tests__/login-url.test.ts` falla si aparece un literal así fuera de
 * este archivo.
 *
 * Seguridad (open redirect): `next` viaja en la URL, así que cualquiera puede
 * armar un link `/login?next=https://phishing`. `sanitizeNext` sólo deja pasar
 * rutas internas; todo lo demás cae en `DEFAULT_NEXT`. Lo usan tanto quien
 * ARMA el link (loginUrl) como quien lo LEE (login, register, /auth/callback,
 * PostLoginRedirect), así que el valor externo nunca llega al router.
 */

/** Destino por defecto después de entrar o registrarse. */
export const DEFAULT_NEXT = '/dashboard'

/**
 * Devuelve `next` si es una ruta interna segura; si no, `DEFAULT_NEXT`.
 * Rechaza URLs absolutas (`http:`, `javascript:`), protocol-relative (`//host`)
 * y las variantes que el navegador normaliza a `//host` (`/\host`, `/..//host`).
 */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || next.trim() === '') return DEFAULT_NEXT
  if (!next.startsWith('/') || next.startsWith('//')) return DEFAULT_NEXT
  try {
    const parsed = new URL(next, 'https://placeholder.internal')
    if (parsed.hostname !== 'placeholder.internal') return DEFAULT_NEXT
    const out = parsed.pathname + parsed.search
    // El parser colapsa '/..//host' (y '/.//host', '/%2e%2e//host', '/..\host') en
    // '//host': el hostname ya se validó, pero el router del cliente lee '//host'
    // como URL externa. Lo que tras normalizar sigue siendo protocol-relative, no.
    if (out.startsWith('//')) return DEFAULT_NEXT
    return out
  } catch {
    return DEFAULT_NEXT
  }
}

/** Rutas a las que no tiene sentido volver después de entrar. */
function sinDestinoPropio(ruta: string): boolean {
  return (
    ruta === DEFAULT_NEXT ||
    ruta === '/' ||
    ruta === '/login' || ruta.startsWith('/login?') ||
    ruta === '/register' || ruta.startsWith('/register?')
  )
}

function conNext(base: '/login' | '/register', next?: string | null): string {
  if (!next) return base
  const destino = sanitizeNext(next)
  if (sinDestinoPropio(destino)) return base
  return `${base}?next=${encodeURIComponent(destino)}`
}

/** Link/redirect a /login que, tras entrar, devuelve al usuario a `next`. */
export function loginUrl(next?: string | null): string {
  return conNext('/login', next)
}

/** Link/redirect a /register que, tras registrarse, devuelve al usuario a `next`. */
export function registerUrl(next?: string | null): string {
  return conNext('/register', next)
}
