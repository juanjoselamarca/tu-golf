/**
 * Fetch + parseo de las ~20 tarjetas que componen el índice del socio, desde
 * `listadoMejoresPalos.php` (requiere sesión de PÁGINA — ver `fedegolfPageLogin`).
 *
 * Reglas (spec 2026-07-21, D2/D3/D7):
 * - Campeonato: el trofeo (`fa-trophy`) marca `valeDoble`; el par aparece como 2
 *   filas (una con ticket, una sin). La sin ticket es la casilla fantasma → se
 *   descarta; la ticketeada es la ronda física.
 * - Filtro de sanidad por DIFERENCIAL ∈ [−10, +54] (no por gross — no descartar 9h).
 * - Se conservan solo tarjetas con ticket (identidad de dedup).
 */

import type { FedegolfSession, FedegolfTarjeta } from './types'

const BASE_URL = 'https://www.fedegolf.cl'
const LISTADO_PATH = '/publico/modVeinteMejoresPalos/listadoMejoresPalos.php'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const DIFF_MIN = -10
const DIFF_MAX = 54

const TEE_ABREV: Record<string, string> = {
  A: 'Azul',
  B: 'Blanco',
  R: 'Rojo',
  N: 'Negro',
  D: 'Dorado',
  V: 'Rojo', // 'rojov' (rojo damas) → Rojo
}

/** Fila cruda del listado, antes de resolver campeonatos / descartar fantasmas. */
export interface TarjetaCruda {
  fechaJuego: string
  clubCancha: string
  scoreGross: number
  courseRating: number
  slope: number
  tee: string | null
  diferencial: number
  ticket: string | null
  cuenta: boolean
  esCampeonato: boolean
  holes: 9 | 18 | null
}

/** Normaliza el tee: expande abreviaturas ('A' → 'Azul'); null si vacío. */
export function normalizarTee(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  if (s.length === 1) return TEE_ABREV[s.toUpperCase()] ?? s
  return s
}

