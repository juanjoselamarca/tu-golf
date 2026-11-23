/**
 * FUENTE ÚNICA de "¿esta ronda se puede crear?".
 *
 * Antes vivía inline dentro del `onClick` de Crear ronda, mezclada con el
 * armado del payload y con `setLoading` en el medio. Como función pura se puede
 * testear cada regla y — sobre todo — la puede consultar la UI para desactivar
 * el botón ANTES de que el usuario lo toque, en vez de dejarlo apretar y
 * responderle con un toast.
 *
 * Espeja las validaciones de `POST /api/ronda-libre/create`. El servidor sigue
 * siendo la autoridad; esto evita el viaje y el error tardío.
 */

import { FORMAT_META, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { isMatchPlayFormat, isTeamFormat } from '@/golf/formats'
import { esIndiceDeHandicapValido, MENSAJE_INDICE_FUERA_DE_RANGO } from '@/golf/handicap-index-range'
import {
  EQUIPOS_MINIMOS,
  MAX_JUGADORES_POR_RONDA,
  jugadoresMinimos,
  jugadoresPorEquipo,
  maxEquipos,
} from './plantilla-de-jugadores'
import {
  HOYOS_DE_EQUIPOS_DE_CLUB,
  MAX_EQUIPOS_DE_CLUB,
  admiteEquiposDeClub,
  esHandicapDeClubValido,
  esHoyosDeEquiposDeClub,
  handicapDeClubMaximo,
  type QuienAnota,
} from './equipos-de-club'
import { nombreVisibleDeEquipo } from './nombre-de-equipo'

export interface JugadorAValidar {
  nombre: string
  /** Índice WHS. `null` = no cargado. */
  indice: number | null
  /**
   * Cuenta de Golfers+ que el creador eligió para este rival (`perfil_sugerido_id`).
   * Solo referencia: no le da a esa cuenta ningún poder sobre la ronda (eso es
   * `user_id`, que para un rival es null desde #581). El creador va sin esto.
   */
  perfilId?: string | null
}

export interface EquipoAValidar {
  nombre: string
  jugadorIndices: number[]
}

/** Un equipo de club tal como lo escribió el creador. `handicap` null = el campo vacío. */
export interface EquipoDeClubAValidar {
  nombre: string
  handicap: number | null
}

/** Scramble rápido: equipos con el hándicap del club, sin jugadores (src/golf/ronda-libre/equipos-de-club.ts). */
export interface EquiposDeClubAValidar {
  equipos: EquipoDeClubAValidar[]
  holes: number
  /** Con un solo equipo no se pregunta: llega null. */
  quienAnota: QuienAnota | null
}

export interface RondaAValidar {
  cancha: string
  formato: FormatoJuego
  modo: ModoJuego
  /** Creador primero, después los rivales con nombre cargado. */
  jugadores: JugadorAValidar[]
  equipos: EquipoAValidar[]
  /** Cuenta del creador. Sin ella no se puede chequear que no se eligió a sí mismo. */
  creadorId?: string | null
  /**
   * Presente = la ronda es de equipos de club: `equipos` va vacío, `jugadores` es solo el creador y los índices
   * no cuentan (los golpes salen del hándicap del club, no de los jugadores).
   */
  equiposDeClub?: EquiposDeClubAValidar
}

export interface ProblemaDeLaRonda {
  titulo: string
  detalle: string
}

/** `null` cuando la ronda se puede crear. */
export function validarNuevaRonda(ronda: RondaAValidar): ProblemaDeLaRonda | null {
  // Rama propia y no una regla más de la cadena: con equipos de club no aplican el mínimo de jugadores por equipo
  // ni el índice del creador en neto.
  if (ronda.equiposDeClub) {
    return problemaDeCancha(ronda) ?? problemaDeRondaConEquiposDeClub(ronda, ronda.equiposDeClub)
  }
  return (
    problemaDeCancha(ronda) ??
    problemaDeCantidad(ronda) ??
    problemaDePerfiles(ronda) ??
    problemaDeEquipos(ronda) ??
    problemaDeRangoDeIndices(ronda) ??
    problemaDeIndices(ronda)
  )
}

function problemaDeCancha({ cancha }: RondaAValidar): ProblemaDeLaRonda | null {
  if (cancha.trim()) return null
  return { titulo: 'Selecciona una cancha', detalle: 'Elige la cancha donde vas a jugar.' }
}

const PERFIL_CARGANDO: ProblemaDeLaRonda = {
  titulo: 'Falta un nombre',
  detalle: 'Todavía estamos cargando tu perfil. Espera un segundo e intenta de nuevo.',
}

/** Lo usa también el zod de POST /api/ronda-libre/create, para que el tope responda con la misma frase. */
export const DETALLE_DEMASIADOS_EQUIPOS_DE_CLUB = `Este modo admite hasta ${MAX_EQUIPOS_DE_CLUB} equipos.`

/**
 * Ronda de equipos de club. El orden sigue el del formulario (hoyos, equipos de arriba abajo, quién anota al
 * final): el primer problema que se muestra es el del campo más arriba.
 */
function problemaDeRondaConEquiposDeClub(
  { formato, modo, jugadores }: RondaAValidar,
  { equipos, holes, quienAnota }: EquiposDeClubAValidar,
): ProblemaDeLaRonda | null {
  if (!admiteEquiposDeClub(formato)) {
    return { titulo: 'Solo en Scramble', detalle: 'Los equipos con hándicap del club se juegan solo en Scramble.' }
  }
  // El creador es la única tarjeta: los equipos no tienen jugadores (plan §1).
  if (jugadores.length > 1) {
    return { titulo: 'Sobran jugadores', detalle: 'Con equipos del club solo vas tú en la ronda. Quita los demás jugadores.' }
  }
  // Sin el creador o sin su nombre: su perfil todavía no cargó (mismo caso que en la ronda con jugadores).
  if (!jugadores[0]?.nombre.trim()) return PERFIL_CARGANDO
  if (!esHoyosDeEquiposDeClub(holes)) {
    return { titulo: 'Hoyos no disponibles', detalle: `Este modo se juega a ${HOYOS_DE_EQUIPOS_DE_CLUB.join(' o ')} hoyos.` }
  }
  if (equipos.length === 0) {
    return { titulo: 'Faltan equipos', detalle: 'Agrega al menos un equipo.' }
  }
  if (equipos.length > MAX_EQUIPOS_DE_CLUB) {
    return { titulo: 'Demasiados equipos', detalle: DETALLE_DEMASIADOS_EQUIPOS_DE_CLUB }
  }

  // Gross no usa hándicap: el campo ni se pide.
  if (modo === 'neto') {
    for (const [i, equipo] of equipos.entries()) {
      if (equipo.handicap == null) {
        return { titulo: 'Falta el hándicap', detalle: `Escribe el hándicap de ${nombreVisibleDeEquipo(equipo.nombre, i)}.` }
      }
      if (!esHandicapDeClubValido(equipo.handicap, holes)) {
        return {
          titulo: 'Hándicap fuera de rango',
          // Con el nombre, igual que «falta»: con 3 o 4 equipos el aviso dice cuál es.
          detalle: `El hándicap de ${nombreVisibleDeEquipo(equipo.nombre, i)} va de 0 a ${handicapDeClubMaximo(holes)}, sin decimales.`,
        }
      }
    }
  }

  // Con el nombre que se ve (el vacío cae a "Equipo N") y sin distinguir mayúsculas: en la tabla serían dos
  // filas que no se pueden distinguir.
  const nombres = equipos.map((e, i) => nombreVisibleDeEquipo(e.nombre, i).toLocaleLowerCase('es-CL'))
  if (new Set(nombres).size !== nombres.length) {
    return { titulo: 'Nombres repetidos', detalle: 'Dos equipos se llaman igual. Cambia uno.' }
  }

  if (equipos.length >= 2 && quienAnota == null) {
    return { titulo: 'Falta quién anota', detalle: 'Elige quién anota.' }
  }
  return null
}

function problemaDeCantidad({ formato, jugadores }: RondaAValidar): ProblemaDeLaRonda | null {
  const label = FORMAT_META[formato]?.label ?? formato

  if (jugadores.length === 0) {
    return { titulo: 'Faltan jugadores', detalle: 'Agrega al menos un jugador para crear la ronda.' }
  }

  // La API valida `nombre: z.string().min(1)`. El caso real no es un rival sin
  // nombre — esos se filtran antes de llegar acá — sino el creador cuando su
  // perfil todavía no cargó: con señal mala en cancha se puede llegar al botón
  // antes que el nombre, y la ronda muere en un 400 sin explicación.
  if (jugadores.some(j => !j.nombre.trim())) return PERFIL_CARGANDO

  if (jugadores.length > MAX_JUGADORES_POR_RONDA) {
    return {
      titulo: 'Demasiados jugadores',
      detalle: `Una ronda libre admite hasta ${MAX_JUGADORES_POR_RONDA} jugadores.`,
    }
  }

  // Match Play es el único formato con un techo propio: 1 vs 1, ni uno más.
  if (isMatchPlayFormat(formato) && jugadores.length !== 2) {
    return {
      titulo: `${label} requiere 2 jugadores`,
      detalle: jugadores.length < 2
        ? 'Agrega exactamente un rival para jugar Match Play.'
        : 'Match Play es 1 vs 1 — quita los jugadores de más.',
    }
  }

  // Un formato por equipos se puede jugar con un solo equipo contra el par, pero
  // un equipo es de dos para arriba: el handicap de equipo no existe para uno.
  const minimo = jugadoresMinimos(formato)
  if (jugadores.length < minimo) {
    const porEquipo = jugadoresPorEquipo(formato)
    return {
      titulo: 'Falta un compañero',
      detalle: porEquipo
        ? `${label} se juega en equipos de al menos ${porEquipo.min}: agrega un compañero.`
        : `${label} necesita al menos ${minimo} jugadores.`,
    }
  }

  return null
}

/**
 * La misma cuenta elegida para dos rivales, o el creador eligiéndose a sí mismo
 * como rival: la ronda tendría dos tarjetas de la misma persona.
 */
function problemaDePerfiles({ jugadores, creadorId }: RondaAValidar): ProblemaDeLaRonda | null {
  const vistos = new Set<string>()
  for (const j of jugadores) {
    if (!j.perfilId) continue
    if (creadorId && j.perfilId === creadorId) {
      return {
        titulo: 'Ya estás en la ronda',
        detalle: `Elegiste tu propia cuenta para ${j.nombre || 'un rival'}. Tú ya juegas esta ronda: elige a otra persona.`,
      }
    }
    if (vistos.has(j.perfilId)) {
      return {
        titulo: 'Jugador repetido',
        detalle: `${j.nombre || 'Un jugador'} está dos veces en la ronda. Quita una de sus tarjetas.`,
      }
    }
    vistos.add(j.perfilId)
  }
  return null
}

function problemaDeEquipos({ formato, jugadores, equipos }: RondaAValidar): ProblemaDeLaRonda | null {
  if (!isTeamFormat(formato)) return null
  const porEquipo = jugadoresPorEquipo(formato)
  if (!porEquipo) return null

  const tamañoValido = equipos.every(
    e => e.jugadorIndices.length >= porEquipo.min && e.jugadorIndices.length <= porEquipo.max,
  )
  // Cada jugador en exactamente un equipo: posiciones reales de la lista y sin
  // repetir. Contar asignados no alcanza — `[0,0] + [1,1]` suma 4 con cuatro
  // jugadores y deja a dos sin equipo. El servidor indexa con estas posiciones.
  const posiciones = equipos.flatMap(e => e.jugadorIndices)
  const posicionesValidas =
    posiciones.every(i => Number.isInteger(i) && i >= 0 && i < jugadores.length) &&
    new Set(posiciones).size === posiciones.length

  // Entre uno (contra el par) y el tope de equipos que caben en la ronda.
  if (
    equipos.length >= EQUIPOS_MINIMOS &&
    equipos.length <= maxEquipos(formato) &&
    tamañoValido &&
    posicionesValidas &&
    posiciones.length === jugadores.length
  ) return null

  return {
    titulo: 'Equipos incompletos',
    detalle: porEquipo.min === porEquipo.max
      ? `${FORMAT_META[formato]?.label} requiere exactamente ${porEquipo.min} jugadores por equipo.`
      : `Asigna todos los jugadores a un equipo (mínimo ${porEquipo.min} por equipo).`,
  }
}

/**
 * Un índice tipeado fuera de rango ("185" por 18.5, con guante y al sol) se
 * frena acá, en cualquier modo: antes llegaba al servidor y volvía con el
 * mensaje de zod en inglés después de tocar "Crear ronda".
 */
function problemaDeRangoDeIndices({ jugadores }: RondaAValidar): ProblemaDeLaRonda | null {
  const fuera = jugadores.filter(j => j.indice != null && !esIndiceDeHandicapValido(j.indice))
  if (fuera.length === 0) return null
  return {
    titulo: 'Índice fuera de rango',
    detalle: `${fuera.map(j => j.nombre || 'Sin nombre').join(', ')}: ${MENSAJE_INDICE_FUERA_DE_RANGO}`,
  }
}

/**
 * El modo neto reparte golpes por índice: sin el índice de alguien, ese jugador
 * competiría en gross contra rivales con handicap. Gross no pide nada — ni
 * siquiera en Match Play.
 */
function problemaDeIndices({ modo, jugadores }: RondaAValidar): ProblemaDeLaRonda | null {
  if (modo !== 'neto') return null

  const sinIndice = jugadores.filter(j => j.indice == null).map(j => j.nombre || 'Sin nombre')
  if (sinIndice.length === 0) return null

  return {
    titulo: 'Índice requerido',
    detalle: `Falta el índice WHS de: ${sinIndice.join(', ')}. Modo neto requiere handicap para todos.`,
  }
}
