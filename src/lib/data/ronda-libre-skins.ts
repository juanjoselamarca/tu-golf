// ─── Capa de datos — Skins en la ronda libre (lo que lee el scorer) ───────────
//
// Las marcas de puntos especiales y los retiros viven en tablas privadas (sin permisos para anon ni authenticated,
// migración 20261027180000): se leen con el cliente de servicio, igual que en la Timba (`ronda-libre-timba.ts`).
// Entrega `VistaDelSkinsEnElScorer`: puntos para marcar, marcas, retiros y la tabla en vivo con la plata (`tabla`),
// calculada acá con el motor. Los hándicaps no salen: el contexto (CH de cada uno y los hoyos) es el congelado al crear
// (`contextoDelSkinsDeLaRonda`, el mismo que usa el scorer); una ronda vieja sin congelado lo recalcula.

import type { SupabaseClient } from '@supabase/supabase-js'
import { esFormatoSkins, hoyosFueraDesdeLaBase, type FueraPorJugador } from '@/golf/formats/skins'
import { captureError } from '@/lib/error-tracking'
import { detalleDeLecturaFallida } from '@/lib/red/lectura-fallida'
import { contextoDelSkinsDeLaRonda } from './skins-contexto-guardado'
import { esRondaCerrada } from '@/golf/ronda-libre/estado-ronda'
import type { FilaMarcaPuntito, FilaRetiro } from '@/golf/ronda-libre/juego-de-la-ronda'
import { leerReglasSkins, vistaDelSkinsEnElScorer, type VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'

export type SkinsDelScorer =
  | { status: 'ok'; vista: VistaDelSkinsEnElScorer }
  /** Reglas guardadas que no se pueden leer: no se inventa un skins (mismo motivo que la Timba). */
  | { status: 'sin_juego'; rondaCerrada: boolean }
  | { status: 'no_es_skins' }
  | { status: 'not_found' }
  | { status: 'error' }

export async function cargarSkinsDelScorer(admin: SupabaseClient, codigo: string): Promise<SkinsDelScorer> {
  const ronda = await admin
    .from('rondas_libres')
    .select('id, formato_juego, reglas_juego, estado, course_id, holes, hoyo_inicio, recorridos, tees')
    .eq('codigo', codigo)
    .maybeSingle()
  if (ronda.error) return { status: 'error' }
  if (!ronda.data) return { status: 'not_found' }
  const fila = ronda.data as FilaRondaSkins
  if (!esFormatoSkins(fila.formato_juego)) return { status: 'no_es_skins' }
  const rondaCerrada = esRondaCerrada(fila.estado)
  const reglas = leerReglasSkins(fila.reglas_juego)
  if (!reglas) return { status: 'sin_juego', rondaCerrada }

  const [marcas, retiros, jugadores] = await Promise.all([
    admin
      .from('ronda_libre_puntitos')
      .select('id, jugador_id, hoyo, puntito_id, created_at')
      .eq('ronda_id', fila.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    admin.from('ronda_libre_retiros').select('jugador_id, desde_hoyo').eq('ronda_id', fila.id),
    admin.from('ronda_libre_jugadores').select('id, nombre, handicap, tees, scores, fuera_del_hoyo').eq('ronda_id', fila.id),
  ])
  if (marcas.error || retiros.error || jugadores.error) return { status: 'error' }
  const tarjetas = await tarjetasDelSkins(admin, codigo, fila, reglas.jugadorIds, (jugadores.data ?? []) as FilaJugadorSkins[], reglas.config.modo)
  // Lectura fallida de la cancha: es un error, no una vista «sin tabla». Como `error`, la ruta pública responde 503
  // no-store (una vista sin tabla quedaría cacheada en el CDN) y el cliente no la toma como la vista fresca de una
  // ronda cerrada (`juegoDeLaRondaCerrada`): sigue con la última buena y reintenta.
  if (tarjetas === 'fallo') return { status: 'error' }
  return {
    status: 'ok',
    vista: vistaDelSkinsEnElScorer({
      reglas,
      marcas: (marcas.data ?? []) as FilaMarcaPuntito[],
      retiros: (retiros.data ?? []) as FilaRetiro[],
      rondaCerrada,
      tarjetas,
    }),
  }
}

interface FilaRondaSkins {
  id: string
  formato_juego: string | null
  reglas_juego: unknown
  estado: string | null
  course_id: string | null
  holes: number
  hoyo_inicio: number | null
  recorridos: string[] | null
  tees: string
}

interface FilaJugadorSkins {
  id: string
  nombre: string
  handicap: number | null
  tees: string | null
  scores: Readonly<Record<string, unknown>> | null
  fuera_del_hoyo: unknown
}

/**
 * El contexto y las tarjetas para la tabla. `null` (la vista va sin tabla, el scorer igual marca) si la ronda no tiene
 * cancha o falta un jugador de las reglas: eso no cambia reintentando. `'fallo'` si no se pudo leer la cancha (se
 * reporta): es transitorio y quien llama lo trata como error.
 */
async function tarjetasDelSkins(
  admin: SupabaseClient,
  codigo: string,
  ronda: FilaRondaSkins,
  jugadorIds: readonly string[],
  filas: readonly FilaJugadorSkins[],
  modo: string,
) {
  const jugadores = jugadorIds.map(id => filas.find(f => f.id === id))
  if (!ronda.course_id || jugadores.some(j => !j)) return null
  try {
    const contexto = await contextoDelSkinsDeLaRonda(admin, {
      courseId: ronda.course_id, holes: ronda.holes, hoyoInicio: ronda.hoyo_inicio, recorridos: ronda.recorridos,
      tees: ronda.tees, modo,
      jugadores: jugadores.map(j => ({ nombre: j!.nombre, indice: j!.handicap ?? null, tees: j!.tees ?? null })),
    }, { reglasJuego: ronda.reglas_juego, jugadorIds })
    const orden = contexto.hoyos.map(h => h.numero)
    const fuera: FueraPorJugador = Object.fromEntries(jugadores.map(j => [j!.id, hoyosFueraDesdeLaBase(j!.fuera_del_hoyo, orden)]))
    const scores = Object.fromEntries(jugadores.map(j => [j!.id, j!.scores ?? {}]))
    return { contexto, scores, fuera }
  } catch (err) {
    void captureError(err, { context: 'ronda_libre.skins_tabla', level: 'warning', meta: { codigo, ...detalleDeLecturaFallida(err) } })
    return 'fallo' as const
  }
}
