/**
 * Arma la entrada del motor de Timba libre desde lo que guarda la base (función pura). Contrato del PR B en
 * docs/specs/formato-personalizado.md; cada cláusula tiene su test en juego-de-la-ronda.test.ts.
 *
 *  1. Hándicap: `courseHandicapDelJuego` (sin default).
 *  2. Orden de los jugadores: el de `reglas_juego.jugadorIds`, nunca el de la consulta. Si los jugadores de la
 *     ronda ya no son los de `jugadorIds`, la Timba no se calcula (`jugadores_cambiaron`).
 *  3. Marcas ordenadas por (`created_at`, `id`): "vale el último greenie" depende del orden.
 *  7. Hoyo numérico: la base o el JSON pueden traerlo como string y el motor compara con `===`.
 *  8. 27 hoyos: neto no disponible (`netoDisponibleEnHoyos`).
 *  9. Retiros persistidos; uno desde un hoyo que no está en la ronda lo ignora el motor.
 * 10. `rondaCerrada` = `estado === 'finalizada'` leído de la base.
 */
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import {
  golpesRecibidosPorHoyo,
  leerReglasGuardadas,
  netoDisponibleEnHoyos,
  type ConfigJuego,
  type EntradaJuego,
  type HoyoDelJuego,
  type MarcaPuntito,
  type ResultadoJuego,
} from '@/golf/formats/personalizado'
import { courseHandicapDelJuego, type MapasDeHandicap } from './handicap-del-juego'

export interface FilaMarcaPuntito {
  id: string
  jugador_id: string
  hoyo: number | string
  puntito_id: string
  created_at: string
}

export interface FilaRetiro {
  jugador_id: string
  desde_hoyo: number | string
}

export type MotivoSinJuego =
  /** `reglas_juego` vacío o inválido. */
  | 'reglas_invalidas'
  /** Los jugadores de la ronda ya no son los de `jugadorIds`: el creador tiene que volver a confirmar las parejas. */
  | 'jugadores_cambiaron'
  /** Neto en una cantidad de hoyos en que el core todavía no calcula el CH correcto (27). */
  | 'neto_no_disponible'
  /** Falta el par (o, en neto, el stroke index) de algún hoyo de la ronda. */
  | 'sin_datos_de_cancha'

export interface DatosDelJuego {
  reglasJuego: unknown
  ronda: { holes: number; hoyo_inicio: number | null; estado: string | null }
  jugadores: readonly { id: string; scores: Readonly<Record<string, unknown>> | null }[]
  mapasHandicap: MapasDeHandicap
  parMap: Readonly<Record<number, number>>
  siMap: Readonly<Record<number, number>>
  marcas: readonly FilaMarcaPuntito[]
  retiros: readonly FilaRetiro[]
}

export type EntradaDelJuego =
  | { ok: true; entrada: EntradaJuego; jugadorIds: string[] }
  | { ok: false; motivo: MotivoSinJuego }

const numeroValido = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Hoyos en orden de juego. `courseHoles` 27 en un 27 h: con el default 18 los hoyos 19-27 serían 1-9 otra vez. */
function hoyosEnOrdenDeJuego(ronda: DatosDelJuego['ronda']): number[] {
  return hoyosDeLaRonda(ronda.hoyo_inicio, ronda.holes, Math.max(18, ronda.holes))
}

export function armarEntradaDelJuego(datos: DatosDelJuego): EntradaDelJuego {
  const reglas = leerReglasGuardadas(datos.reglasJuego)
  if (!reglas) return { ok: false, motivo: 'reglas_invalidas' }
  const { config, jugadorIds } = reglas

  const porId = new Map(datos.jugadores.map(j => [j.id, j]))
  if (porId.size !== jugadorIds.length || jugadorIds.some(id => !porId.has(id))) {
    return { ok: false, motivo: 'jugadores_cambiaron' }
  }
  if (config.modo === 'neto' && !netoDisponibleEnHoyos(datos.ronda.holes)) return { ok: false, motivo: 'neto_no_disponible' }

  const numeros = hoyosEnOrdenDeJuego(datos.ronda)
  if (numeros.some(n => numeroValido(datos.parMap[n]) == null)) return { ok: false, motivo: 'sin_datos_de_cancha' }
  const conSi = numeros.every(n => numeroValido(datos.siMap[n]) != null)
  if (config.modo === 'neto' && !conSi) return { ok: false, motivo: 'sin_datos_de_cancha' }
  // Permutación 1..N sobre los hoyos que se juegan (en gross no reparte golpes: sin SI se usa el orden).
  const si = conSi
    ? normalizedStrokeIndexByHole(numeros.map(n => ({ numero: n, stroke_index: datos.siMap[n] })), undefined, numeros)
    : Object.fromEntries(numeros.map((n, i) => [n, i + 1]))
  const hoyos: HoyoDelJuego[] = numeros.map(n => ({ numero: n, par: datos.parMap[n], strokeIndex: si[n] }))

  const jugadores = jugadorIds.map(id => ({ id, courseHandicap: courseHandicapDelJuego(datos.mapasHandicap, id) }))

  const scores: Record<string, Record<number, number>> = {}
  for (const id of jugadorIds) {
    const crudos = porId.get(id)?.scores ?? {}
    const limpios: Record<number, number> = {}
    for (const [h, v] of Object.entries(crudos)) {
      const hoyo = numeroValido(h)
      const golpes = numeroValido(v)
      if (hoyo != null && golpes != null) limpios[hoyo] = golpes
    }
    scores[id] = limpios
  }

  const marcas: MarcaPuntito[] = [...datos.marcas]
    .filter(m => porId.has(m.jugador_id) && numeroValido(m.hoyo) != null)
    .sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : Date.parse(a.created_at) - Date.parse(b.created_at)))
    .map(m => ({ jugadorId: m.jugador_id, hoyo: numeroValido(m.hoyo) as number, puntitoId: m.puntito_id }))

  const retiros: Record<string, number> = {}
  for (const r of datos.retiros) {
    const desde = numeroValido(r.desde_hoyo)
    if (porId.has(r.jugador_id) && desde != null) retiros[r.jugador_id] = desde
  }

  return {
    ok: true,
    jugadorIds: [...jugadorIds],
    entrada: { config, jugadores, hoyos, scores, marcas, retiros, rondaCerrada: datos.ronda.estado === 'finalizada' },
  }
}

/**
 * Lo que el servidor entrega al cliente de una Timba: puntos y la marca de golpe recibido por hoyo de cada jugador.
 * Hoy no trae el índice ni el hándicap de juego (por espacio y diseño, no por privacidad: ver
 * docs/specs/formato-personalizado.md); si el diseño los pide, se agregan acá. `vistaDelJuego` arma el objeto campo por campo (no copia la entrada del motor, que sí trae el CH).
 */
export interface VistaDelJuego {
  config: ConfigJuego
  jugadorIds: string[]
  resultado: ResultadoJuego
  golpesRecibidos: Record<string, Record<number, number>>
}

export function vistaDelJuego(entrada: EntradaJuego, jugadorIds: string[], resultado: ResultadoJuego): VistaDelJuego {
  return {
    config: entrada.config,
    jugadorIds,
    resultado,
    golpesRecibidos: golpesRecibidosPorHoyo(entrada),
  }
}
