'use client'

import { useEffect, useRef, useState } from 'react'
import type { ConfigSkins } from '@/golf/formats/skins'
import { SKINS_LIBRE_ABIERTO } from '@/lib/auth/skins-libre-abierto'
import type { EstadoDelPermiso } from './usePermisoDeJuego'

/** Repetir un Skins sin permiso para crearlo (o sin señal para confirmarlo): se repite la ronda sin el Skins y se dice. */
export const AVISO_SKINS_NO_DISPONIBLE = 'No pudimos activar el Skins: la ronda se repite sin él.'

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
}): { repetir: (r: R) => void; esperandoPermiso: boolean; aviso: string | null } {
  const permisoSkins: EstadoDelPermiso = SKINS_LIBRE_ABIERTO ? input.permiso : 'no'
  const [pendiente, setPendiente] = useState<ConfigSkins | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Las acciones cambian en cada render (cierran sobre el formulario): el efecto usa siempre las de ahora.
  const acciones = useRef(input)
  useEffect(() => { acciones.current = input })

  useEffect(() => {
    if (!pendiente || permisoSkins === 'cargando') return
    if (permisoSkins === 'si') acciones.current.ponerSkins(pendiente)
    else {
      acciones.current.soltarSkins()
      setAviso(AVISO_SKINS_NO_DISPONIBLE)
    }
    setPendiente(null)
  }, [pendiente, permisoSkins])

  const repetir = (r: R) => {
    input.repetirBase(r)
    setAviso(null)
    setPendiente(null)
    if (!r.skins) return input.soltarSkins()
    if (permisoSkins === 'si') return input.ponerSkins(r.skins)
    input.soltarSkins()
    if (permisoSkins === 'no') setAviso(AVISO_SKINS_NO_DISPONIBLE)
    else setPendiente(r.skins)
  }

  return { repetir, esperandoPermiso: pendiente != null, aviso }
}
