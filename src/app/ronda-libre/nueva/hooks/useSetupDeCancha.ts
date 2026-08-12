'use client'

import { useEffect, useState } from 'react'
import { captureError } from '@/lib/error-tracking'
import {
  fetchSetupDeCancha,
  SETUP_DE_CANCHA_VACIO,
  type SetupDeCancha,
} from '@/lib/data/ronda-libre-nueva'

/** Tee que se preselecciona cuando la cancha no publica ninguno. */
export const TEE_POR_DEFECTO = 'blanco'

interface Args {
  courseId: string | null
  /** Se llama con el tee a preseleccionar cuando llegan los tees de la cancha. */
  onTeeSugerido: (tee: string) => void
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
export function useSetupDeCancha({ courseId, onTeeSugerido }: Args): EstadoDeCancha {
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
        if (nuevo.tees.length > 0) {
          const blanco = nuevo.tees.find(t => t.nombre.toLowerCase() === TEE_POR_DEFECTO)
          onTeeSugerido(blanco ? TEE_POR_DEFECTO : nuevo.tees[0].nombre.toLowerCase())
        }
      })
      .catch(err => {
        if (cancelado) return
        captureError(err, { context: 'ronda-libre.nueva.setup-cancha', meta: { courseId } })
        setSetup(SETUP_DE_CANCHA_VACIO)
        setRecorridosElegidos([])
      })
      .finally(() => { if (!cancelado) setCargando(false) })

    return () => { cancelado = true }
    // `onTeeSugerido` fuera de las deps a propósito: es un setter estable del
    // formulario, pero incluirlo obligaría a cada caller a memoizarlo y una
    // referencia nueva volvería a pedir la cancha entera en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  return { ...setup, recorridosElegidos, setRecorridosElegidos, cargando }
}
