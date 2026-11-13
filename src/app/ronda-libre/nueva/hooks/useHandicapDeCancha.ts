'use client'

import { useEffect, useRef, useState } from 'react'
import { captureError } from '@/lib/error-tracking'
import {
  cargarCourseData,
  cargarCourseDataParaMostrar,
  resolverCourseHandicap,
  resolverCourseHandicapDisplay,
  type CourseData,
} from '@/golf/core/course-handicap'

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

type PorIndiceYTee = (indice: number | null | undefined, tee: string | null | undefined) => number | null

export interface HandicapDeCancha {
  /**
   * Golpes que recibe un jugador de este índice desde este tee EN ESTA RONDA
   * (en 9 hoyos, los de 9), o `null` si todavía no se puede saber (sin índice,
   * sin cancha, o el dato aún cargando). Para CALCULAR (la ventaja del match),
   * nunca para el rótulo "HCP".
   */
  golpesDe: PorIndiceYTee
  /**
   * El handicap que se MUESTRA ("HCP 15"): siempre el de 18 hoyos, aunque la
   * ronda sea de 9 (regla de Juanjo, 12-nov-2026: un HCP partido en 2 pierde
   * significado). Mismo cálculo que la vista en vivo y el scorer
   * (`resolverCourseHandicapDisplay`), así el número no cambia al crear la ronda.
   */
  hcpVisibleDe: PorIndiceYTee
}

/** Lo que se carga por tee: el CourseData con que se puntúa y el de 18h para mostrar. */
interface DatosDelTee {
  deLaRonda: CourseData | null
  paraMostrar: CourseData | null
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
 * que son los que usa el scorer: los golpes que se anuncian son los que se juegan.
 *
 * Lo que se MUESTRA como "HCP" es otra cosa (12-nov-2026): siempre el de 18 hoyos,
 * igual que en la vista en vivo. El arreglo de arriba había dejado el rótulo con
 * los golpes de 9 (la mitad), y la misma persona veía "HCP 8" al crear la ronda
 * y "HCP 15" en el marcador (inbox 2afd0036). Por eso hay dos funciones:
 * `golpesDe` para calcular y `hcpVisibleDe` para el rótulo.
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
  const cache = useRef(new Map<string, DatosDelTee>())
  /** CourseData de 18h por cancha y tee: lo llena `cargarCourseDataParaMostrar`. */
  const cache18h = useRef(new Map<string, CourseData | null>())
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
        let deLaRonda: CourseData | null = null
        try {
          deLaRonda = await cargarCourseData(
            courseId,
            tee,
            holes,
            parTotal ?? undefined,
            recorridos.length > 0 ? recorridos : null,
          )
        } catch (err) {
          captureError(err, {
            context: 'ronda-libre.nueva.course-data',
            meta: { courseId, tee, holes },
          })
          // `null` = sin datos de cancha. `resolverCourseHandicap` cae al camino
          // seguro (el índice, la mitad en 9 hoyos) y muestra un número honesto.
          // Dejar la clave sin escribir escondería el HCP para siempre.
        }
        let paraMostrar: CourseData | null = null
        try {
          paraMostrar = await cargarCourseDataParaMostrar(
            deLaRonda,
            { courseId, tee, finalParTotal: parTotal ?? undefined, tieneRecorridos: recorridos.length > 0 },
            cache18h.current,
            cargarCourseData,
          )
        } catch (err) {
          captureError(err, {
            context: 'ronda-libre.nueva.course-data-18h',
            meta: { courseId, tee, holes },
          })
          // Sin el dato de 18h se muestra el índice entero: nunca la mitad.
        }
        return [tee, { deLaRonda, paraMostrar }] as const
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

  const datosDe = (indice: number | null | undefined, tee: string | null | undefined): DatosDelTee | null => {
    if (indice == null || !courseId) return null
    return cache.current.get(`${claveDeCancha}|${(tee || '').toLowerCase()}`) ?? null
  }

  const golpesDe: PorIndiceYTee = (indice, tee) => {
    const datos = datosDe(indice, tee)
    return datos && indice != null ? resolverCourseHandicap(indice, datos.deLaRonda, holes) : null
  }

  const hcpVisibleDe: PorIndiceYTee = (indice, tee) => {
    const datos = datosDe(indice, tee)
    return datos && indice != null ? resolverCourseHandicapDisplay(indice, datos.deLaRonda, datos.paraMostrar) : null
  }

  // `version` sólo existe para que el render siguiente lea la caché ya llena.
  void version

  return { golpesDe, hcpVisibleDe }
}
