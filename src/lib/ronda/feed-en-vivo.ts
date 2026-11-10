/**
 * FUENTE ÚNICA de lo que escribe la tarjeta del feed público (`/en-vivo`) sobre el
 * formato y el score de una ronda.
 *
 * El feed (`/api/en-vivo`) es público y el CDN lo cachea igual para todos, así que
 * sólo lleva golpes BRUTOS (decisión de Juanjo, 08-oct-2026; `vistaPublica`). En una
 * ronda NETO eso es la "clasificación bruta", y la tarjeta tiene que decirlo: el chip
 * ("Stroke Play · bruto") y cada score con "Gross" delante, como la tarjeta de equipo
 * del scorer ("Gross +9 · 45"). Sin eso, "+7 en 12 hoyos" en una ronda Stroke Play
 * Neto se leía como el neto (lo marcó el revisor de RRSS, 09-nov-2026).
 */
import { formatLabel } from '@/golf/core/rules'
import { formatVsPar } from '@/golf/share/vs-par'
import { formatPuntosStableford } from '@/golf/leaderboard/formato-score'
import { COPY_CHIP_BRUTO, COPY_SCORE_BRUTO } from '@/lib/vista-publica-copy'
import { etiquetasDePosicion } from '@/golf/core/posiciones'

/** Lo que la tarjeta necesita saber de una ronda del feed. */
export interface RondaDelFeed {
  formato_juego: string
  /** false en Stableford neto: sin puntos, golpes brutos. */
  muestra_puntos?: boolean
  /** true = ronda NETO publicada en bruto (`vistaPublica(...).soloBruto`, decidido en el servidor). */
  clasificacion_bruta?: boolean
}

/**
 * ¿Lo que se publica es la clasificación bruta de una ronda neto? Lo decide el
 * servidor (`clasificacion_bruta`). Si el campo falta (respuesta cacheada en el CDN
 * de antes de publicarse), se deduce lo único deducible: Stableford sin puntos.
 */
export function esClasificacionBruta(ronda: RondaDelFeed): boolean {
  return ronda.clasificacion_bruta ?? (ronda.formato_juego === 'stableford' && ronda.muestra_puntos === false)
}

/** ¿La ronda publica puntos Stableford? Sólo Stableford GROSS (`muestra_puntos`). */
export function publicaPuntos(ronda: RondaDelFeed): boolean {
  return ronda.formato_juego === 'stableford' && ronda.muestra_puntos !== false
}

/** Chip de formato de la tarjeta: "<Formato> · bruto" cuando se publica la clasificación bruta. */
export function chipDeFormato(ronda: RondaDelFeed): string {
  const formato = formatLabel(ronda.formato_juego)
  return esClasificacionBruta(ronda) ? `${formato} · ${COPY_CHIP_BRUTO}` : formato
}

export interface ScoreDeLaFila {
  /** "Gross" delante del vs par en la clasificación bruta; null cuando no hay nada que aclarar. */
  etiqueta: string | null
  /** Puntos Stableford ("19 pts") o resultado vs par ("+7", "E"). */
  valor: string
}

/** Cómo se escribe el score de una fila del feed, con el mismo criterio con que se ordena. */
export function scoreDeLaFila(ronda: RondaDelFeed, fila: { vsPar: number; stablefordPts: number | null }): ScoreDeLaFila {
  if (publicaPuntos(ronda) && fila.stablefordPts != null) {
    return { etiqueta: null, valor: formatPuntosStableford(fila.stablefordPts, { conUnidad: true }) }
  }
  return { etiqueta: esClasificacionBruta(ronda) ? COPY_SCORE_BRUTO : null, valor: formatVsPar(fila.vsPar) }
}

/** Lo que la tarjeta necesita de cada jugador para ordenarlo y numerarlo. */
export interface JugadorDelFeed {
  nombre: string
  holesCompleted: number
  vsPar: number
  stablefordPts: number | null
}

/**
 * Filas de la tarjeta en orden, cada una con su posición estilo golf ("1", "T2",
 * "T2", "4"; `null` = sin hoyos jugados, sin posición).
 *
 * Orden: los que jugaron primero, por puntos (Stableford que publica puntos) o
 * por vs par; dentro de un mismo score, por NOMBRE. El nombre sólo estabiliza el
 * orden entre refrescos (sin él, el orden de llegada del feed hacía bailar las
 * filas): NO desempata. Dos jugadores con el mismo score comparten posición. En
 * vivo no hay countback: las tarjetas no están terminadas.
 */
export function filasDeLaTarjeta<J extends JugadorDelFeed>(
  ronda: RondaDelFeed,
  jugadores: readonly J[],
): { jugador: J; posicion: string | null }[] {
  const porPuntos = publicaPuntos(ronda)
  const score = (j: J) => (porPuntos ? -(j.stablefordPts ?? 0) : j.vsPar) // menor = mejor
  const sinHoyos = (j: J) => j.holesCompleted === 0
  const ordenados = [...jugadores].sort((a, b) => {
    if (sinHoyos(a) !== sinHoyos(b)) return sinHoyos(a) ? 1 : -1
    if (!sinHoyos(a)) {
      const porScore = score(a) - score(b)
      if (porScore !== 0) return porScore
    }
    return (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es', { sensitivity: 'base' })
  })
  const posiciones = etiquetasDePosicion(ordenados, (a, b) => score(a) === score(b), { sinPosicion: sinHoyos })
  return ordenados.map((jugador, i) => ({ jugador, posicion: posiciones[i] }))
}
