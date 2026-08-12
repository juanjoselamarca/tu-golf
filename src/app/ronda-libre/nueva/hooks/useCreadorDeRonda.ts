'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import {
  fetchPerfilCreador,
  fetchRondasRecientes,
  type RondaReciente,
} from '@/lib/data/ronda-libre-nueva'

/** Clave de la última cancha jugada, para precargarla en la próxima ronda. */
const CLAVE_ULTIMA_CANCHA = 'gp_last_course'

export interface UltimaCancha {
  id: string
  nombre: string
}

export interface CreadorDeRonda {
  userId: string | null
  nombre: string
  indice: number | null
  setIndice: (indice: number | null) => void
  rondasRecientes: RondaReciente[]
  /** Cancha de la ronda anterior, si el navegador la recuerda. */
  ultimaCancha: UltimaCancha | null
}

/**
 * Guarda la cancha elegida para precargarla la próxima vez.
 *
 * Sin `id` no se guarda: una cancha escrita a mano que no está en el catálogo
 * no tiene par ni ratings, y precargarla dejaría la próxima ronda sin handicap
 * sin que el usuario entienda por qué.
 */
export function recordarUltimaCancha(cancha: { id: string | null; nombre: string }): void {
  if (!cancha.id) return
  try {
    localStorage.setItem(CLAVE_ULTIMA_CANCHA, JSON.stringify(cancha))
  } catch {
    // Safari en modo privado tira al escribir. Perder la preferencia no puede
    // romper la creación de la ronda.
  }
}

function leerUltimaCancha(): UltimaCancha | null {
  try {
    const guardado = localStorage.getItem(CLAVE_ULTIMA_CANCHA)
    if (!guardado) return null
    const { id, nombre } = JSON.parse(guardado)
    return id && nombre ? { id, nombre } : null
  } catch {
    return null
  }
}

/**
 * Quién crea la ronda: sesión, perfil, sus últimas rondas y la cancha que venía
 * usando. Manda al login si no hay sesión.
 */
export function useCreadorDeRonda(): CreadorDeRonda {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [indice, setIndice] = useState<number | null>(null)
  const [rondasRecientes, setRondasRecientes] = useState<RondaReciente[]>([])
  const [ultimaCancha, setUltimaCancha] = useState<UltimaCancha | null>(null)

  useEffect(() => {
    let cancelado = false

    const cargar = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login?redirect=/ronda-libre/nueva')
        return
      }
      if (cancelado) return
      setUserId(user.id)

      const fallback = user.user_metadata?.name || user.email?.split('@')[0] || 'Jugador'
      const perfil = await fetchPerfilCreador(user.id, fallback)
      if (cancelado) return
      setNombre(perfil.nombre)
      setIndice(perfil.indice)
      setUltimaCancha(leerUltimaCancha())

      // Las rondas recientes son un atajo, no un requisito: si fallan, la
      // pantalla tiene que quedar utilizable igual.
      try {
        const recientes = await fetchRondasRecientes(user.id)
        if (!cancelado) setRondasRecientes(recientes)
      } catch (err) {
        captureError(err, { context: 'ronda-libre.nueva.rondas-recientes', userId: user.id })
      }
    }

    cargar().catch(err => {
      captureError(err, { context: 'ronda-libre.nueva.creador' })
    })

    return () => { cancelado = true }
  }, [router])

  return { userId, nombre, indice, setIndice, rondasRecientes, ultimaCancha }
}
