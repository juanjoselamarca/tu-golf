/**
 * FUENTE ÚNICA de "no esperar más de N ms a la red".
 *
 * Caída del 04-oct-2026 (torneo Los Leones): con la base saturada, PostgREST
 * respondía en 20-80 s. Un `await` sin plazo deja la pantalla colgada; con plazo,
 * el que llama decide (respaldo local, reintento) en segundos.
 *
 * La promesa original NO se cancela: si termina tarde, su resultado se descarta.
 * Usar sólo en operaciones idempotentes (los guardados de score lo son: el
 * servidor mergea `scores || delta`). Para una LECTURA que sí debe cancelarse al
 * vencer, `conPlazoCancelable` (abajo).
 *
 * Pendiente migrar las copias privadas `withTimeout` de `src/lib/ai/gateway.ts`
 * y `src/golf/coach/v3/retrieval/contextual-rerank.ts`.
 */
export class TiempoAgotadoError extends Error {
  constructor(ms: number) {
    super(`Sin respuesta del servidor en ${Math.round(ms / 1000)} s`)
    this.name = 'TiempoAgotadoError'
  }
}

export function conTimeout<T>(promesa: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const plazo = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TiempoAgotadoError(ms)), ms)
  })
  return Promise.race([Promise.resolve(promesa), plazo]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Como `conTimeout`, pero la lectura SÍ se cancela: `leer` recibe un `AbortSignal` que se aborta cuando vence el
 * plazo (o cuando se aborta `opciones.signal`, la del que llama: p. ej. la vuelta de lectura de una pantalla que se
 * desmontó). Con el cliente de Supabase, la señal llega al fetch con `clienteConSenal` (`@/lib/red/cliente-con-senal`)
 * o con `.abortSignal(signal)` en la consulta. Así una lectura vencida no sigue ocupando la conexión (con mala señal,
 * los reintentos se apilaban) ni puede contestar tarde.
 *
 * Rechaza con `TiempoAgotadoError` al vencer y con `LecturaCanceladaError` si la canceló el que llama. Sin
 * `AbortSignal.timeout` ni `AbortSignal.any`, que no existen en iOS 15.
 */
export class LecturaCanceladaError extends Error {
  constructor() {
    super('Lectura cancelada')
    this.name = 'LecturaCanceladaError'
  }
}

export function conPlazoCancelable<T>(
  leer: (signal: AbortSignal) => PromiseLike<T>,
  ms: number,
  opciones: { signal?: AbortSignal } = {},
): Promise<T> {
  const padre = opciones.signal
  if (padre?.aborted) return Promise.reject(new LecturaCanceladaError())
  const control = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let alAbortarPadre: (() => void) | undefined
  const corte = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new TiempoAgotadoError(ms)); control.abort() }, ms)
    if (padre) {
      alAbortarPadre = () => { reject(new LecturaCanceladaError()); control.abort() }
      padre.addEventListener('abort', alAbortarPadre, { once: true })
    }
  })
  let lectura: Promise<T>
  try {
    lectura = Promise.resolve(leer(control.signal))
  } catch (e) {
    lectura = Promise.reject(e)
  }
  return Promise.race([lectura, corte]).finally(() => {
    if (timer) clearTimeout(timer)
    if (padre && alAbortarPadre) padre.removeEventListener('abort', alAbortarPadre)
  })
}
