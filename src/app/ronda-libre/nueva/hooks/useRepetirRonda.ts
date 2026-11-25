'use client'

import { useEffect, useRef, useState } from 'react'
import type { ConfigSkins } from '@/golf/formats/skins'
import { SKINS_LIBRE_ABIERTO } from '@/lib/auth/skins-libre-abierto'
import type { EstadoDelPermiso } from './usePermisoDeJuego'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'

/** Repetir un Skins sin permiso para crearlo (o sin señal para confirmarlo): se repite la ronda sin el Skins y se dice. */
export const AVISO_SKINS_NO_DISPONIBLE = 'No pudimos activar el Skins: la ronda se repite sin él.'

/** Mientras se confirma el permiso de un Skins repetido, «Crear» espera: crear ahí sería una ronda sin el Skins. */
export const ESPERANDO_EL_SKINS: ProblemaDeLaRonda = {
  titulo: 'Confirmando el Skins',
  detalle: 'Confirmando el Skins… «Crear ronda» se habilita en cuanto llegue.',
}

/**
 * «Repetir ronda» en el asistente. La ronda (cancha, jugadores, formato) la repite `repetirBase`; un Skins se repite
 * con sus reglas (`ponerSkins`) solo con permiso. El permiso llega por red: si todavía no se sabe, el Skins queda
 * esperando y se aplica cuando llega el «sí»; con «no» (o sin señal tras los reintentos) queda la ronda sin Skins y
 * `aviso` lo dice. Antes se degradaba en silencio a stroke play si se tocaba Repetir mientras el permiso cargaba.
 */
export function useRepetirRonda<R extends { skins: ConfigSkins | null }>(input: {
  /** Estado del permiso de juegos (`useEstadoDelPermisoDeJuegosDeLaRonda`). */
  permiso: EstadoDelPermiso
  repetirBase: (r: R) => void
  ponerSkins: (skins: ConfigSkins) => void
  soltarSkins: () => void
}): {
  repetir: (r: R) => void
  /**
   * El usuario tomó otro camino (cambió el formato o los equipos, o cerró el aviso con la X): se olvida el Skins
   * repetido. Cancela el que esperaba el permiso (no se pone encima de lo que eligió después) y borra el aviso.
   */
  descartar: () => void
  esperandoPermiso: boolean
  aviso: string | null
  /** `ESPERANDO_EL_SKINS` mientras se espera el permiso (bloquea «Crear»); `null` si no. */
  bloqueoDeCrear: ProblemaDeLaRonda | null
} {
  const permisoSkins: EstadoDelPermiso = SKINS_LIBRE_ABIERTO ? input.permiso : 'no'
  // El Skins de la última ronda repetida (null si no era Skins). Lo demás se deriva: no hay estado que sincronizar.
  const [repetido, setRepetido] = useState<ConfigSkins | null>(null)
  // El Skins ya aplicado (identidad): el efecto no lo vuelve a poner en cada render.
  const aplicado = useRef<ConfigSkins | null>(null)
  // Las acciones cambian en cada render (cierran sobre el formulario): el efecto usa siempre las de ahora.
  const acciones = useRef(input)
  useEffect(() => { acciones.current = input })

  // Llegó el «sí» con un Skins esperando: se aplica una vez.
  useEffect(() => {
    if (!repetido || permisoSkins !== 'si' || aplicado.current === repetido) return
    aplicado.current = repetido
    acciones.current.ponerSkins(repetido)
  }, [repetido, permisoSkins])

  const repetir = (r: R) => {
    input.repetirBase(r)
    setRepetido(r.skins)
    if (r.skins && permisoSkins === 'si') {
      aplicado.current = r.skins
      input.ponerSkins(r.skins)
      return
    }
    // Sin Skins, o esperando el permiso: por ahora la ronda individual que repitió el formulario.
    input.soltarSkins()
  }

  const esperandoPermiso = repetido != null && permisoSkins === 'cargando'
  return {
    repetir,
    descartar: () => setRepetido(null),
    esperandoPermiso,
    aviso: repetido != null && permisoSkins === 'no' ? AVISO_SKINS_NO_DISPONIBLE : null,
    bloqueoDeCrear: esperandoPermiso ? ESPERANDO_EL_SKINS : null,
  }
}
