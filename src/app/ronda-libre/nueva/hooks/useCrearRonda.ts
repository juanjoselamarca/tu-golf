'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { captureError } from '@/lib/error-tracking'
import { useToast } from '@/hooks/useToast'
import { isTeamFormat } from '@/golf/formats'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { validarNuevaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import type { FormaDeLaRonda } from '@/golf/ronda-libre/forma-de-la-ronda'
import type { EquipoDeLaRonda, RivalDelCreador } from './useFormularioDeRonda'

/**
 * Un jugador de la ronda, ya resuelto: el creador y los rivales con nombre, en
 * el MISMO orden que van a tener en la API y en la asignación de equipos.
 *
 * Existe porque el armado del payload indexaba `adminPlayers[i - 1]` sobre la
 * lista SIN filtrar mientras recorría la lista filtrada. Con un rival sin nombre
 * en el medio, el handicap, el tee y el teléfono se le pegaban al jugador
 * equivocado — y los equipos, que sí usaban la lista filtrada, apuntaban a otro.
 */
export interface JugadorDeLaRonda {
  nombre: string
  indice: number | null
  tees: string
  esCreador: boolean
  esInvitado: boolean
  telefono: string
}

export function jugadoresDeLaRonda(args: {
  creador: { nombre: string; indice: number | null }
  teeGlobal: string
  rivales: RivalDelCreador[]
}): JugadorDeLaRonda[] {
  const { creador, teeGlobal, rivales } = args
  return [
    {
      nombre: creador.nombre,
      indice: creador.indice,
      tees: teeGlobal,
      esCreador: true,
      esInvitado: false,
      telefono: '',
    },
    ...rivales
      .filter(r => r.nombre.trim())
      .map(r => ({
        nombre: r.nombre.trim(),
        indice: r.handicap,
        tees: r.tees ?? teeGlobal,
        esCreador: false,
        esInvitado: r.tipo === 'invitado',
        telefono: r.telefono,
      })),
  ]
}

interface Args {
  userId: string | null
  courseId: string | null
  cancha: string
  /** Tee de la ronda. Cada jugador puede tener el suyo, pero la ronda guarda uno. */
  teeGlobal: string
  jugadores: JugadorDeLaRonda[]
  equipos: EquipoDeLaRonda[]
  formato: FormatoJuego
  modo: ModoJuego
  fecha: string
  forma: FormaDeLaRonda
  recorridos: string[]
  llevaElScoreDelGrupo: boolean
}

export interface RondaCreada {
  codigo: string
}

export function useCrearRonda(args: Args) {
  const { showError } = useToast()
  const [creando, setCreando] = useState(false)
  const [creada, setCreada] = useState<RondaCreada | null>(null)

  /** Problema que impide crear la ronda, o `null` si está lista. */
  const problema = validarNuevaRonda({
    cancha: args.cancha,
    formato: args.formato,
    modo: args.modo,
    jugadores: args.jugadores.map(j => ({ nombre: j.nombre, indice: j.indice })),
    equipos: args.equipos,
  })

  const crear = async () => {
    if (!args.userId || creando) return

    if (problema) {
      showError(problema.titulo, problema.detalle)
      return
    }

    setCreando(true)
    try {
      const res = await fetch('/api/ronda-libre/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: args.courseId || null,
          course_name: args.cancha,
          tees: args.teeGlobal,
          holes: args.forma.holes,
          fecha: args.fecha,
          hoyo_inicio: args.forma.hoyoInicio,
          formato_juego: args.formato,
          modo_juego: args.modo,
          admin_mode: args.llevaElScoreDelGrupo,
          recorridos: args.recorridos.length > 0 ? args.recorridos : undefined,
          jugadores: args.jugadores.map(j => ({
            nombre: j.nombre,
            user_id: j.esCreador ? args.userId : null,
            handicap: j.indice,
            tees: j.tees,
            is_guest: j.esInvitado,
            telefono_invitado: j.esInvitado ? j.telefono || undefined : undefined,
            nombre_invitado: j.esInvitado ? j.nombre : undefined,
          })),
          equipos: isTeamFormat(args.formato)
            ? args.equipos.map(e => ({ nombre: e.nombre, jugadorIndices: e.jugadorIndices }))
            : undefined,
        }),
      })

      const result = await res.json()
      if (!res.ok || !result.ok) {
        showError('Error al crear la ronda', result.error || 'Algo salió mal. Intenta nuevamente.')
        return
      }

      const supabase = createClient()
      await trackEvent(supabase, args.userId, 'ronda_creada', {
        codigo: result.codigo,
        cancha: args.cancha,
        holes: args.forma.holes,
      })

      setCreada({ codigo: result.codigo })
    } catch (err) {
      captureError(err, {
        context: 'ronda-libre.nueva.crear',
        userId: args.userId,
        meta: { cancha: args.cancha, formato: args.formato },
      })
      showError('Error al crear la ronda', 'No pudimos contactar el servidor. Revisa tu conexión.')
    } finally {
      // En el `finally`: antes el flag quedaba en true si el fetch tiraba, y el
      // botón se quedaba en "Creando ronda..." para siempre. En cancha, con
      // señal intermitente, eso obligaba a recargar la página.
      setCreando(false)
    }
  }

  return { crear, creando, creada, problema }
}
