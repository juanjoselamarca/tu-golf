/**
 * Armado de un juego de Timba libre desde la pantalla "elegir el juego": cambios puros sobre la config. Cada
 * función devuelve una config nueva; ninguna inventa reglas: combinan las piezas de `config.ts` con los valores
 * de las plantillas (`plantillas.ts`). La validez contra la ronda la decide `validarJuegoPersonalizado`.
 */
import type { ConfigJuego, DueloPareja, PuntitoConfig, TipoPuntito, Unidad } from './config'
import { crearConfigDePlantilla } from './plantillas'

/** Puntos especiales que se ofrecen como chips (el propio pide nombre: queda para más adelante). */
export const PUNTITOS_DEL_CATALOGO = ['birdie', 'sandy', 'chipingo', 'greenie'] as const satisfies readonly TipoPuntito[]
export type PuntitoDelCatalogo = (typeof PUNTITOS_DEL_CATALOGO)[number]

/** Duelos de pareja con que parte un juego de parejas armado a mano: los de La Colombiana. */
function duelosDeParejaPorDefecto(): ConfigJuego['duelos'] {
  return crearConfigDePlantilla('colombiana').duelos
}

/**
 * Cambia la unidad. Pasar a parejas parte de los duelos de La Colombiana; pasar a individual, del 2-0-2.
 * Las parejas y el sorteo se borran siempre: se eligen después, con los jugadores ya puestos.
 */
export function cambiarUnidad(config: ConfigJuego, unidad: Unidad): ConfigJuego {
  const resto: ConfigJuego = { ...config }
  delete resto.parejas
  delete resto.sorteo
  if (unidad === config.unidad) return resto
  const eraParejas = config.unidad !== 'individual'
  const seraParejas = unidad !== 'individual'
  const duelos = eraParejas === seraParejas
    ? config.duelos
    : seraParejas ? duelosDeParejaPorDefecto() : crearConfigDePlantilla('dos_cero_dos').duelos
  return { ...resto, unidad, duelos }
}

/** Lo que gana el mejor del hoyo y lo que resta el peor, en un duelo por puesto (en positivo). */
export interface ExtremosPorPuesto { mejor: number; peor: number }

/** Lee los extremos del duelo por puesto (de la tabla de 4, o de 3 si no hay de 4). `null` si no hay. */
export function extremosPorPuesto(config: ConfigJuego): ExtremosPorPuesto | null {
  for (const d of config.duelos) {
    if (d.tipo !== 'por_puesto') continue
    const tabla = d.tablas['4'] ?? d.tablas['3']
    if (!tabla) return null
    return { mejor: tabla[0], peor: Math.abs(tabla[tabla.length - 1]) }
  }
  return null
}

/** Fija los extremos del duelo por puesto para 3 y 4 jugadores; los del medio quedan en 0. */
export function cambiarExtremosPorPuesto(config: ConfigJuego, { mejor, peor }: ExtremosPorPuesto): ConfigJuego {
  const resta = peor === 0 ? 0 : -peor // sin −0
  return {
    ...config,
    duelos: config.duelos.map(d => d.tipo === 'por_puesto'
      ? { tipo: 'por_puesto' as const, tablas: { '3': [mejor, 0, resta], '4': [mejor, 0, 0, resta] } }
      : d),
  }
}

/** Cambia el valor (o el tipo) del duelo de pareja en la posición `i`. */
export function cambiarDueloPareja(
  config: ConfigJuego, i: number, cambio: Partial<Pick<DueloPareja, 'valor' | 'tipo'>>,
): ConfigJuego {
  return { ...config, duelos: config.duelos.map((d, j) => (j === i && d.tipo !== 'por_puesto' ? { ...d, ...cambio } : d)) }
}

/** "El perdedor resta" para todos los duelos de pareja. */
export function cambiarPerdedorResta(config: ConfigJuego, perdedorResta: boolean): ConfigJuego {
  return { ...config, duelos: config.duelos.map(d => (d.tipo === 'por_puesto' ? d : { ...d, perdedorResta })) }
}

/** Prende o apaga un punto especial. Su id es el tipo: estable al editar las reglas (contrato, cláusula 6). */
export function alternarPuntito(config: ConfigJuego, tipo: PuntitoDelCatalogo): ConfigJuego {
  if (config.puntitos.some(p => p.tipo === tipo)) {
    return { ...config, puntitos: config.puntitos.filter(p => p.tipo !== tipo) }
  }
  const destino = config.puntitos[0]?.destino ?? 'individual'
  const nuevo: PuntitoConfig = { id: tipo, tipo, valor: 1, destino, activo: true }
  return { ...config, puntitos: [...config.puntitos, nuevo] }
}

/** A quién suman los puntos especiales en un juego de parejas (uno para todos). */
export function cambiarDestinoPuntitos(config: ConfigJuego, destino: PuntitoConfig['destino']): ConfigJuego {
  return { ...config, puntitos: config.puntitos.map(p => ({ ...p, destino })) }
}
