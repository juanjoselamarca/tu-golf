/**
 * Puntos especiales que se marcan a mano en el scorer de una Timba libre (spec, "Puntos especiales"). Funciones
 * puras: qué se puede marcar en un hoyo, qué marcas valen sumando lo que todavía espera envío en el teléfono, y
 * qué muestra cada botón (marcado, en espera, "no cuenta" con la razón que da el motor).
 *
 * La regla de "cuenta o no" vive en `puntos-especiales.ts` (la aplica el motor, `calcularJuegoPersonalizado`): acá
 * se usa para no ofrecer lo que no contaría y se lee el juicio del motor sobre lo ya marcado.
 */
import {
  PUNTITOS_MANUALES,
  nombreDelPuntito,
  seJuegaEnElHoyo,
  sePuedeOfrecer,
  type ConfigJuego,
  type MarcaPuntito,
  type PuntitoConfig,
  type ResultadoHoyoDelJuego,
} from '@/golf/formats/personalizado'

/** Una marca que espera envío: `marcar: false` = quitarla. */
export interface MarcaEnCola extends MarcaPuntito {
  marcar: boolean
}

/**
 * Los puntos especiales que se marcan en un hoyo: manuales y activos; el greenie solo en un par 3 conocido (sin
 * par, no se ofrece: no se finge un par 3).
 */
export function puntitosMarcables(config: Pick<ConfigJuego, 'puntitos'>, par: number | null | undefined): PuntitoConfig[] {
  return config.puntitos.filter(p => p.activo && PUNTITOS_MANUALES.includes(p.tipo) && seJuegaEnElHoyo(p.tipo, par))
}

const misma = (a: MarcaPuntito, b: MarcaPuntito) => a.jugadorId === b.jugadorId && a.hoyo === b.hoyo && a.puntitoId === b.puntitoId

/**
 * Marcas que valen para mostrar: las guardadas, con las de la cola aplicadas en orden. Mismo efecto que la RPC:
 * un greenie es uno por hoyo (marcar reemplaza; quitar los borra todos).
 */
export function marcasVigentes(
  servidor: readonly MarcaPuntito[],
  enCola: readonly MarcaEnCola[],
  esGreenie: (puntitoId: string) => boolean,
): MarcaPuntito[] {
  let out = servidor.map(m => ({ jugadorId: m.jugadorId, hoyo: m.hoyo, puntitoId: m.puntitoId }))
  for (const c of enCola) {
    const marca = { jugadorId: c.jugadorId, hoyo: c.hoyo, puntitoId: c.puntitoId }
    if (esGreenie(c.puntitoId)) out = out.filter(m => !(m.hoyo === c.hoyo && m.puntitoId === c.puntitoId))
    else out = out.filter(m => !misma(m, marca))
    if (c.marcar) out.push(marca)
  }
  return out
}

export interface BotonDeMarca {
  jugadorId: string
  marcado: boolean
  /** Marcada (o quitada) en el teléfono y todavía sin confirmar por el servidor. */
  enEspera: boolean
  /** Razón del motor si está marcada y no cuenta; `null` si cuenta o si el hoyo todavía no se puntúa. */
  noCuenta: string | null
}

export interface MarcasDeUnPuntito {
  puntito: PuntitoConfig
  nombre: string
  /** Solo los botones que tiene sentido mostrar (ver `marcasDelHoyo`); nunca vacío. */
  jugadores: BotonDeMarca[]
}

/**
 * Los botones del hoyo: a cada jugador se le ofrece un punto solo si contaría (`sePuedeOfrecer`: sandy y greenie
 * con el score ya anotado y par o mejor; chipingo y propios a todos) y si no está retirado. Una marca ya puesta se
 * muestra SIEMPRE (aunque le hayan corregido el score o se haya retirado), con el "no cuenta" del motor, para que
 * se pueda quitar: nunca se esconde una marca. Un punto sin botones no aparece.
 */
export function marcasDelHoyo(input: {
  puntitos: readonly PuntitoConfig[]
  jugadorIds: readonly string[]
  hoyo: number
  /** `marcasVigentes`. */
  marcas: readonly MarcaPuntito[]
  /** Las que esperan envío (de este hoyo o de otros). */
  enEspera: readonly MarcaPuntito[]
  resultadoDelHoyo: ResultadoHoyoDelJuego | null
  /** Golpes de cada jugador en este hoyo, como están en el teléfono (sin anotar = ausente). */
  golpes: Readonly<Record<string, number | null | undefined>>
  /** Par del hoyo; `null`/`undefined` si no se conoce. */
  par: number | null | undefined
  /** Retirados en este hoyo: no se les ofrece nada. */
  retirados: ReadonlySet<string>
}): MarcasDeUnPuntito[] {
  const { puntitos, jugadorIds, hoyo, marcas, enEspera, resultadoDelHoyo, golpes, par, retirados } = input
  return puntitos.map(puntito => ({
    puntito,
    nombre: nombreDelPuntito(puntito),
    jugadores: jugadorIds.flatMap((jugadorId): BotonDeMarca[] => {
      const clave = { jugadorId, hoyo, puntitoId: puntito.id }
      const marcado = marcas.some(m => misma(m, clave))
      const seOfrece = !retirados.has(jugadorId) && sePuedeOfrecer(puntito.tipo, golpes[jugadorId], par)
      if (!marcado && !seOfrece) return []
      const evaluado = resultadoDelHoyo?.especiales.find(e => e.jugadorId === jugadorId && e.puntitoId === puntito.id)
      return [{
        jugadorId,
        marcado,
        enEspera: enEspera.some(m => misma(m, clave)),
        noCuenta: marcado && evaluado && !evaluado.cuenta ? evaluado.razon ?? 'No cuenta' : null,
      }]
    }),
  })).filter(g => g.jugadores.length > 0)
}
