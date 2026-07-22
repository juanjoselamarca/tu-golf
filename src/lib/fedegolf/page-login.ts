/**
 * Login de PÁGINA de fedegolf.cl — distinto de `fedegolfLogin` (que usa
 * `code/ajax/services.php` y solo autoriza la capa API/índice).
 *
 * El acceso a las páginas de tarjetas (`listadoMejoresPalos.php`,
 * `consultaPalosMasivo.php`) requiere una sesión de PÁGINA, que solo se obtiene
 * con el form POST a `/` incluyendo el token `lva` (un nonce de 32 hex que la
 * fede renderiza como `<input name="lva">` en el GET `/`). Verificado en vivo:
 * sin `lva` los guards devuelven 403/302 a `?redirect=`.
 *
 * Usa fetch nativo (Node 18+/Next 14). Sin navegador headless.
 */

import type { FedegolfSession } from './types'

const BASE_URL = 'https://www.fedegolf.cl'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

/**
 * Extrae PHPSESSID de los Set-Cookie de una respuesta. Soporta `getSetCookie()`
 * (Node 18.14+) y el fallback `get('set-cookie')`.
 */
function extractPhpSessionId(headers: Headers): string | null {
  const cookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie')?.split(', ') ?? [])
  for (const cookie of cookies) {
    const match = cookie.match(/PHPSESSID=([^;]+)/)
    if (match) return match[1]
  }
  return null
}

/**
 * Autentica una sesión de PÁGINA en fedegolf.cl.
 *
 * 1. GET `/` → cookie PHPSESSID inicial + token `lva` del HTML.
 * 2. POST `/` (form-urlencoded) con `lva`, `rut`, `pass`, `aceptar=Ingresar`.
 *
 * En éxito devuelve `{ cookie }` con el PHPSESSID autenticado (usa el nuevo si el
 * POST rota la sesión). Lanza si no logra PHPSESSID o `lva`.
 */
export async function fedegolfPageLogin(
  rut: string,
  password: string
): Promise<FedegolfSession> {
  // Paso 1: sembrar sesión + obtener token lva
  const init = await fetch(`${BASE_URL}/`, {
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT },
  })
  const sessionId = extractPhpSessionId(init.headers)
  const html = await init.text()
  const lva =
    html.match(/name=["']lva["'][^>]*value=["']([^"']+)["']/i)?.[1] ??
    html.match(/value=["']([a-f0-9]{32})["'][^>]*name=["']lva["']/i)?.[1]

  if (!sessionId || !lva) {
    throw new Error(
      'fedegolf: no se pudo obtener PHPSESSID/lva para el login de página'
    )
  }

  // Paso 2: login de página (form POST a la raíz)
  const loginRes = await fetch(`${BASE_URL}/`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `PHPSESSID=${sessionId}`,
      'User-Agent': USER_AGENT,
      Origin: BASE_URL,
      Referer: `${BASE_URL}/`,
    },
    body: new URLSearchParams({
      lva,
      rut,
      pass: password,
      aceptar: 'Ingresar',
    }).toString(),
  })

  const newSessionId = extractPhpSessionId(loginRes.headers)
  return { cookie: `PHPSESSID=${newSessionId ?? sessionId}` }
}