function textOf(cell: string): string {
  return cell
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Parsea el HTML del listado a filas crudas. Toma cada `<tr>` que contiene una
 * fecha `YYYY-MM-DD`. Columnas: [0]=trofeo, [1]=Nro, [2]=Fecha, [3]=Club/Cancha,
 * [4]=Score, [5]=Course, [6]=Slope, [7]=Tee, [8]=Diff, [9]=Ticket.
 */
export function parseTarjetas(html: string): TarjetaCruda[] {
  const filas: TarjetaCruda[] = []
  for (const tr of Array.from(html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi))) {
    const rowAttrs = tr[1]
    const rowInner = tr[2]
    if (!/\d{4}-\d{2}-\d{2}/.test(rowInner)) continue // saltar header y filas sin fecha
    const cells = Array.from(rowInner.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((c) => c[1])
    if (cells.length < 10) continue
    const ticketRaw = textOf(cells[9])
    filas.push({
      fechaJuego: textOf(cells[2]),
      clubCancha: textOf(cells[3]),
      scoreGross: Number.parseFloat(textOf(cells[4])),
      courseRating: Number.parseFloat(textOf(cells[5])),
      slope: Number.parseFloat(textOf(cells[6])),
      tee: normalizarTee(textOf(cells[7])),
      diferencial: Number.parseFloat(textOf(cells[8])),
      ticket: ticketRaw || null,
      cuenta: /selected-row/.test(rowAttrs),
      esCampeonato: /fa-trophy/i.test(cells[0] ?? ''),
      holes: null, // el listado no expone n° de hoyos; no asumir 18 (spec D-9h)
    })
  }
  return filas
}

/**
 * El índice que la fede PUBLICA en la misma página del listado, y cuántas
 * tarjetas dice haber usado para calcularlo.
 *
 * Por qué importa que salga de este HTML y no de `profiles.indice`: el índice
 * guardado se sincroniza con cooldown de 24h (`SYNC_INDICE_COOLDOWN_HORAS`),
 * así que cuando entra una tarjeta nueva el listado ya refleja el índice nuevo
 * y el guardado todavía no. Comparar una derivación EN VIVO contra un número
 * GUARDADO Y VIEJO garantiza que se contradigan durante esa ventana.
 *
 * Medido el 4-ago-2026: entró una tarjeta (diff 5.5), el listado y el índice
 * publicado pasaron a 9.1 al instante, y `profiles.indice` siguió en 9.3
 * durante horas. Ambos números tienen que venir del mismo fetch o no hay
 * comparación válida.
 */
export interface IndicePublicado {
  /** El índice tal como lo publica fedegolf.cl en esta misma página. */
  indice: number | null
  /** "Nota: 8 tarjetas Utilizadas" — cuántos diferenciales dice haber usado. */
  tarjetasUtilizadas: number | null
}

/**
 * Parsea el bloque "ÍNDICE ACTUAL" del listado.
 *
 * Estructura (verificada 4-ago-2026):
 *   <h3 class="code-title">ÍNDICE ACTUAL</h3>
 *   ... <strong class="h5">9.1&nbsp;&nbsp;&nbsp;</strong>
 *   ... <strong>Nota: </strong>8 tarjetas Utilizadas
 *
 * Se ancla en "NDICE ACTUAL" (sin la Í, para no depender de si viene en UTF-8
 * o como `&Iacute;`) y toma el primer `h5` que aparece DESPUÉS — así un número
 * suelto de más arriba en la página no se cuela.
 */
export function parseIndicePublicado(html: string): IndicePublicado {
  const anclaje = html.search(/NDICE\s+ACTUAL/i)
  if (anclaje === -1) return { indice: null, tarjetasUtilizadas: null }
  const bloque = html.slice(anclaje)

  const mIndice = /<strong[^>]*class="[^"]*\bh5\b[^"]*"[^>]*>\s*(-?\d+(?:[.,]\d+)?)/i.exec(bloque)
  const crudo = mIndice ? Number.parseFloat(mIndice[1].replace(',', '.')) : NaN

  const mTarjetas = /(\d+)\s*tarjetas?\s+utilizadas/i.exec(bloque)
  const usadas = mTarjetas ? Number.parseInt(mTarjetas[1], 10) : NaN

  return {
    indice: Number.isFinite(crudo) ? crudo : null,
    tarjetasUtilizadas: Number.isFinite(usadas) ? usadas : null,
  }
}

/** Filtro de sanidad: diferencial finito y en rango WHS (caza la basura sin tocar 9h). */
export function filtrarSanidad(t: { diferencial: number }): boolean {
  return Number.isFinite(t.diferencial) && t.diferencial >= DIFF_MIN && t.diferencial <= DIFF_MAX
}

/**
 * Pipeline completo: parse → filtro por diferencial → descartar casillas fantasma
 * (sin ticket) → mapear a `FedegolfTarjeta` con `valeDoble` desde el trofeo.
 */
export function procesarTarjetas(html: string): FedegolfTarjeta[] {
  return parseTarjetas(html)
    .filter(filtrarSanidad)
    .filter((t): t is TarjetaCruda & { ticket: string } => typeof t.ticket === 'string' && t.ticket.length > 0)
    .map((t) => ({
      fechaJuego: t.fechaJuego,
      clubCancha: t.clubCancha,
      scoreGross: t.scoreGross,
      courseRating: t.courseRating,
      slope: t.slope,
      tee: t.tee,
      diferencial: t.diferencial,
      ticket: t.ticket,
      cuenta: t.cuenta,
      valeDoble: t.esCampeonato,
      holes: t.holes,
    }))
}

/**
 * Convención de redondeo de FedeGolf al publicar el índice: **TRUNCA** al primer
 * decimal, no redondea. Fuente ÚNICA de esta decisión (regla "un concepto, una
 * fuente") — nadie más debe re-derivarla con `Math.round`.
 *
 * EVIDENCIA (medida el 3-ago-2026, ambos lados traídos de fedegolf.cl en la
 * MISMA corrida, así que no hay margen para "el dato guardado estaba viejo"):
 *
 *   diferenciales que cuentan → [7.2, 8.8, 8.9, 8.9, 9.5, 9.7, 10.5, 11.4]
 *   promedio crudo           → 9.3625
 *   Math.round(·, 1)         → 9.4   ✗
 *   truncar(·, 1)            → 9.3   ✓ == índice oficial publicado (9.3)
 *
 * Ese es el PRIMER caso discriminante que tuvimos: el fixture anterior
 * (`listado-20.html`, oficial 9.1) promedia 9.1375, y ahí redondear y truncar
 * dan lo mismo — por eso el test pasaba con el código equivocado. El fixture
 * `listado-20-trunca.html` conserva el caso que sí distingue.
 *
 * POR QUÉ EL EPSILON. No es por `literal * 10` — V8 da `8.7 * 10 === 87`
 * exacto. El error aparece en la SUMA/DIVISIÓN que produce el promedio:
 *
 *   (15.5 + 37.1 + 24.2) / 3 === 25.599999999999998 → floor pelado da 25.5
 *
 * Sin epsilon eso le come un décimo al usuario Y rompe el guard del modal
 * (el derivado deja de cuadrar con el oficial → se esconde la pantalla).
 * Barriendo promedios realistas, pasa en ~2% de los casos.
 *
 * El epsilon no puede tapar una diferencia real en este dominio: con `S`
 * múltiplo de 0.1 y `n` diferenciales, si el promedio no cae justo en un
 * décimo, su distancia mínima al décimo es `1/(10n)` — 0.005 con n=20, nueve
 * órdenes de magnitud sobre 1e-9. Correcto por construcción, no por suerte.
 *
 * OJO CON LOS NEGATIVOS (jugador plus): esto es `floor`, no truncado hacia
 * cero — `-1.25` cae a `-1.3`, no a `-1.2`. La evidencia medida cubre sólo el
 * lado positivo; cuál de las dos usa la fede para índices bajo par NO está
 * verificado. Se deja floor porque el modo de falla es seguro: si no coincide,
 * el guard esconde la fórmula y el hero sigue mostrando el número oficial.
 * Antes de cambiarlo, medir contra un jugador plus real.
 */
export function truncarIndiceFedegolf(valor: number): number {
  return Math.floor(valor * 10 + 1e-9) / 10
}

/**
 * Resumen del índice oficial: cómo las tarjetas componen el número de la fede.
 *
 * Regla WHS chilena (verificada contra la cuenta real, el derivado == índice
 * oficial al decimal): el índice es el **promedio simple de los diferenciales
 * que cuentan** (los `cuenta:true` que trae el listado, `selected-row`), SIN
 * factor 0.96, truncado a 1 decimal. Una tarjeta de campeonato (`valeDoble`)
 * aporta su diferencial DOS veces — tanto al promedio como al conteo de la
 * ventana de 20.
 */
export interface ResumenIndiceOficial {
  /** Rondas físicas de la ventana, orden del listado (más nueva primero). */
  tarjetas: FedegolfTarjeta[]
  /**
   * Promedio de los diferenciales que cuentan SIN redondear (precisión completa).
   * Se expone aparte del derivado para poder mostrarle al usuario de dónde sale
   * el truncado (9.36 → 9.3) en vez de dejar una resta que no le cuadra.
   */
  promedioCrudo: number | null
  /**
   * El índice que resulta de aplicar la convención FedeGolf al promedio crudo.
   * Es el número que DEBE coincidir con `profiles.indice`. null si no cuenta ninguna.
   */
  indiceDerivado: number | null
  /** Diferenciales que cuentan, expandidos (campeonato dos veces) y ordenados asc — para mostrar la fórmula. */
  diferencialesQueCuentan: number[]
  /** Total de diferenciales en la ventana (campeonato cuenta 2) — normalmente 20. */
  slotsVentana: number
  /** Rondas físicas que aportan al índice (una de campeonato sigue siendo 1 ronda). */
  rondasQueCuentan: number
}

/** Diferenciales que aporta una tarjeta: 2 si es campeonato, 1 si no. */
function slotsDe(t: FedegolfTarjeta): number {
  return t.valeDoble ? 2 : 1
}

/**
 * Deriva el desglose del índice oficial a partir de las tarjetas ya procesadas
 * (`procesarTarjetas`). Fuente ÚNICA de la matemática del índice FedeGolf en la
 * app — la UI no re-deriva por su cuenta (regla "un concepto, una fuente").
 */
export function resumenIndiceOficial(tarjetas: FedegolfTarjeta[]): ResumenIndiceOficial {
  const cuentan = tarjetas.filter((t) => t.cuenta)
  const diferencialesQueCuentan = cuentan
    .flatMap((t) => Array<number>(slotsDe(t)).fill(t.diferencial))
    .sort((a, b) => a - b)
  const slotsCuentan = diferencialesQueCuentan.length
  const promedioCrudo =
    slotsCuentan > 0
      ? diferencialesQueCuentan.reduce((a, b) => a + b, 0) / slotsCuentan
      : null
  return {
    tarjetas,
    promedioCrudo,
    indiceDerivado: promedioCrudo != null ? truncarIndiceFedegolf(promedioCrudo) : null,
    diferencialesQueCuentan,
    slotsVentana: tarjetas.reduce((s, t) => s + slotsDe(t), 0),
    rondasQueCuentan: cuentan.length,
  }
}

/**
 * Trae las ~20 tarjetas del índice del socio logueado, MÁS el índice que la
 * fede publica en esa misma página. El GET auto-scopea al socio de la sesión
 * (verificado) — no necesita club/usuario.
 *
 * Los dos datos salen del MISMO fetch a propósito: es lo que garantiza que el
 * número oficial y la derivación correspondan al mismo instante.
 */
export async function fedegolfGetTarjetasIndice(
  session: FedegolfSession
): Promise<{ tarjetas: FedegolfTarjeta[]; publicado: IndicePublicado }> {
  const res = await fetch(`${BASE_URL}${LISTADO_PATH}`, {
    redirect: 'manual',
    headers: { Cookie: session.cookie, 'User-Agent': USER_AGENT },
  })
  const html = await res.text()
  return { tarjetas: procesarTarjetas(html), publicado: parseIndicePublicado(html) }
}
