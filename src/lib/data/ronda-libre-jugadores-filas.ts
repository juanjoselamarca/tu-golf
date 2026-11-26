// src/lib/data/ronda-libre-jugadores-filas.ts
//
// Las filas de `ronda_libre_jugadores` de una ronda libre: forma del jugador que manda el cliente, la cuenta sugerida
// de un rival y la fila que se graba. Vivían dentro de POST /api/ronda-libre/create; se sacaron para que la edición
// del Skins antes del primer golpe (PUT /api/ronda-libre/[codigo]/skins/jugadores) grabe EXACTAMENTE lo mismo
// («un concepto, una fuente», 26-nov-2026). Sin cambio de conducta.

import { z } from 'zod'
import { HANDICAP_INDEX_MAX, HANDICAP_INDEX_MIN, MENSAJE_INDICE_FUERA_DE_RANGO } from '@/golf/handicap-index-range'
import { captureError } from '@/lib/error-tracking'
import { perfilesQueExisten } from './perfiles-existentes'

/** Un jugador tal como lo manda el asistente de la ronda (crear y editar el Skins). */
export const jugadorDeRondaSchema = z.object({
  nombre: z.string().min(1).max(100),
  // Lo ignora el servidor: el creador entra con su sesión y los rivales con null (#581).
  user_id: z.string().uuid().nullable(),
  // Cuenta que el creador eligió para un rival. Se graba en `perfil_sugerido_id`,
  // que no da ningún poder sobre la ronda (ver `filasDeJugadores`).
  perfil_sugerido_id: z.string().uuid().nullable().optional(),
  handicap: z.number().min(HANDICAP_INDEX_MIN, MENSAJE_INDICE_FUERA_DE_RANGO).max(HANDICAP_INDEX_MAX, MENSAJE_INDICE_FUERA_DE_RANGO).nullable(),
  tees: z.string().max(50).nullable(),
  is_guest: z.boolean().optional(),
  telefono_invitado: z.string().max(30).optional(),
  nombre_invitado: z.string().max(100).optional(),
})

export type JugadorDeRonda = z.infer<typeof jugadorDeRondaSchema>

/**
 * Cuenta elegida para un rival, o null. El creador (posición 0) entra con su
 * sesión y un invitado no tiene cuenta: en esos casos se ignora lo que mande el
 * cliente. Una fila con datos de invitado (teléfono o nombre de invitado, que se
 * graban si son no vacíos) tampoco la lleva aunque `is_guest` venga en false: la
 * sugerencia nunca convive con datos de contacto de un invitado.
 */
export function perfilSugerido(j: JugadorDeRonda, i: number): string | null {
  if (i === 0 || j.is_guest || j.telefono_invitado || j.nombre_invitado) return null
  return j.perfil_sugerido_id ?? null
}

export interface FilaDeJugadorDeRonda {
  id?: string
  ronda_id: string
  nombre: string
  user_id: string | null
  perfil_sugerido_id?: string
  scores: Record<string, never>
  handicap: number | null
  tees: string
  is_guest: boolean
  telefono_invitado: string | null
  nombre_invitado: string | null
}

/**
 * Las filas que se graban, en el orden del pedido. `jugadorIds[i]` (Timba y Skins) es el id que `reglas_juego` ya le
 * asignó a la posición i. `perfilesValidos`: cuentas sugeridas que existen (null = no se pudo verificar: se graba sin
 * la sugerencia).
 */
export function filasDeJugadores(input: {
  jugadores: readonly JugadorDeRonda[]
  rondaId: string
  creadorId: string
  jugadorIds?: readonly string[]
  perfilesValidos: ReadonlySet<string> | null
  teesDeLaRonda: string
}): FilaDeJugadorDeRonda[] {
  return input.jugadores.map((j, i) => {
    const perfil = perfilSugerido(j, i)
    return {
      ...(input.jugadorIds ? { id: input.jugadorIds[i] } : {}),
      ronda_id: input.rondaId,
      nombre: j.nombre.trim(),
      // Sólo el creador entra con cuenta. El creador NO puede escribir el
      // user_id de un rival: eso le metía la ronda (y sus avisos push, el
      // permiso de anotar, su historial y su índice) a cualquier usuario sin su
      // permiso (#581).
      user_id: i === 0 ? input.creadorId : null,
      // La cuenta que el creador eligió para el rival va aparte y sin poderes:
      // ninguna policy, función, push ni historial lee esta columna
      // (perfil-sugerido-sin-poderes / -lectores en src/__tests__). Sólo se manda
      // cuando hay una, así una ronda sin rivales con cuenta no la nombra.
      ...(perfil && input.perfilesValidos?.has(perfil) ? { perfil_sugerido_id: perfil } : {}),
      scores: {},
      handicap: j.handicap,
      tees: j.tees || input.teesDeLaRonda,
      is_guest: j.is_guest || false,
      telefono_invitado: j.telefono_invitado || null,
      nombre_invitado: j.nombre_invitado || null,
    }
  })
}

/**
 * La cuenta elegida para un rival tiene que existir: un id inventado rompería
 * la FK en el INSERT (500 con la ronda a medio crear). Si la base no responde
 * se graba sin la sugerencia (`validos: null`) — es una referencia para aprender
 * del uso, no puede ser el motivo de que el grupo no pueda empezar a jugar.
 */
export async function verificarPerfilesSugeridos(
  jugadores: readonly JugadorDeRonda[],
  ctx: { userId: string; context: string },
): Promise<{ ok: true; validos: ReadonlySet<string> | null } | { ok: false; error: string }> {
  const pedidos = jugadores.map(perfilSugerido).filter((id): id is string => !!id)
  const validos = pedidos.length === 0
    ? new Set<string>()
    : await perfilesQueExisten(pedidos).catch((err) => {
        void captureError(err, { context: ctx.context, userId: ctx.userId, level: 'warning' })
        return null
      })
  const inexistente = validos && jugadores.find((j, i) => {
    const id = perfilSugerido(j, i)
    return !!id && !validos.has(id)
  })
  if (inexistente) {
    return { ok: false, error: `No encontramos la cuenta de ${inexistente.nombre.trim()}. Vuelve a buscar su cuenta o elige «Invitado».` }
  }
  return { ok: true, validos }
}
