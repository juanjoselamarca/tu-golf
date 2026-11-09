import type { FormatoJuego } from '@/golf/core/rules'
import { EQUIPOS_PARA_COMPETIR, jugadoresPorEquipo } from '@/golf/ronda-libre/plantilla-de-jugadores'

/** Identidad del creador dentro de un equipo. Nunca cambia. */
export const ID_DEL_CREADOR = 'creador'

/** Un equipo del formulario: nombre y los ids de sus integrantes. */
export interface EquipoDeLaRonda {
  nombre: string
  /** Ids de los integrantes (`ID_DEL_CREADOR` o el id de un rival). */
  miembros: string[]
}

export function nombreDeEquipo(posicion: number): string {
  return `Equipo ${posicion + 1}`
}

/**
 * Reparte a los jugadores en equipos SIN preguntar.
 *
 * Antes el asistente mostraba dos equipos vacíos y pedía tocar a cada jugador
 * para asignarlo. Con la gente que hay se arma solo: si alcanza para dos
 * equipos completos (hay rival, hay ganador) se reparten parejos, con el
 * creador en el primero; si no, todos van en un equipo que juega contra el par.
 * Un equipo de 3 en foursome no existe: el tercero abre el segundo equipo y la
 * validación pide su compañero.
 *
 * `previos` conserva los nombres que el usuario ya haya puesto a sus equipos.
 */
export function repartirEnEquipos(
  formato: FormatoJuego,
  ids: readonly string[],
  previos: readonly EquipoDeLaRonda[] = [],
): EquipoDeLaRonda[] {
  const porEquipo = jugadoresPorEquipo(formato)
  if (!porEquipo) return []

  const cantidad =
    ids.length >= porEquipo.min * EQUIPOS_PARA_COMPETIR || ids.length > porEquipo.max
      ? EQUIPOS_PARA_COMPETIR
      : 1

  const equipos: EquipoDeLaRonda[] = Array.from({ length: cantidad }, (_, i) => ({
    nombre: previos[i]?.nombre?.trim() ? previos[i].nombre : nombreDeEquipo(i),
    miembros: [],
  }))

  // Parejo y en orden: con 4 → 2+2, con 3 (foursome) → 2+1.
  const porEquipoAhora = Math.ceil(ids.length / cantidad)
  ids.forEach((id, i) => {
    equipos[Math.min(Math.floor(i / porEquipoAhora), cantidad - 1)].miembros.push(id)
  })
  return equipos
}

/**
 * True si estos equipos siguen sirviendo para el formato: cubren exactamente a
 * `ids` y cada uno respeta el tamaño del formato. Cambiar de Scramble a Best
 * Ball conserva los equipos que el usuario armó; pasar a Foursome con un
 * equipo de 3 los rearma.
 */
export function equiposSirvenPara(
  formato: FormatoJuego,
  equipos: readonly EquipoDeLaRonda[],
  ids: readonly string[],
): boolean {
  const porEquipo = jugadoresPorEquipo(formato)
  if (!porEquipo || equipos.length === 0) return false
  const asignados = equipos.flatMap(e => e.miembros)
  if (asignados.length !== ids.length || new Set(asignados).size !== asignados.length) return false
  if (!ids.every(id => asignados.includes(id))) return false
  return equipos.every(e => e.miembros.length >= porEquipo.min && e.miembros.length <= porEquipo.max)
}

/** A qué equipo puede pasar un jugador y, si hace falta, con quién se intercambia. */
export interface MovimientoDeEquipo {
  /** Índice del equipo de destino. */
  equipoIdx: number
  /** Id del integrante del destino que viene de vuelta; null si el jugador se mueve solo. */
  intercambiaCon: string | null
}

/**
 * El movimiento posible para corregir el reparto: al otro equipo. Si el jugador
 * cabe allá y su equipo no queda bajo el mínimo del formato, se mueve solo; si
 * no, se intercambia con el último integrante del destino (antes que el creador).
 *
 * Antes "Mover a" sólo existía cuando el destino tenía cupo: en Foursome 2+2
 * nunca aparecía (no había cómo cambiar las parejas) y en Scramble 2+2 dejaba
 * al creador solo en su equipo. Con un solo equipo no hay a dónde ir.
 */
export function destinoParaMover(
  formato: FormatoJuego,
  equipos: readonly EquipoDeLaRonda[],
  id: string,
): MovimientoDeEquipo | null {
  const porEquipo = jugadoresPorEquipo(formato)
  const origenIdx = equipos.findIndex(e => e.miembros.includes(id))
  if (!porEquipo || origenIdx < 0) return null
  const destinoIdx = equipos.findIndex((_, i) => i !== origenIdx)
  if (destinoIdx < 0) return null

  const origen = equipos[origenIdx]
  const destino = equipos[destinoIdx]
  const seMueveSolo = destino.miembros.length < porEquipo.max && origen.miembros.length - 1 >= porEquipo.min
  if (seMueveSolo) return { equipoIdx: destinoIdx, intercambiaCon: null }

  const sinCreador = destino.miembros.filter(m => m !== ID_DEL_CREADOR)
  const pareja = sinCreador[sinCreador.length - 1] ?? destino.miembros[destino.miembros.length - 1]
  return pareja ? { equipoIdx: destinoIdx, intercambiaCon: pareja } : null
}

/**
 * Aplica un movimiento. En un intercambio cada uno ocupa el lugar del otro (las
 * tarjetas no saltan de posición); en un movimiento simple un equipo rival que
 * queda vacío desaparece, igual que al quitar a su último integrante.
 */
export function moverEntreEquipos(
  equipos: readonly EquipoDeLaRonda[],
  id: string,
  movimiento: MovimientoDeEquipo,
): EquipoDeLaRonda[] {
  const { equipoIdx, intercambiaCon } = movimiento
  if (intercambiaCon) {
    return equipos.map(e => ({
      ...e,
      miembros: e.miembros.map(m => (m === id ? intercambiaCon : m === intercambiaCon ? id : m)),
    }))
  }
  return equipos
    .map((e, i) => ({
      ...e,
      // Se saca antes de agregar: aplicar el mismo movimiento dos veces no duplica a nadie.
      miembros: i === equipoIdx ? [...e.miembros.filter(m => m !== id), id] : e.miembros.filter(m => m !== id),
    }))
    .filter((e, i) => i === 0 || e.miembros.length > 0)
}
