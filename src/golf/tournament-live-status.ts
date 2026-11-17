/**
 * Estado de un torneo tal como se MUESTRA — FUENTE ÚNICA (`estadoDelTorneo`).
 *
 * `tournaments.status` solo cambia cuando el organizador aprieta un botón. Si se
 * olvida de cerrar, el torneo quedaba "EN CURSO" para siempre (auditoría 16-nov-2026:
 * torneos de abril seguían en curso) y cada pantalla parchaba con su propio
 * predicado (días restantes, status crudo, status + fecha): el mismo torneo decía
 * "Sin rondas en curso" arriba y "Jugando en: EN CURSO" abajo.
 *
 * Regla — derivada al leer, nunca escribe en la base:
 *  - closed / published (y el histórico 'finished') → finalizado.
 *  - draft → borrador (no es público; la fecha no lo cambia).
 *  - open / in_progress ('active' = sinónimo histórico):
 *      · el día de Chile ya pasó el fin (date_end ?? date_start) por más de
 *        GRACE_DIAS_TORNEO días → in_progress: finalizado; open: vencido (nunca se
 *        inició, no se jugó: no es un finalizado ni acepta inscripciones). Es el cierre automático: un torneo del
 *        sábado sigue en curso hasta el lunes 23:59 (hora de Chile) y desde el martes
 *        se ve finalizado, aunque nadie lo haya cerrado.
 *      · empieza en el futuro → por_jugar.
 *      · open → por_jugar; in_progress → en_curso.
 *  - Sin fecha (la columna es NOT NULL; un dato raro no debe esconder un evento) →
 *    se respeta el status.
 *  - Status desconocido → borrador: nunca se afirma que algo está en juego.
 *
 * Rondas activas pasadas las 48 h NO extienden "en curso": en prod hay una ronda
 * colgada desde abril; si contara, el zombie no se cierra nunca. Anotar tarde sigue
 * siendo posible: `/api/game` y el panel de scoring del organizador deciden con el
 * status escrito (`torneoAceptaScores`), no con este estado de pantalla.
 *
 * El "hoy" es el día calendario de Chile (America/Santiago), no el del runtime: el
 * servidor corre en UTC y de 21:00 a 24:00 de Chile ya sería "mañana".
 */
export const GRACE_DIAS_TORNEO = 2

export const ZONA_HORARIA_TORNEOS = 'America/Santiago'

export type EstadoDelTorneo = 'borrador' | 'por_jugar' | 'en_curso' | 'finalizado' | 'vencido'

/** Lo mínimo que necesita la regla. `date_end` opcional: muchos selects no la traen. */
export type TorneoConFechas = {
  status: string | null | undefined
  date_start: string | null | undefined
  date_end?: string | null | undefined
}

const FINALIZADO_STATUSES = new Set(['closed', 'published', 'finished'])
const EN_JUEGO_STATUSES = new Set(['in_progress', 'active'])

export function estadoDelTorneo(t: TorneoConFechas, ahora: Date): EstadoDelTorneo {
  const status = t.status ?? ''
  if (FINALIZADO_STATUSES.has(status)) return 'finalizado'
  const enJuego = EN_JUEGO_STATUSES.has(status)
  if (!enJuego && status !== 'open') return 'borrador'

  const fechas = rangoDelTorneo(t)
  if (fechas) {
    const hoy = fechaHoyChile(ahora)
    if (diffDias(fechas.fin, hoy) > GRACE_DIAS_TORNEO) return enJuego ? 'finalizado' : 'vencido'
    if (fechas.inicio > hoy) return 'por_jugar'
  }
  return enJuego ? 'en_curso' : 'por_jugar'
}

/** ¿El torneo está en curso ahora? Atajo de `estadoDelTorneo` (misma regla). */
export function torneoEnVivo(
  status: string | null | undefined,
  dateStart: string | null | undefined,
  dateEnd: string | null | undefined,
  ahora: Date,
): boolean {
  return estadoDelTorneo({ status, date_start: dateStart, date_end: dateEnd }, ahora) === 'en_curso'
}

/** Día calendario de Chile para un instante, en YYYY-MM-DD. */
export function fechaHoyChile(ahora: Date): string {
  // 'en-CA' formatea YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_TORNEOS, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
}

/**
 * Días calendario de Chile desde hoy hasta `fecha` (YYYY-MM-DD): 0 = hoy, 1 = mañana,
 * negativo = ya pasó. Sin fecha → null.
 */
export function diasHastaFecha(fecha: string | null | undefined, ahora: Date): number | null {
  if (!fecha) return null
  return diffDias(fechaHoyChile(ahora), fecha.slice(0, 10))
}

/**
 * Inicio y fin (YYYY-MM-DD) del torneo. Fin = la última fecha (date_end ?? date_start).
 * Fechas invertidas (date_end < date_start) son basura: se usa date_start como fin
 * para no cerrar antes de tiempo un torneo real.
 */
function rangoDelTorneo(t: TorneoConFechas): { inicio: string; fin: string } | null {
  if (!t.date_start) return null
  const inicio = t.date_start.slice(0, 10)
  const finCrudo = (t.date_end ?? t.date_start).slice(0, 10)
  return { inicio, fin: finCrudo < inicio ? inicio : finCrudo }
}

/** Días enteros desde `desde` hasta `hasta` (ambos YYYY-MM-DD). Positivo si hasta > desde. */
function diffDias(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** `fecha` (YYYY-MM-DD) más `dias` días calendario. */
export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Fechas con que queda un torneo que el organizador inicia HOY. Si la fecha programada
 * ya pasó (postergado por lluvia y jugado otro día, o un "Iniciar" olvidado), el torneo
 * se corre a hoy conservando su duración: sin esto quedaba in_progress con la fecha de
 * hace 3 días y `estadoDelTorneo` lo daba por finalizado al instante (sin scorer, en
 * "Finalizados" de Mi Golf). `tournaments` no guarda cuándo se inició, así que la fecha
 * real del torneo pasa a ser la del inicio.
 *
 * `delta` = días que se corrió (lo usan las fechas por ronda). `null` = no hay que mover
 * nada (sin fecha, o fecha de hoy o futura: iniciar antes de la fecha no la cambia).
 */
export function fechasAlIniciar(
  t: { date_start: string | null | undefined; date_end?: string | null },
  ahora: Date,
): { date_start: string; date_end: string | null; delta: number } | null {
  const fechas = rangoDelTorneo({ status: null, date_start: t.date_start, date_end: t.date_end })
  if (!fechas) return null
  const delta = diffDias(fechas.inicio, fechaHoyChile(ahora))
  if (delta <= 0) return null
  return { date_start: sumarDias(fechas.inicio, delta), date_end: t.date_end ? sumarDias(fechas.fin, delta) : null, delta }
}
