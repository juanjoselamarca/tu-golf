/**
 * Puntos especiales que se marcan a mano en el scorer de una Timba libre (spec, "Puntos especiales"). Funciones
 * puras: qué se puede marcar en un hoyo, qué marcas valen sumando lo que todavía espera envío en el teléfono, y
 * qué muestra cada botón (marcado, en espera, "no cuenta" con la razón que da el motor).
 *
 * La regla de "cuenta o no" vive en `puntos-especiales.ts` (la aplica el motor, `calcularJuegoPersonalizado`): acá
 * se usa la misma función para no ofrecer lo que seguro no contaría y para juzgar en el teléfono cuando ya hay golpe
 * anotado con par conocido o el jugador se retiró (así un score corregido no espera al motor). Sin golpe anotado
 * decide el motor.
 */
import {
  PUNTITOS_MANUALES,
  nombreDelPuntito,
  esUnoPorHoyo,
  porQueNoCuenta,
  seJuegaEnElHoyo,
  sePuedeOfrecer,
  type MarcaPuntito,
  type PuntitoConfig,
  type ResultadoHoyoDelJuego,
} from '@/golf/formats/personalizado'

/** Una marca que espera envío: `marcar: false` = quitarla. */
export interface MarcaEnCola extends MarcaPuntito {
  marcar: boolean
}

/**
 * Lo que el scorer necesita de un punto especial para marcarlo, de la Timba (`PuntitoConfig`) o del skins
 * (`PuntitoSkins` con `valor` 1: cada uno vale 1 skin, spec formato-skins «Puntos especiales»).
 * `activo`: solo la Timba lo trae; sin él, el punto está en juego (el skins guarda solo los elegidos).
 */
export interface PuntitoMarcable extends Pick<PuntitoConfig, 'id' | 'tipo' | 'nombre' | 'valor'> {
  activo?: boolean
}

/**
 * Los puntos especiales que se marcan en un hoyo: manuales y activos; el greenie solo en un par 3 conocido (sin
 * par, no se ofrece: no se finge un par 3). Sirve a la Timba y al skins (mismo filtro, misma regla).
 */
export function puntitosMarcables<P extends PuntitoMarcable>(config: { puntitos: readonly P[] }, par: number | null | undefined): P[] {
  return config.puntitos.filter(p => p.activo !== false && PUNTITOS_MANUALES.includes(p.tipo) && seJuegaEnElHoyo(p.tipo, par))
}

/**
 * Lo que el scorer lee de `GET /juego` para marcar puntos especiales. Lo cumplen la vista de la Timba
 * (`VistaDelJuego`) y la del skins (`VistaDelSkinsEnElScorer`): la cola de marcas y los botones no saben del juego.
 */
export interface VistaConMarcas {
  config: { puntitos: readonly PuntitoMarcable[] }
  jugadorIds: readonly string[]
  /** Guardadas, en orden (`created_at`, `id`). */
  marcas: readonly MarcaPuntito[]
  /** Jugador → hoyo desde el que se retiró. */
  retiros: Readonly<Record<string, number>>
  rondaCerrada: boolean
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
  /**
   * Si el botón se muestra. Un jugador oculto deja su hueco: cada jugador tiene siempre la misma posición en la
   * grilla, así un score corregido no corre a los demás de columna (un toque en movimiento no cae en otro).
   */
  visible: boolean
  marcado: boolean
  /** Marcada (o quitada) en el teléfono y todavía sin confirmar por el servidor. */
  enEspera: boolean
  /**
   * Razón si está marcada y no cuenta; `null` si cuenta o si todavía no se sabe. Con score anotado (y par
   * conocido) o un retiro, lo juzga el teléfono sin esperar al motor; sin score, lo dice el motor.
   */
  noCuenta: string | null
}

export interface MarcasDeUnPuntito {
  puntito: PuntitoMarcable
  nombre: string
  /** Aclaración junto al nombre ("uno por hoyo"); `null` si no hay. */
  nota: string | null
  /** Por qué no hay ningún botón visible ("Nadie en par o mejor"); `null` si hay botones o no hay nada que decir. */
  pista: string | null
  /** Uno por jugador, en el orden de `jugadorIds` (ver `visible`). */
  jugadores: BotonDeMarca[]
}

