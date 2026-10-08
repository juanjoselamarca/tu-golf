/**
 * FUENTE ÚNICA de "no esperar más de N ms a la red".
 *
 * Caída del 04-oct-2026 (torneo Los Leones): con la base saturada, PostgREST
 * respondía en 20-80 s. Un `await` sin plazo deja la pantalla colgada; con plazo,
 * el que llama decide (respaldo local, reintento) en segundos.
 *
 * La promesa original NO se cancela: si termina tarde, su resultado se descarta.
 * Usar sólo en operaciones idempotentes (los guardados de score lo son: el
 * servidor mergea `scores || delta`).
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
