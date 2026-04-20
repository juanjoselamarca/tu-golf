import { useEffect, useState, useRef } from 'react'

/**
 * Countdown reactivo que tickea cada 1s desde `initial` hasta 0, luego
 * invoca `onExpire` y reinicia a `initial`. Un único setInterval interno.
 *
 * Extraído de src/app/ronda-libre/[codigo]/page.tsx (T10 Sprint 1).
 * Consolida dos useEffects previos (polling 15s + tick 1s) en una API
 * declarativa. Sprint 2 reemplazará al `onExpire` con una suscripción
 * Supabase Realtime (el hook se removerá en su punto de uso actual).
 *
 * Reinicios: cambios en `initial` o `enabled` reinician el countdown a
 * `initial`. Cambios en `onExpire` NO reinician (ref interna).
 *
 * @param initial  Valor desde el que tickea (en segundos).
 * @param onExpire Callback disparado cuando llega a 0. No necesita ser
 *                 estable — el hook mantiene una ref interna y siempre
 *                 invoca la última versión pasada.
 * @param enabled  Si es false, el intervalo no corre y el countdown queda
 *                 fijo en `initial`. Útil para activar solo en ciertos roles.
 */
export function useCountdown(initial: number, onExpire: () => void, enabled: boolean = true): number {
  const [value, setValue] = useState(initial)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    if (!enabled) return
    setValue(initial)
    const id = setInterval(() => {
      setValue(v => {
        if (v <= 1) {
          onExpireRef.current()
          return initial
        }
        return v - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [initial, enabled])

  return value
}
