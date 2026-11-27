/**
 * Un celular por equipo: equipos sin reclamar que el creador tomó a mano en ESTE teléfono («Anotarlo yo» o
 * «Liberar» en la franja de `EquiposDeOtroCelular`). La regla que los usa es `equiposQueAnota`
 * (`@/golf/ronda-libre/anotador-de-equipo`); acá solo se recuerdan, por ronda. La base admite un solo equipo
 * reclamado por cuenta, por eso no se guardan en el servidor: en cuanto el equipo tiene golpes, la regla ya no
 * necesita este registro. Nunca lanza: sin almacenamiento, ninguno tomado.
 */

const PREFIJO = 'gp:equipos-tomados:v1:'

function almacen(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function leerEquiposTomados(codigo: string): ReadonlySet<string> {
  try {
    const crudo = almacen()?.getItem(PREFIJO + codigo)
    if (!crudo) return new Set()
    const lista: unknown = JSON.parse(crudo)
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function marcarEquipoTomado(codigo: string, equipoId: string): void {
  try {
    const actuales = leerEquiposTomados(codigo)
    if (actuales.has(equipoId)) return
    almacen()?.setItem(PREFIJO + codigo, JSON.stringify([...actuales, equipoId]))
  } catch {
    // sin almacenamiento: el equipo vuelve a la franja al recargar; nada se rompe
  }
}
