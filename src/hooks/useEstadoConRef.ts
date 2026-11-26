'use client'

import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

/**
 * `useState` con una ref que va SIEMPRE al día con el último valor pedido, no con el último pintado.
 *
 * El setter calcula el valor siguiente desde la ref (también con updater), escribe la ref en el acto y después se lo
 * pasa a React. Quien lea la ref entre un `set` y el render (un segundo toque, un evento que llega antes del efecto)
 * ve lo nuevo. Una ref sincronizada con un `useEffect` llega tarde justo ahí: el scorer perdía el par que «Siguiente»
 * acababa de rellenar si el siguiente toque llegaba antes del efecto (revisión Fable, PR #888).
 *
 * Regla: TODA escritura pasa por este setter. El updater recibe la ref, así que debe ser puro (puede correr una vez).
 */
export function useEstadoConRef<T>(inicial: T): [T, Dispatch<SetStateAction<T>>, Readonly<MutableRefObject<T>>] {
  const [estado, setEstado] = useState<T>(inicial)
  const ref = useRef<T>(inicial)
  const set = useCallback<Dispatch<SetStateAction<T>>>((cambio) => {
    const siguiente = typeof cambio === 'function' ? (cambio as (prev: T) => T)(ref.current) : cambio
    ref.current = siguiente
    setEstado(siguiente)
  }, [])
  return [estado, set, ref]
}
