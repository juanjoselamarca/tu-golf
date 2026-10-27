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
import {
  FEDEGOLF_BASE_URL as BASE_URL,
  FEDEGOLF_USER_AGENT as USER_AGENT,
  FedegolfError,
  fedegolfFetch,
} from './http'

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
 * POST rota la sesión). Lanza `no_disponible` si no logra PHPSESSID o `lva`.
 *
 * NO verifica la clave: ante una clave incorrecta fedegolf.cl responde 200 y
 * vuelve a renderizar el formulario, igual de "200" que muchos éxitos y sin un
 * mensaje legible (sondeado 19-oct-2026). Por eso este login nunca declara
 * "credenciales"; la sesión no autenticada se detecta al leer las tarjetas
 * (`fedegolfGetTarjetasIndice`), y solo el login JSON decide si la clave cambió.
 */
export async function fedegolfPageLogin(
  rut: string,
  password: string
): Promise<FedegolfSession> {
  // Paso 1: sembrar sesión + obtener token lva
  const init = await fedegolfFetch(`${BASE_URL}/`, {
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT },
  })
  const sessionId = extractPhpSessionId(init.headers)
  const html = await init.text()
  const lva =
    html.match(/name=["']lva["'][^>]*value=["']([^"']+)["']/i)?.[1] ??
    html.match(/value=["']([a-f0-9]{32})["'][^>]*name=["']lva["']/i)?.[1]

  if (!sessionId || !lva) {
    throw new FedegolfError(
      'no_disponible',
      'no se pudo obtener PHPSESSID/lva para el login de página'
    )
  }

  // Paso 2: login de página (form POST a la raíz)
  const loginRes = await fedegolfFetch(`${BASE_URL}/`, {
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
