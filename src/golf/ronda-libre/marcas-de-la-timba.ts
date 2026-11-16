/**
 * Puntos especiales que se marcan a mano en el scorer de una Timba libre (spec, "Puntos especiales"). Funciones
 * puras: qué se puede marcar en un hoyo, qué marcas valen sumando lo que todavía espera envío en el teléfono, y
 * qué muestra cada botón (marcado, en espera, "no cuenta" con la razón que da el motor).
 *
 * La regla de "cuenta o no" vive SOLO en el motor (`calcularJuegoPersonalizado`): acá se lee su resultado.
 */
import {
  PUNTITOS_MANUALES,
  nombreDelPuntito,
  type ConfigJuego,
  type MarcaPuntito,
  type PuntitoConfig,
  type ResultadoHoyoDelJuego,
} from '@/golf/formats/personalizado'

/** Una marca que espera envío: `marcar: false` = quitarla. */
export interface MarcaEnCola extends MarcaPuntito {
  marcar: boolean
}

/** Los puntos especiales que se marcan en un hoyo: manuales y activos; el greenie solo en par 3. */
export function puntitosMarcables(config: Pick<ConfigJuego, 'puntitos'>, par: number): PuntitoConfig[] {
  return config.puntitos.filter(p => p.activo && PUNTITOS_MANUALES.includes(p.tipo) && (p.tipo !== 'greenie' || par === 3))
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
  jugadores: BotonDeMarca[]
}

export function marcasDelHoyo(input: {
  puntitos: readonly PuntitoConfig[]
  jugadorIds: readonly string[]
  hoyo: number
  /** `marcasVigentes`. */
  marcas: readonly MarcaPuntito[]
  /** Las que esperan envío (de este hoyo o de otros). */
  enEspera: readonly MarcaPuntito[]
  resultadoDelHoyo: ResultadoHoyoDelJuego | null
}): MarcasDeUnPuntito[] {
  const { puntitos, jugadorIds, hoyo, marcas, enEspera, resultadoDelHoyo } = input
  return puntitos.map(puntito => ({
    puntito,
    nombre: nombreDelPuntito(puntito),
    jugadores: jugadorIds.map(jugadorId => {
      const clave = { jugadorId, hoyo, puntitoId: puntito.id }
      const marcado = marcas.some(m => misma(m, clave))
      const evaluado = resultadoDelHoyo?.especiales.find(e => e.jugadorId === jugadorId && e.puntitoId === puntito.id)
      return {
        jugadorId,
        marcado,
        enEspera: enEspera.some(m => misma(m, clave)),
        noCuenta: marcado && evaluado && !evaluado.cuenta ? evaluado.razon ?? 'No cuenta' : null,
      }
    }),
  }))
}
