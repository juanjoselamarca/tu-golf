/**
 * Fuente única del acceso HTTP a fedegolf.cl.
 *
 * Todo request pasa por `fedegolfFetch`: timeout fijo y fallas traducidas a un
 * `FedegolfError` con `kind`, para que quien llama distinga "FedeGolf no
 * responde" (transitorio, se reintenta) de "credenciales rechazadas" (el usuario
 * debe reconectar). Antes cualquier throw se trataba como clave mala y un corte
 * de fedegolf.cl desvinculaba al usuario en silencio.
 */

export const FEDEGOLF_BASE_URL = 'https://www.fedegolf.cl'
export const FEDEGOLF_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
export const FEDEGOLF_TIMEOUT_MS = 10_000

export type FedegolfErrorKind = 'credenciales' | 'no_disponible' | 'respuesta_inesperada'

export class FedegolfError extends Error {
  readonly kind: FedegolfErrorKind
  constructor(kind: FedegolfErrorKind, message: string) {
    super(`fedegolf(${kind}): ${message}`)
    this.name = 'FedegolfError'
    this.kind = kind
  }
}

export function esFedegolfError(err: unknown, kind?: FedegolfErrorKind): err is FedegolfError {
  return err instanceof FedegolfError && (kind === undefined || err.kind === kind)
}

export async function fedegolfFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(FEDEGOLF_TIMEOUT_MS) })
  } catch (err) {
    const motivo = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    throw new FedegolfError('no_disponible', `sin respuesta de ${url} (${motivo})`)
  }
  if (res.status >= 500) {
    throw new FedegolfError('no_disponible', `${url} respondió ${res.status}`)
  }
  return res
}
