import type { FormatoJuego } from '@/golf/core/rules'
import { EQUIPOS_PARA_COMPETIR, jugadoresPorEquipo } from '@/golf/ronda-libre/plantilla-de-jugadores'

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
