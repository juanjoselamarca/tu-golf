// FUENTE ÚNICA de "pedir JSON sin quedarse colgado" (plazo sobre fetch Y cuerpo).
// La usan el espectador de ronda libre (/live, /hcp), el de torneo (/live, /neto) y
// el banner de estado (/api/health). Cada uno decide su plazo.

import { conTimeout } from '@/lib/red/con-timeout'

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
export async function fetchJsonConPlazo(
  url: string,
  init: RequestInit,
  ms: number,
  /**
   * `leerCuerpoSiNoOk`: leer también el cuerpo de una respuesta no-ok (p. ej. un 409
   * con `{ error: 'already_registered' }`). Por defecto no se lee y se cancela.
   */
  opciones: { leerCuerpoSiNoOk?: boolean } = {},
): Promise<{ res: Response; json: unknown }> {
  const control = new AbortController()
  const tarea = (async () => {
    const res = await fetch(url, { ...init, signal: control.signal })
    // 204/205 no traen cuerpo.
    if (res.status === 204 || res.status === 205) return { res, json: null }
    if (!res.ok && !opciones.leerCuerpoSiNoOk) {
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
    return await conTimeout(tarea, ms)
  } catch (e) {
    control.abort()
    throw e
  }
}
