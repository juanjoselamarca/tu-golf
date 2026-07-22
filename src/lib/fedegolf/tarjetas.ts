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
  for (const tr of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const rowAttrs = tr[1]
    const rowInner = tr[2]
    if (!/\d{4}-\d{2}-\d{2}/.test(rowInner)) continue // saltar header y filas sin fecha
    const cells = [...rowInner.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1])
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
 * Trae las ~20 tarjetas del índice del socio logueado. El GET auto-scopea al
 * socio de la sesión (verificado) — no necesita club/usuario.
 */
export async function fedegolfGetTarjetasIndice(
  session: FedegolfSession
): Promise<FedegolfTarjeta[]> {
  const res = await fetch(`${BASE_URL}${LISTADO_PATH}`, {
    redirect: 'manual',
    headers: { Cookie: session.cookie, 'User-Agent': USER_AGENT },
  })
  const html = await res.text()
  return procesarTarjetas(html)
}
