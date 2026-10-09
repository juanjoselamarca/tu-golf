// FUENTE ÚNICA de "pedir JSON a una ruta en vivo sin quedarse colgado".
// La usan el espectador de ronda libre (/live, /hcp) y el de torneo (/live, /neto).

import { conTimeout } from '@/lib/red/con-timeout'

/** Una consulta colgada (base o red lenta) no puede bloquear el polling: se corta a los 8 s. */
export const TIMEOUT_EN_VIVO_MS = 8_000

/** El servidor respondió 2xx pero el cuerpo no es JSON: es un `error`, no un corte de red. */
export class JsonInvalidoError extends Error {}

/**
 * `fetch` + lectura del CUERPO bajo UN solo plazo: fuente única `conTimeout`
 * (red/con-timeout.ts) + un AbortController propio que se aborta si vence. El plazo
 * cubre también el cuerpo: con 4G degradado llegan los headers y el cuerpo queda a
 * medias; si sólo se cubrieran los headers, `res.json()` colgaría el polling para
 * siempre (useLivePoll espera la consulta en curso). Sin `AbortSignal.timeout`, que
 * no existe en iOS 15. El cuerpo sólo se lee si `res.ok`.
 *
 * Lanza `JsonInvalidoError` si el cuerpo no es JSON; cualquier otra excepción es de
 * red o de plazo.
 */
export async function fetchJsonConPlazo(url: string, init: RequestInit): Promise<{ res: Response; json: unknown }> {
  const control = new AbortController()
  const tarea = (async () => {
    const res = await fetch(url, { ...init, signal: control.signal })
    if (!res.ok) {
      // Cuerpo que no se va a leer (401/404/5xx): se descarta para liberar la conexión
      // (si no, queda abierta hasta que el GC la recoja).
      void res.body?.cancel().catch(() => {})
      return { res, json: undefined }
    }
    const texto = await res.text()
    try {
      return { res, json: JSON.parse(texto) as unknown }
    } catch {
      throw new JsonInvalidoError('Respuesta no es JSON')
    }
  })()
  try {
    return await conTimeout(tarea, TIMEOUT_EN_VIVO_MS)
  } catch (e) {
    control.abort()
    throw e
  }
}
