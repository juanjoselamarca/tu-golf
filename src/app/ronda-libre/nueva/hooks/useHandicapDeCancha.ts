'use client'

import { useEffect, useRef, useState } from 'react'
import { captureError } from '@/lib/error-tracking'
import { cargarCourseData, resolverCourseHandicap, type CourseData } from '@/golf/core/course-handicap'

interface Args {
  courseId: string | null
  /** Par publicado por la cancha. `null` si todavía no se cargó. */
  parTotal: number | null
  /** Hoyos que juega la ronda que se está creando. */
  holes: number
  /** Recorridos elegidos en canchas 27/36h. Vacío en cancha simple. */
  recorridos: string[]
  /** Tees que hay que poder cotizar: el global de la ronda y los de cada jugador. */
  teesEnJuego: string[]
}

export interface HandicapDeCancha {
  /**
   * Golpes que recibe un jugador de este índice desde este tee, o `null` si
   * todavía no se puede saber (sin índice, sin cancha, o el dato aún cargando).
   */
  golpesDe: (indice: number | null | undefined, tee: string | null | undefined) => number | null
}

/**
 * Golpes que va a repartir la ronda que se está creando, calculados por el
 * MISMO motor que va a usar el marcador.
 *
 * Antes el asistente calculaba `round(índice × slope/113 + (CR − par))` inline,
 * tres veces, con el par de 18 hoyos de la cancha. Dos consecuencias:
 *
 *  - Una ronda de 9 hoyos mostraba el handicap de 18 — el doble de golpes que
 *    los que el marcador iba a repartir. El organizador armaba el match con un
 *    número y jugaba con otro.
 *  - Sin el guardarrail de `rating-coherente`, una cancha con el rating cargado
 *    en la escala equivocada (C.G. Río Blanco: par 35, rating 55) mostraba +26
 *    golpes en la pantalla de confirmación.
 *
 * Ahora la previsualización pasa por `cargarCourseData` + `resolverCourseHandicap`,
 * que son los que usa el scorer: el número que se ve al crear la ronda es el
 * número con el que se juega.
 */
export function useHandicapDeCancha({
  courseId,
  parTotal,
  holes,
  recorridos,
  teesEnJuego,
}: Args): HandicapDeCancha {
  /**
   * Lo ya cargado, en un ref y no en estado.
   *
   * La clave lleva TODO lo que cambia el CourseData, no sólo el tee: al pasar
   * de 18 a 9 hoyos hay que volver a preguntar, o la vista sigue mostrando los
   * golpes de la ronda de 18 — el doble.
   *
   * El ref es lo que hace que esto funcione. Con la caché en estado, el efecto
   * que la limpiaba y el que la llenaba corrían en el mismo commit: el segundo
   * leía la caché VIEJA, concluía que no faltaba nada, y después el primero la
   * vaciaba. Nadie volvía a pedir el dato y el HCP no aparecía nunca.
   */
  const cache = useRef(new Map<string, CourseData | null>())
  const [version, setVersion] = useState(0)

  const claveDeCancha = `${courseId}|${holes}|${parTotal ?? ''}|${[...recorridos].sort().join(',')}`

  // Nombres normalizados y sin repetir: varios jugadores comparten tee y no hay
  // que pedir el mismo dato una vez por jugador.
  const tees = Array.from(new Set(teesEnJuego.filter(Boolean).map(t => t.toLowerCase()))).sort()
  const listaDeTees = tees.join(',')

  useEffect(() => {
    if (!courseId || tees.length === 0) return

    const faltan = tees.filter(tee => !cache.current.has(`${claveDeCancha}|${tee}`))
    if (faltan.length === 0) return

    let cancelado = false

    Promise.all(
      faltan.map(async tee => {
        try {
          const data = await cargarCourseData(
            courseId,
            tee,
            holes,
            parTotal ?? undefined,
            recorridos.length > 0 ? recorridos : null,
          )
          return [tee, data] as const
        } catch (err) {
          captureError(err, {
            context: 'ronda-libre.nueva.course-data',
            meta: { courseId, tee, holes },
          })
          // `null` = sin datos de cancha. `resolverCourseHandicap` cae al camino
          // seguro (el índice, la mitad en 9 hoyos) y muestra un número honesto.
          // Dejar la clave sin escribir escondería el HCP para siempre.
          return [tee, null] as const
        }
      }),
    ).then(cargados => {
      if (cancelado) return
      for (const [tee, data] of cargados) cache.current.set(`${claveDeCancha}|${tee}`, data)
      setVersion(v => v + 1)
    })

    return () => { cancelado = true }
    // `tees` se compara por su versión serializada: el array se reconstruye en
    // cada render y como dependencia dispararía el efecto sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, claveDeCancha, listaDeTees])

  const golpesDe = (indice: number | null | undefined, tee: string | null | undefined): number | null => {
    if (indice == null || !courseId) return null
    const clave = `${claveDeCancha}|${(tee || '').toLowerCase()}`
    if (!cache.current.has(clave)) return null
    return resolverCourseHandicap(indice, cache.current.get(clave) ?? null, holes)
  }

  // `version` sólo existe para que el render siguiente lea la caché ya llena.
  void version

  return { golpesDe }
}
