// src/golf/tournament-fechas.ts
//
// FUENTE ÚNICA de "¿esta fecha de torneo es válida?".
//
// Reportes inbox 891b0199 / f83156b1: el wizard aceptaba 01-01-0001 como fecha
// de una ronda y 01-01-1000 como inicio del torneo. Un `<input type="date">`
// deja tipear cualquier año, y el zod del draft sólo mira el FORMATO
// (`YYYY-MM-DD`), así que la fecha absurda llegaba a la base.
//
// La misma regla la usan el cliente (los `min`/`max` de los inputs y los
// blockers del footer del wizard) y el servidor (`validateGolfRules` en
// `create-tournament`, y el zod del camino legacy `api/torneos/create`).
// Una sola definición: si cambia el margen, cambia en todos lados.
//
// Márgenes:
//   · PASADO: 365 días. Un club carga a veces un torneo ya jugado para dejar el
//     registro (tarjetas del fin de semana, un campeonato de la temporada).
//     Una temporada es el límite razonable; más atrás que un año no es un
//     torneo que se está organizando, es un typo.
//   · FUTURO: 730 días. Los clubes publican el calendario de la temporada
//     siguiente con hasta ~18 meses de anticipación; dos años lo cubre con
//     holgura (el torneo más lejano en prod hoy está a ~21 meses).
//
// Sin I/O y sin React: puro, testeable, usable desde `src/golf/`.

import type { TournamentConfig } from '@/lib/draft/types'
import type { ValidationError } from './tournament-config-validator'

export const FECHA_TORNEO_MARGEN_PASADO_DIAS = 365
export const FECHA_TORNEO_MARGEN_FUTURO_DIAS = 730

const MS_POR_DIA = 86_400_000
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parsea `YYYY-MM-DD` como fecha de calendario (UTC). Devuelve null si el
 * formato no es ese o si la fecha no existe (2026-02-30, mes 13, etc.):
 * `new Date('2026-02-30')` normaliza a marzo en silencio, y eso es
 * exactamente lo que NO queremos validar como válido.
 */
