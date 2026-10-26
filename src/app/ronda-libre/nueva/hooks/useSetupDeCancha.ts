'use client'

import { useEffect, useState } from 'react'
import { captureError } from '@/lib/error-tracking'
import {
  fetchSetupDeCancha,
  SETUP_DE_CANCHA_VACIO,
  type SetupDeCancha,
} from '@/lib/data/ronda-libre-nueva'

interface Args {
  courseId: string | null
}

export interface EstadoDeCancha extends SetupDeCancha {
  /** Recorridos elegidos por el usuario (canchas 27/36h). */
  recorridosElegidos: string[]
  setRecorridosElegidos: (recorridos: string[]) => void
  cargando: boolean
}

/**
 * Trae detalles, tees y recorridos de la cancha elegida, y mantiene la selección
 * de recorridos coherente con ella.
 *
 * Al cambiar de cancha se limpia TODO antes de pedir lo nuevo: si quedaran los
 * recorridos de la cancha anterior, el submit los mandaría como `recorridos` de
 * una cancha que no los tiene y la ronda se crearía con hoyos inventados.
 */
export function useSetupDeCancha({ courseId }: Args): EstadoDeCancha {
  const [setup, setSetup] = useState<SetupDeCancha>(SETUP_DE_CANCHA_VACIO)
  const [recorridosElegidos, setRecorridosElegidos] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!courseId) {
      setSetup(SETUP_DE_CANCHA_VACIO)
      setRecorridosElegidos([])
      setCargando(false)
      return
    }

    let cancelado = false
    setCargando(true)

    fetchSetupDeCancha(courseId)
      .then(nuevo => {
        if (cancelado) return
        setSetup(nuevo)
        // Por defecto se juegan los dos primeros recorridos: son los 18 hoyos
        // más comunes de la cancha y dejan al usuario con una ronda válida sin
        // tener que elegir. Con menos de dos no hay combinación posible.
        setRecorridosElegidos(
          nuevo.loops.length >= 2 ? nuevo.loops.slice(0, 2).map(l => l.recorrido) : [],
        )
      })
      .catch(err => {
        if (cancelado) return
        captureError(err, { context: 'ronda-libre.nueva.setup-cancha', meta: { courseId } })
        setSetup(SETUP_DE_CANCHA_VACIO)
        setRecorridosElegidos([])
      })
      .finally(() => { if (!cancelado) setCargando(false) })

    return () => { cancelado = true }
  }, [courseId])

  return { ...setup, recorridosElegidos, setRecorridosElegidos, cargando }
}
