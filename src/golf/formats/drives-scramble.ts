/**
 * Drives de un scramble (registro opcional, scramble de club del 28-nov): en cada hoyo el equipo juega el drive
 * de UNO de sus jugadores, y cada jugador tiene que aportar un mínimo de drives en la vuelta (regla del torneo).
 *
 * FUENTE ÚNICA del concepto: cuántos jugadores, el mínimo por jugador según los hoyos, cómo se leen los drives
 * guardados, el conteo y el aviso de «a Pedro le faltan 2 drives». Los drives NO afectan score, hándicap ni
 * historial: son un registro aparte (`ronda_equipos.drives`, hoyo → posición del jugador en `drive_jugadores`).
 */

/** Jugadores por equipo cuando se anotan drives (scramble de 4). */
export const JUGADORES_POR_EQUIPO_CON_DRIVES = 4

/** Largo máximo del nombre de un jugador del equipo: va en un botón de un cuarto de ancho. */
export const NOMBRE_JUGADOR_DE_DRIVE_MAX = 20

/** Drives mínimos por jugador según los hoyos de la ronda (regla del torneo: 4 en 18 hoyos, 2 en 9). */
export const DRIVES_MINIMOS_POR_JUGADOR: Readonly<Record<number, number>> = { 18: 4, 9: 2 }

/** Mínimo de drives por jugador para esos hoyos, o `null` si el modo no se juega a esa cantidad de hoyos. */
export function drivesMinimoPorJugador(holes: number): number | null {
  return DRIVES_MINIMOS_POR_JUGADOR[holes] ?? null
}

/** Drives de un equipo: hoyo (como texto, igual que `scores`) → posición del jugador en `drive_jugadores`. */
export type DrivesDelEquipo = Record<string, number>

/**
 * Los drives guardados, limpios: solo hoyos enteros positivos con una posición entera dentro de los jugadores. Lo
 * demás (una fila vieja, un valor corrupto) se ignora en vez de romper la tarjeta.
 */
export function leerDrives(crudo: unknown, cantidadDeJugadores: number): DrivesDelEquipo {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return {}
  const out: DrivesDelEquipo = {}
  for (const [hoyo, v] of Object.entries(crudo as Record<string, unknown>)) {
    if (!/^[1-9][0-9]*$/.test(hoyo)) continue
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= cantidadDeJugadores) continue
    out[hoyo] = v
  }
  return out
}

/**
 * Los drives guardados con cambios encima (los que esperan envío o acaban de confirmarse en este teléfono):
 * hoyo → posición del jugador, o una posición negativa = sin drive en ese hoyo. Último en la lista gana.
 */
export function drivesConCambios(base: DrivesDelEquipo, ...cambios: ReadonlyArray<Readonly<Record<string, number>>>): DrivesDelEquipo {
  const out: DrivesDelEquipo = { ...base }
  for (const c of cambios) {
    for (const [hoyo, v] of Object.entries(c)) {
      if (v < 0) delete out[hoyo]
      else out[hoyo] = v
    }
  }
  return out
}

/** Los jugadores con que se anotan drives, o `null` si el equipo no los anota. */
export function jugadoresDeDrive(crudo: unknown): string[] | null {
  if (!Array.isArray(crudo) || crudo.length === 0) return null
  if (!crudo.every(n => typeof n === 'string')) return null
  return crudo as string[]
}

/** Drives de cada jugador (por posición) en los hoyos de la ronda. Un drive en un hoyo ajeno a la ronda no cuenta. */
export function contarDrives(drives: DrivesDelEquipo, cantidadDeJugadores: number, hoyos: readonly number[]): number[] {
  const cuenta = Array.from({ length: cantidadDeJugadores }, () => 0)
  for (const h of hoyos) {
    const j = drives[String(h)]
    if (j != null && j >= 0 && j < cantidadDeJugadores) cuenta[j] += 1
  }
  return cuenta
}

export interface ConteoDeDrivesDeJugador {
  posicion: number
  nombre: string
  /** Drives anotados en los hoyos de la ronda. */
  drives: number
  /** Lo que le falta para el mínimo (0 si lo cumplió o la ronda no tiene mínimo). */
  faltan: number
  /** Llegó al mínimo. Sin mínimo (`null`) no hay nada que cumplir: false. */
  cumple: boolean
}

/**
 * Conteo de drives por jugador y si cumplió el mínimo, en el orden del equipo. La fuente de la fila «Pedro 3 ·
 * Juan 4 ✓» del scorer y de la vista del espectador. `[]` si el equipo no anota drives.
 */