export function parseFechaISO(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const m = ISO_DATE_RE.exec(iso)
  if (!m) return null
  const [, y, mo, d] = m
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  // `Date.UTC(1, 0, 1)` interpreta los años 0-99 como 1900-1999: el 0001-01-01
  // del reporte se volvería 1901 y fallaría como "formato" en vez de como
  // "muy pasada". `setUTCFullYear` no tiene esa trampa.
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

/** `YYYY-MM-DD` de una fecha, en UTC (el calendario, no el reloj). */
export function fechaISO(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** El día de hoy como fecha de calendario UTC (sin hora). */
function hoyCalendario(hoy: Date): Date {
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
}

/**
 * Límites `[min, max]` (ISO) para una fecha de torneo dado el día de hoy.
 * Son los mismos que van en `min`/`max` de los inputs del wizard.
 */
export function limitesFechaTorneo(hoy: Date): { min: string; max: string } {
  const base = hoyCalendario(hoy).getTime()
  return {
    min: fechaISO(new Date(base - FECHA_TORNEO_MARGEN_PASADO_DIAS * MS_POR_DIA)),
    max: fechaISO(new Date(base + FECHA_TORNEO_MARGEN_FUTURO_DIAS * MS_POR_DIA)),
  }
}

export type MotivoFechaInvalida = 'formato' | 'muy_pasada' | 'muy_futura'

/**
 * `null` = válida. Si no, el motivo. La fecha se compara como calendario
 * (UTC), así que "hoy" es válido en cualquier zona horaria.
 */
export function validarFechaTorneo(iso: string, hoy: Date): MotivoFechaInvalida | null {
  const fecha = parseFechaISO(iso)
  if (!fecha) return 'formato'
  const { min, max } = limitesFechaTorneo(hoy)
  const t = fecha.getTime()
  if (t < parseFechaISO(min)!.getTime()) return 'muy_pasada'
  if (t > parseFechaISO(max)!.getTime()) return 'muy_futura'
  return null
}

export function mensajeFechaInvalida(motivo: MotivoFechaInvalida, hoy: Date): string {
  const { min, max } = limitesFechaTorneo(hoy)
  switch (motivo) {
    case 'formato':
      return 'La fecha no es válida (usa el formato AAAA-MM-DD)'
    case 'muy_pasada':
      return `La fecha no puede ser anterior al ${formatearFecha(min)} (más de un año atrás)`
    case 'muy_futura':
      return `La fecha no puede ser posterior al ${formatearFecha(max)} (más de dos años adelante)`
  }
}

/** `2026-10-05` → `05-10-2026`, como se lee en Chile. */
function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

/**
 * Reglas de fecha de un config de torneo, en el mismo formato que
 * `validateGolfRules` (que las incluye). Las fechas en `null` no son un
 * error acá: "falta la fecha" ya lo dice `isReadyToCreate` / el footer.
 *
 *   · `date_start` y cada `rounds[i].date` deben ser fechas válidas dentro
 *     del margen.
 *   · La ronda 1 se juega el día de inicio del torneo: si las dos están
 *     cargadas y no coinciden, es un error (son el mismo concepto en dos
 *     inputs del wizard, que se sincronizan entre sí).
 *   · Las rondas van en orden no decreciente por `round_number`: la ronda 2
 *     no puede ser antes que la 1.
 */
export function validarFechasDeTorneo(
  config: Pick<TournamentConfig, 'date_start' | 'rounds'>,
  hoy: Date,
): ValidationError[] {
  const errors: ValidationError[] = []

  if (config.date_start !== null) {
    const motivo = validarFechaTorneo(config.date_start, hoy)
    if (motivo) {
      errors.push({
        code: `date_start_${motivo}`,
        field: 'date_start',
        message: `Fecha de inicio: ${mensajeFechaInvalida(motivo, hoy)}`,
      })
    }
  }

  const ordenadas = [...config.rounds].sort((a, b) => a.round_number - b.round_number)
  // Una fecha inválida (formato o fuera de margen) ya tiene su error: no se
  // la compara además contra las otras rondas, para no apilar un segundo
  // mensaje ("antes que la ronda 1") sobre el mismo typo.
  const fechaUsable = (iso: string | null): Date | null =>
    iso !== null && validarFechaTorneo(iso, hoy) === null ? parseFechaISO(iso) : null
  for (const r of ordenadas) {
    if (r.date === null) continue
    const motivo = validarFechaTorneo(r.date, hoy)
    if (motivo) {
      errors.push({
        code: `round_date_${motivo}`,
        field: `rounds[${r.round_number}].date`,
        message: `Ronda ${r.round_number}: ${mensajeFechaInvalida(motivo, hoy)}`,
      })
    }
  }

  const primera = ordenadas[0]
  if (
    primera &&
    primera.date !== null &&
    config.date_start !== null &&
    fechaUsable(primera.date) &&
    fechaUsable(config.date_start) &&
    primera.date !== config.date_start
  ) {
    errors.push({
      code: 'date_start_mismatch',
      field: 'date_start',
      message: `La ronda ${primera.round_number} (${formatearFecha(primera.date)}) debe jugarse el día de inicio del torneo (${formatearFecha(config.date_start)})`,
    })
  }

  for (let i = 1; i < ordenadas.length; i++) {
    const prev = ordenadas[i - 1]
    const cur = ordenadas[i]
    const tPrev = fechaUsable(prev.date)
    const tCur = fechaUsable(cur.date)
    if (!tPrev || !tCur) continue
    if (tCur.getTime() < tPrev.getTime()) {
      errors.push({
        code: 'rounds_not_chronological',
        field: `rounds[${cur.round_number}].date`,
        message: `La ronda ${cur.round_number} (${formatearFecha(cur.date!)}) no puede ser antes que la ronda ${prev.round_number} (${formatearFecha(prev.date!)})`,
      })
    }
  }

  return errors
}
