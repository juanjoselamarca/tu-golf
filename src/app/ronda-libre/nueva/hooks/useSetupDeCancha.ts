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

/** Lo cargado, amarrado a la cancha para la que se pidió. */
interface Cargado {
  courseId: string
  setup: SetupDeCancha
}

/**
 * Trae detalles, tees y recorridos de la cancha elegida, y mantiene la selección
 * de recorridos coherente con ella.
 *
 * Lo cargado queda amarrado a su `courseId` y sólo se entrega si coincide con
 * la cancha elegida AHORA. Así, desde el mismo render en que cambia la cancha,
 * nadie ve los tees ni los recorridos de la anterior: ni el submit (que los
 * mandaría como `recorridos` de una cancha que no los tiene) ni la corrección
 * de tees, que validaría el tee de la ronda nueva contra la cancha vieja y lo
 * pisaría antes de que llegue la buena. Limpiar en el efecto no alcanza: los
 * demás efectos de ese mismo render ya leyeron el valor viejo.
 */
export function useSetupDeCancha({ courseId }: Args): EstadoDeCancha {
  const [cargado, setCargado] = useState<Cargado | null>(null)
  const [recorridosElegidos, setRecorridosElegidos] = useState<string[]>([])

  useEffect(() => {
    if (!courseId) return

    let cancelado = false
    fetchSetupDeCancha(courseId)
      .then(nuevo => {
        if (cancelado) return
        setCargado({ courseId, setup: nuevo })
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
        setCargado({ courseId, setup: SETUP_DE_CANCHA_VACIO })
        setRecorridosElegidos([])
      })

    return () => { cancelado = true }
  }, [courseId])

  const vigente = courseId !== null && cargado?.courseId === courseId
  return {
    ...(vigente ? cargado.setup : SETUP_DE_CANCHA_VACIO),
    recorridosElegidos: vigente ? recorridosElegidos : [],
    setRecorridosElegidos,
    cargando: courseId !== null && !vigente,
  }
}
