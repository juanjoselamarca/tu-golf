'use client'

import { useEffect, useRef, useState } from 'react'
import { pedirTarjetaVigente } from '@/lib/data/tournaments/tarjeta-vigente'

/** Lo que se dice bajo los botones del aviso sin tarjeta tras "Buscar mi tarjeta". */
export const MENSAJE_BUSQUEDA_TARJETA = {
  no_aparece: 'Todavía no aparece. Sigue en papel.',
  sin_conexion: 'Sin conexión. Intenta de nuevo.',
  // Con este resultado, "Iniciar sesión" (`avisoSinAcceso('sin_sesion')`, vuelve a esta tarjeta) pasa a
  // ser el botón principal. Sin "tu sesión se cerró": vale también para quien nunca la inició.
  sin_sesion: 'Para buscarla necesitas tu cuenta.',
} as const

export type ResultadoBusquedaTarjeta = keyof typeof MENSAJE_BUSQUEDA_TARJETA

/**
 * "Buscar mi tarjeta" del aviso sin tarjeta: primero pide al servidor que asegure la tarjeta de la
 * ronda vigente (`POST /api/torneos/[slug]/tarjeta`) y después relee el roster, que es la verdad.
 * Si la tarjeta aparece, el aviso se va solo (la pantalla deja de estar "sin tarjeta"); si no, queda
 * el resultado para decirlo bajo los botones.
 *
 * - `sin_sesion`: la ruta respondió 401: no hay sesión (vencida o nunca iniciada). La pantalla pone
 *   "Iniciar sesión" como botón principal.
 * - `sin_conexion`: la ruta no contestó (red, plazo, 5xx) o el roster no se pudo releer.
 * - `no_aparece`: todo contestó y la tarjeta sigue sin estar (torneo cerrado, ronda sin juego, la
 *   función aún no está en la base, no es su tarjeta...). El jugador sigue en papel.
 *
 * El resultado es del jugador con que se buscó: al cambiar de jugador no se arrastra.
 */
export function useBuscarTarjeta(args: {
  slug: string
  playerId: string | null
  guestId: string | null
  guestToken: string | null
  /** Relee el roster. `true` si se pudo. */
  reloadRoster: () => Promise<boolean>
  /**
   * Buscar sola, UNA vez por jugador, cuando pasa a `true` (vuelta del login con `?jugador=` a una
   * tarjeta sin tarjeta: el jugador ya pidió buscarla antes de iniciar sesión).
   */
  buscarAlAbrir?: boolean
}) {
  const [buscando, setBuscando] = useState(false)
  const [ultimo, setUltimo] = useState<{ playerId: string; tipo: ResultadoBusquedaTarjeta } | null>(null)
  const enCurso = useRef(false)

  const buscar = async () => {
    const { slug, playerId, guestId, guestToken, reloadRoster } = args
    if (!playerId || enCurso.current) return
    enCurso.current = true
    setBuscando(true)
    setUltimo(null)
    try {
      const respuesta = await pedirTarjetaVigente({ slug, playerId, guestId, guestToken })
      const releyo = await reloadRoster()
      const tipo: ResultadoBusquedaTarjeta =
        respuesta === 'sin_sesion' ? 'sin_sesion'
          : respuesta === 'sin_conexion' || !releyo ? 'sin_conexion'
            : 'no_aparece'
      setUltimo({ playerId, tipo })
    } finally {
      enCurso.current = false
      setBuscando(false)
    }
  }

  const yaBuscadaAlAbrir = useRef<Set<string>>(new Set())
  const buscarRef = useRef(buscar)
  useEffect(() => { buscarRef.current = buscar })
  useEffect(() => {
    if (!args.buscarAlAbrir || !args.playerId || yaBuscadaAlAbrir.current.has(args.playerId)) return
    yaBuscadaAlAbrir.current.add(args.playerId)
    void buscarRef.current()
  }, [args.buscarAlAbrir, args.playerId])

  const resultado = ultimo && ultimo.playerId === args.playerId ? ultimo.tipo : null
  return { buscando, resultado, buscar }
}
