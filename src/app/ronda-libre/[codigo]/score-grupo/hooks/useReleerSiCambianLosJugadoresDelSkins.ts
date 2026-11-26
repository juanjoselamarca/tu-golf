'use client'

import { useEffect, useRef } from 'react'
import { enElOrden } from '@/lib/ronda/orden-jugadores'

/**
 * La clave de un desajuste entre los jugadores del Skins (la vista, que el scorer relee sola) y los de la ronda que
 * tiene la pantalla; `null` si calzan o si todavía no hay vista. Con un Skins editado desde otra pestaña u otro
 * teléfono, la vista trae la lista nueva y la ronda en pantalla sigue con la vieja.
 */
export function desajusteDeJugadoresDelSkins(
  vista: { jugadorIds: readonly string[] } | null | undefined,
  jugadores: readonly { id: string }[] | null | undefined,
): string | null {
  if (!vista || !jugadores) return null
  if (enElOrden(vista.jugadorIds, jugadores) !== null) return null
  return `${vista.jugadorIds.join(',')}|${jugadores.map(j => j.id).sort().join(',')}`
}

/**
 * Scorer del Skins: si los jugadores de la vista no son los de la ronda en pantalla, relee la ronda (revisión Fable
 * #898, P1-1). Sin esto, un Skins editado en otro lado dejaba al scorer con la tarjeta del que se quitó (sus golpes
 * daban P0001) y sin la del que se sumó. Una vez por desajuste: si tras releer sigue igual, la vieja es la vista y la
 * pone al día su propia relectura; así no queda leyendo en bucle.
 */
export function useReleerSiCambianLosJugadoresDelSkins(input: {
  vista: { jugadorIds: readonly string[] } | null | undefined
  jugadores: readonly { id: string }[] | null | undefined
  recargar: () => unknown
}): void {
  const { vista, jugadores, recargar } = input
  const clave = desajusteDeJugadoresDelSkins(vista, jugadores)
  const ultima = useRef<string | null>(null)
  useEffect(() => {
    if (clave === null || clave === ultima.current) return
    ultima.current = clave
    void recargar()
  }, [clave, recargar])
}
