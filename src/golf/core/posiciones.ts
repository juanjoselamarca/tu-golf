/**
 * Etiquetas de posición de una tabla de posiciones, con empates al estilo del
 * golf profesional: "1", "T2", "T2", "4".
 *
 * Fuente ÚNICA del concepto (decisión de producto 10-nov-2026: "T2" y "T2", y el
 * siguiente en 4; no "2 y 2" sin T). Toda tabla que numere filas por score pasa
 * por acá; ninguna escribe `idx + 1`.
 *
 * Qué es un empate lo decide el CALLER con `mismoScore`, y tiene que ser el
 * criterio de golf que aplica esa tabla:
 *  - en vivo, mismo score (vs par, o puntos en Stableford) = empate;
 *  - si la tabla ya desempató por countback (`src/golf/core/countback.ts`), los
 *    que el countback separó NO están empatados (ver `claveEmpate` en
 *    `src/golf/leaderboard/rank-entries.ts`);
 *  - un desempate cosmético (el nombre, los hoyos jugados) NO separa: sólo
 *    estabiliza el orden en pantalla.
 *
 * Contrato:
 *  - `filas` llega YA ORDENADA (mejor primero). Sólo se comparan filas
 *    consecutivas que compiten: en una lista ordenada el empate es transitivo.
 *  - `mismoScore(anterior, actual)` dice si `actual` empata con la fila que
 *    compite inmediatamente arriba de ella.
 *  - `sinPosicion(fila)` (opcional): la fila no compite todavía (0 hoyos
 *    jugados). Su etiqueta es `null`, no consume un lugar ni empata con nadie.
 *    Por convención esas filas van al final; si alguna quedara en medio, las de
 *    abajo igual se numeran sólo por las que sí compiten.
 *
 * El lugar de una fila es 1 + la cantidad de filas que compiten arriba de su
 * grupo de empate (por eso, después de dos en T2 viene el 4, no el 3).
 */
export function etiquetasDePosicion<T>(
  filas: readonly T[],
  mismoScore: (anterior: T, actual: T) => boolean,
  opciones: { sinPosicion?: (fila: T) => boolean } = {},
): (string | null)[] {
  const { sinPosicion } = opciones
  const lugar: (number | null)[] = []
  const empatada: boolean[] = []
  let compitiendo = 0
  let anterior = -1 // índice de la última fila que compite

  for (let i = 0; i < filas.length; i++) {
    empatada.push(false)
    if (sinPosicion?.(filas[i])) {
      lugar.push(null)
      continue
    }
    compitiendo++
    const empataArriba = anterior >= 0 && mismoScore(filas[anterior], filas[i])
    lugar.push(empataArriba ? lugar[anterior] : compitiendo)
    if (empataArriba) {
      empatada[anterior] = true
      empatada[i] = true
    }
    anterior = i
  }

  return lugar.map((l, i) => (l == null ? null : empatada[i] ? `T${l}` : String(l)))
}

/**
 * Atajo para tablas cuyo motor ya emite la clave de empate de cada fila (p. ej.
 * `Player.claveEmpate` de `rankEntries`): misma clave = empatados; clave `null`
 * = no compite todavía (sin posición).
 */
export function etiquetasPorClaveDeEmpate<T>(
  filas: readonly T[],
  clave: (fila: T) => string | null | undefined,
): (string | null)[] {
  return etiquetasDePosicion(filas, (a, b) => clave(a) === clave(b), {
    sinPosicion: (f) => clave(f) == null,
  })
}

/**
 * Etiquetas con la clave de empate del motor y, si alguna fila no la trae, por score.
 *
 * La clave viaja en respuestas cacheadas (/api/en-vivo, la ruta en vivo del torneo). Una
 * respuesta generada antes de que existiera llega sin ella (`undefined`): en vez de mostrar
 * "—" para todos, se calcula por score consecutivo como antes del countback. `null` en la
 * clave sigue siendo "sin posición".
 */
export function etiquetasConRespaldo<T>(
  filas: readonly T[],
  clave: (fila: T) => string | null | undefined,
  mismoScore: (anterior: T, actual: T) => boolean,
  sinPosicion: (fila: T) => boolean,
): (string | null)[] {
  if (filas.every((f) => clave(f) !== undefined)) return etiquetasPorClaveDeEmpate(filas, clave)
  return etiquetasDePosicion(filas, mismoScore, { sinPosicion })
}

/** ¿La etiqueta es el primer lugar, solo o empatado ("1" o "T1")? Para resaltar al líder. */
export function esPrimerLugar(etiqueta: string | null | undefined): boolean {
  return etiqueta === '1' || etiqueta === 'T1'
}

/** Número del lugar de una etiqueta ("T2" → 2), para medallas de podio. null si no tiene. */
export function lugarDeEtiqueta(etiqueta: string | null | undefined): number | null {
  if (!etiqueta) return null
  const n = Number(etiqueta.startsWith('T') ? etiqueta.slice(1) : etiqueta)
  return Number.isInteger(n) && n > 0 ? n : null
}