export function conteoDeDrives(input: {
  jugadores: readonly string[] | null
  drives: DrivesDelEquipo
  minimo: number | null
  hoyos: readonly number[]
}): ConteoDeDrivesDeJugador[] {
  const { jugadores, drives, minimo, hoyos } = input
  if (!jugadores || jugadores.length === 0) return []
  const cuenta = contarDrives(drives, jugadores.length, hoyos)
  return jugadores.map((nombre, posicion) => {
    const n = cuenta[posicion]
    const conMinimo = minimo != null && minimo > 0
    return { posicion, nombre, drives: n, faltan: conMinimo ? Math.max(0, minimo - n) : 0, cumple: conMinimo && n >= minimo }
  })
}

export interface FaltaDeDrives {
  posicion: number
  nombre: string
  faltan: number
}

export interface AvisoDeDrives {
  /** Jugadores bajo el mínimo, en el orden del equipo. */
  faltan: FaltaDeDrives[]
  /** Hoyos de la ronda que todavía no tienen drive anotado. */
  hoyosRestantes: number
}

/**
 * Aviso de riesgo: algún jugador puede quedar bajo el mínimo. Hay riesgo cuando los hoyos sin drive anotado ya no
 * sobran: `hoyosRestantes <= drives que le faltan al grupo` (con igualdad, cada hoyo que queda tiene que ir a
 * alguien que le falta). `null` = sin riesgo, o el equipo no anota drives.
 */
export function avisoDeDrives(input: {
  jugadores: readonly string[] | null
  drives: DrivesDelEquipo
  minimo: number | null
  hoyos: readonly number[]
}): AvisoDeDrives | null {
  const { jugadores, drives, minimo, hoyos } = input
  if (!jugadores || jugadores.length === 0 || minimo == null || minimo <= 0) return null
  const cuenta = contarDrives(drives, jugadores.length, hoyos)
  const faltan = jugadores
    .map((nombre, posicion) => ({ posicion, nombre, faltan: Math.max(0, minimo - cuenta[posicion]) }))
    .filter(f => f.faltan > 0)
  if (faltan.length === 0) return null
  const hoyosRestantes = hoyos.filter(h => drives[String(h)] == null).length
  const faltanAlGrupo = faltan.reduce((s, f) => s + f.faltan, 0)
  return hoyosRestantes <= faltanAlGrupo ? { faltan, hoyosRestantes } : null
}

const drivesTexto = (n: number) => (n === 1 ? '1 drive' : `${n} drives`)

/** «A Pedro le faltan 2 drives · quedan 3 hoyos sin drive». Con varios: «A Pedro le faltan 2 drives y a Juan 1 · …». */
export function textoAvisoDeDrives(aviso: AvisoDeDrives): string {
  const [primero, ...resto] = aviso.faltan
  const verbo = primero.faltan === 1 ? 'le falta' : 'le faltan'
  let texto = `A ${primero.nombre} ${verbo} ${drivesTexto(primero.faltan)}`
  if (resto.length > 0) {
    const otros = resto.map(f => `a ${f.nombre} ${f.faltan}`)
    texto += otros.length === 1 ? ` y ${otros[0]}` : `, ${otros.slice(0, -1).join(', ')} y ${otros[otros.length - 1]}`
  }
  const h = aviso.hoyosRestantes
  return `${texto} · ${h === 0 ? 'no quedan hoyos sin drive' : h === 1 ? 'queda 1 hoyo sin drive' : `quedan ${h} hoyos sin drive`}`
}

/** Nombre del jugador tal como se escribe: sin espacios a los lados. */
export function nombreDeJugadorDeDrive(crudo: string): string {
  return crudo.trim()
}

/**
 * Problema con los nombres de los jugadores de un equipo, o `null` si están bien: exactamente
 * `JUGADORES_POR_EQUIPO_CON_DRIVES`, ninguno vacío, dentro del largo y sin repetirse (los botones tienen que
 * distinguirse). La usan el asistente y la API.
 */
export function problemaDeJugadoresDeDrive(nombres: readonly string[]): 'faltan' | 'largo' | 'repetidos' | null {
  const limpios = nombres.map(nombreDeJugadorDeDrive)
  if (limpios.length !== JUGADORES_POR_EQUIPO_CON_DRIVES || limpios.some(n => n === '')) return 'faltan'
  if (limpios.some(n => n.length > NOMBRE_JUGADOR_DE_DRIVE_MAX)) return 'largo'
  const claves = limpios.map(n => n.toLocaleLowerCase('es-CL'))
  if (new Set(claves).size !== claves.length) return 'repetidos'
  return null
}