/**
 * Los botones del hoyo: a cada jugador se le ofrece un punto salvo que el motor seguro lo rechace (`sePuedeOfrecer`:
 * sandy y greenie con un score ya anotado sobre par; greenie fuera de un par 3) o que esté retirado. Una marca ya
 * puesta se muestra SIEMPRE (aunque le hayan corregido el score o se haya retirado), con su "no cuenta", para que se
 * pueda quitar: nunca se esconde una marca.
 */
export function marcasDelHoyo(input: {
  puntitos: readonly PuntitoMarcable[]
  jugadorIds: readonly string[]
  hoyo: number
  /** `marcasVigentes`. */
  marcas: readonly MarcaPuntito[]
  /** Las que esperan envío (de este hoyo o de otros). */
  enEspera: readonly MarcaPuntito[]
  /** Lo que el motor de la Timba juzgó del hoyo; `null` si no hay (hoyo pendiente, o un skins: juzga el teléfono). */
  resultadoDelHoyo: ResultadoHoyoDelJuego | null
  /** Golpes de cada jugador en este hoyo, como están en el teléfono (sin anotar = ausente). */
  golpes: Readonly<Record<string, number | null | undefined>>
  /** Par del hoyo; `null`/`undefined` si no se conoce. */
  par: number | null | undefined
  /** Retirados en este hoyo: no se les ofrece nada. */
  retirados: ReadonlySet<string>
}): MarcasDeUnPuntito[] {
  const { puntitos, jugadorIds, hoyo, marcas, enEspera, resultadoDelHoyo, golpes, par, retirados } = input
  return puntitos.map(puntito => {
    const jugadores = jugadorIds.map((jugadorId): BotonDeMarca => {
      const clave = { jugadorId, hoyo, puntitoId: puntito.id }
      const marcado = marcas.some(m => misma(m, clave))
      const visible = marcado || (!retirados.has(jugadorId) && sePuedeOfrecer(puntito.tipo, golpes[jugadorId], par))
      return { jugadorId, visible, marcado, enEspera: enEspera.some(m => misma(m, clave)), noCuenta: marcado ? razonNoCuenta(puntito, jugadorId) : null }
    })
    const hayBotones = jugadores.some(j => j.visible)
    // La pista explica un hueco que el scorer ve: alguien en juego anotó sobre par (si todos están retirados, nada).
    const alguienSobrePar = jugadorIds.some(id => !retirados.has(id) && porQueNoCuenta(puntito.tipo, golpes[id], par)?.motivo === 'sobre_par')
    return {
      puntito,
      nombre: nombreDelPuntito(puntito),
      nota: esUnoPorHoyo(puntito.tipo) ? 'uno por hoyo' : null,
      pista: !hayBotones && alguienSobrePar ? 'Nadie en par o mejor' : null,
      jugadores,
    }
  })

  function razonNoCuenta(puntito: PuntitoMarcable, jugadorId: string): string | null {
    // Con un dato local seguro (score anotado con par conocido, o un retiro) el juicio del teléfono es el definitivo,
    // en los dos sentidos: el del motor puede venir atrasado (corregir un 5 a 4 tiene que sacar el "no cuenta" al
    // tiro). Sin score anotado manda el motor: un chipingo marcado antes de anotar es legítimo.
    const retirado = retirados.has(jugadorId)
    const g = golpes[jugadorId]
    if (retirado || (typeof g === 'number' && g > 0 && typeof par === 'number')) {
      return porQueNoCuenta(puntito.tipo, retirado ? null : g, par)?.razon ?? null
    }
    const evaluado = resultadoDelHoyo?.especiales.find(e => e.jugadorId === jugadorId && e.puntitoId === puntito.id)
    return evaluado && !evaluado.cuenta ? evaluado.razon ?? 'No cuenta' : null
  }
}
