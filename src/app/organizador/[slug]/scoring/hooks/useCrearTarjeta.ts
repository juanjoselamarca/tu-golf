'use client'

import { useRef, useState } from 'react'
import { pedirTarjetaVigente, type RespuestaPedirTarjeta } from '@/lib/data/tournaments/tarjeta-vigente'

/** Lo que se dice bajo "Crear su tarjeta" si la tarjeta no apareció. */
export const MENSAJE_CREAR_TARJETA = {
  // 2xx sin tarjeta tras releer, 409 round_not_in_play o la función aún no está en la base.
  no_aparece: 'No se pudo crear ahora. Si el torneo está entre rondas, se crea al abrir la siguiente.',
  rechazo_definitivo: 'No se puede: el jugador está retirado o descalificado, o el torneo está cerrado.',
  sin_sesion: 'Tu sesión se cerró. Inicia sesión y vuelve a intentarlo.',
  sin_permiso: 'Solo el organizador del torneo puede crearla.',
  sin_conexion: 'Sin conexión. Intenta de nuevo.',
} as const

export type ResultadoCrearTarjeta = keyof typeof MENSAJE_CREAR_TARJETA

function resultadoDe(respuesta: RespuestaPedirTarjeta): ResultadoCrearTarjeta {
  return respuesta === 'respondio' ? 'no_aparece' : respuesta
}

/**
 * "Crear su tarjeta" del scorer del organizador, para un jugador sin tarjeta en la ronda en juego: pide al
 * servidor la tarjeta de la ronda vigente (`POST /api/torneos/[slug]/tarjeta`, el organizador está
 * autorizado) y relee el roster. Si aparece, el aviso se va solo (el jugador ya tiene tarjeta); si no, queda
 * el resultado para decirlo. El resultado es del jugador con que se pidió: no se arrastra a otro.
 */
export function useCrearTarjeta(args: {
  slug: string | null
  playerId: string | null
  reloadRoster: () => Promise<void>
}) {
  const [creando, setCreando] = useState(false)
  const [ultimo, setUltimo] = useState<{ playerId: string; tipo: ResultadoCrearTarjeta } | null>(null)
  const enCurso = useRef(false)

  const crear = async () => {
    const { slug, playerId, reloadRoster } = args
    if (!slug || !playerId || enCurso.current) return
    enCurso.current = true
    setCreando(true)
    setUltimo(null)
    try {
      const respuesta = await pedirTarjetaVigente({ slug, playerId })
      await reloadRoster()
      setUltimo({ playerId, tipo: resultadoDe(respuesta) })
    } finally {
      enCurso.current = false
      setCreando(false)
    }
  }

  const resultado = ultimo && ultimo.playerId === args.playerId ? ultimo.tipo : null
  return { creando, resultado, crear }
}
