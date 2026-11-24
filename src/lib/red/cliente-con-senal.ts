import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * El mismo cliente de Supabase, pero cada consulta a PostgREST (`from(...).select/insert/update/upsert/delete` y
 * `rpc`) sale con `signal`: al abortarlo se cancela el fetch de verdad. Sirve para pasarle a una función de
 * `src/lib/data/` (y a todo lo que esa llame) una lectura cancelable sin cambiar su firma: la señal viaja con el
 * cliente. Con `conPlazoCancelable` (`@/lib/red/con-timeout`), el plazo vencido aborta la lectura.
 *
 * `auth`, `storage`, `channel` y el resto pasan tal cual (el fetch de Auth no acepta señal).
 * Un cliente sin `from`/`rpc` (dobles de test que solo traen `auth`) también pasa tal cual.
 */
const METODOS_DE_CONSULTA = new Set(['select', 'insert', 'update', 'upsert', 'delete'])

type ConAbortSignal = { abortSignal: (s: AbortSignal) => unknown }
const conSenal = <B,>(builder: B, signal: AbortSignal): B =>
  builder && typeof (builder as unknown as ConAbortSignal).abortSignal === 'function'
    ? ((builder as unknown as ConAbortSignal).abortSignal(signal) as B)
    : builder

export function clienteConSenal<C extends Pick<SupabaseClient, 'from' | 'rpc'>>(cliente: C, signal: AbortSignal): C {
  return new Proxy(cliente, {
    get(objetivo, prop, receptor) {
      const valor = Reflect.get(objetivo, prop, receptor)
      if (typeof valor !== 'function') return valor
      if (prop === 'rpc') {
        return (...args: unknown[]) => conSenal((valor as (...a: unknown[]) => unknown).apply(objetivo, args), signal)
      }
      if (prop === 'from') {
        return (...args: unknown[]) => {
          const consulta = (valor as (...a: unknown[]) => object).apply(objetivo, args)
          return new Proxy(consulta, {
            get(q, p, r) {
              const metodo = Reflect.get(q, p, r)
              if (typeof metodo !== 'function' || !METODOS_DE_CONSULTA.has(String(p))) return metodo
              return (...a: unknown[]) => conSenal((metodo as (...x: unknown[]) => unknown).apply(q, a), signal)
            },
          })
        }
      }
      return (valor as (...a: unknown[]) => unknown).bind(objetivo)
    },
  })
}
