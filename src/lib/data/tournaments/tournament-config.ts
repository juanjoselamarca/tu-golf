// src/lib/data/tournaments/tournament-config.ts
//
// Leer y guardar la configuración de un torneo (nombre, cancha, fecha, formato, hoyos, tee).
//
// Las consultas viven acá y no en la pantalla por dos razones:
//
// 1. El UPDATE estaba suelto en un componente cliente (`src/app/organizador/[slug]/editar/`), que
//    es justo lo que la regla "el que toca, ordena" prohíbe: `supabase.from()` en `src/app/` fuera
//    de `api/`.
// 2. Los candados se calculaban en el server component que RENDERIZA la pantalla, así que viajaban
//    al cliente como props y se quedaban congelados. Entre que el organizador abre /editar y que
//    toca Guardar pueden pasar minutos: si en el medio alguien crea la tarjeta compartida o anota
//    el primer score, esas props siguen diciendo que no hay nada en juego y el UPDATE le movía el
//    tee a un torneo andando. Acá los candados se vuelven a leer DENTRO del guardado, con los
//    mismos predicados que usó la pantalla (`candadosDeConfiguracion`).
//
// Esto NO es atómico: entre el conteo y el UPDATE queda una ventana de milisegundos. Cerrarla de
// verdad pide hacer el UPDATE condicional del lado del servidor (una route o un RPC que vuelva a
// contar en la misma transacción), y eso es un PR aparte. Lo que sí queda cerrado es la ventana de
// minutos, que es la que pasa de verdad en una cancha.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  candadosDeConfiguracion,
  type CandadosDeConfiguracion,
  type ColumnaDeConfiguracion,
  type SenalesDeTorneoEnJuego,
} from '@/golf/tournament-config-locks'
import { JUGADOR_EN_TORNEO_STATUSES } from '@/golf/tournament-status'
import type { TeeDeCadaJugador } from '@/golf/tournament-tees-mode'

/** Un jugador con el tee de su categoría, como viene de PostgREST (ver `leerTeeDeCadaJugador`). */
interface FilaDeJugador {
  tee_id: string | null
  category_id: string | null
  categories: { default_tee_color: string | null } | { default_tee_color: string | null }[] | null
}

/** Lo que se leyó, más los errores para que el caller los reporte con su propio contexto. */
export interface LecturaConErrores<T> {
  valor: T
  errores: unknown[]
}

/**
 * ¿Está este torneo en juego? Cuenta scores y tarjetas compartidas.
 *
 * El conteo de scores va por el embed `rounds!inner` y NO por un `tournament_id` en `hole_scores`:
 * esa columna no existe (las de la tabla son `round_id, hole_number, par, gross_score, …` y el
 * torneo lo tiene `rounds`). Filtrar por una columna que no existe le hace devolver error a
 * PostgREST y el conteo viene null, que es exactamente cómo este candado se quedó muerto. Probado
 * contra prod: 72 filas en `gate-scorer-18h-mixto`, el mismo torneo donde el filtro viejo daba null.
 *
 * `null` en un conteo significa "no se pudo contar", y `candadosDeConfiguracion` lo trata como
 * torneo en juego: falla CERRADO.
 */
export async function leerSenalesDeTorneoEnJuego(
  supabase: SupabaseClient,
  tournamentId: string,
  status: string | null,
): Promise<LecturaConErrores<SenalesDeTorneoEnJuego>> {
  const [scores, compartidas] = await Promise.all([
    supabase
      .from('hole_scores')
      .select('id, rounds!inner(tournament_id)', { count: 'exact', head: true })
      .eq('rounds.tournament_id', tournamentId),
    // `startTournament` le copia `tournaments.tees` a `rondas_libres.tees` al crear la tarjeta, así
    // que desde ese momento el scorer tiene su propia copia del tee (issue #698).
    supabase
      .from('tournament_groups')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .not('ronda_libre_id', 'is', null),
  ])

  return {
    valor: {
      scores: scores.error ? null : (scores.count ?? 0),
      tarjetasCompartidas: compartidas.error ? null : (compartidas.count ?? 0),
      status,
    },
    errores: [scores.error, compartidas.error].filter((e) => e != null),
  }
}

/**
 * De dónde sale el tee de cada jugador: cuántos inscritos no lo tienen resoluble y cuántas
 * categorías traen tee.
 *
 * La unidad es el JUGADOR porque `resolvePlayerTee` resuelve jugador por jugador: `players.tee_id`
 * -> la `default_tee_color` de SU categoría -> `tournaments.tees` (que en estos torneos guarda el
 * MODO y no matchea ningún tee). `players.category_id` es nullable, así que un inscrito sin
 * categoría no tiene de dónde sacarlo aunque TODAS las categorías del torneo tengan tee.
 *
 * Se trae la lista y se cuenta en JS en vez de pagar tres conteos: son un puñado de filas por
 * torneo (el mayor en prod tiene 5 jugadores) y el criterio queda escrito una sola vez.
 */
export async function leerTeeDeCadaJugador(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<LecturaConErrores<TeeDeCadaJugador>> {
  const [jugadores, cats] = await Promise.all([
    supabase
      .from('players')
      .select('id, tee_id, category_id, categories(default_tee_color)')
      .eq('tournament_id', tournamentId)
      .in('status', [...JUGADOR_EN_TORNEO_STATUSES]),
    supabase.from('categories').select('default_tee_color').eq('tournament_id', tournamentId),
  ])

  // El embed de una FK many-to-one devuelve un OBJETO, pero los tipos generados lo declaran array.
  // Se acepta cualquiera de las dos formas en vez de confiar en una: si PostgREST cambiara de
  // opinión, el conteo pasaría a decir "ninguno sin tee" en silencio — y ese es justo el fail-open
  // que este archivo viene a cerrar.
  const filas = (jugadores.data ?? []) as unknown as FilaDeJugador[]

  const teeDeLaCategoria = (fila: FilaDeJugador): string | null => {
    const cat = Array.isArray(fila.categories) ? fila.categories[0] : fila.categories
    return cat?.default_tee_color ?? null
  }

  return {
    valor: {
      // null (y no 0) cuando la consulta falla: decir "ninguno se queda sin tee" sin haber mirado
      // es la misma mentira que prometerle la categoría a todos.
      jugadoresSinTee: jugadores.error
        ? null
        : filas.filter((f) => f.tee_id == null && teeDeLaCategoria(f) == null).length,
      jugadoresTotal: filas.length,
      categoriasConTee: cats.error
        ? null
        : (cats.data ?? []).filter((c) => c.default_tee_color != null).length,
      categoriasTotal: cats.data?.length ?? 0,
    },
    errores: [jugadores.error, cats.error].filter((e) => e != null),
  }
}

/** Las columnas que la pantalla de "editar torneo" escribe. */
export interface ConfiguracionDelTorneo {
  name: string
  course_id: string
  format: string
  hole_count: number
  tees: string
  use_handicap: boolean
  cover_image_url: string | null
  date_start: string
}

export type ResultadoDeGuardar =
  | { ok: true; bloqueadas: ColumnaDeConfiguracion[] }
  | { ok: false; error: unknown }

/**
 * Guarda la configuración, releyendo los candados primero.
 *
 * Lo que está bloqueado se escribe con el valor que la fila tiene AHORA, no con el que el
 * organizador ve en pantalla: el candado no puede vivir solo en el `disabled` de un botón si el
 * UPDATE sale del mismo cliente. Y la relectura es lo que cubre la carrera de verdad — que el
 * torneo se ponga en juego DESPUÉS de que se cargó la pantalla.
 *
 * Devuelve qué columnas quedaron intactas para que la pantalla lo diga en vez de fingir que guardó
 * todo. Si la relectura falla, los candados cierran (`candadosDeConfiguracion` con conteos null) y
 * el resto de la configuración se guarda igual: el organizador cambió el nombre y la fecha, y
 * negarle eso porque un conteo no respondió sería castigarlo por un hiccup de red.
 */
export async function guardarConfiguracionDelTorneo(
  supabase: SupabaseClient,
  tournamentId: string,
  cambios: ConfiguracionDelTorneo,
): Promise<ResultadoDeGuardar> {
  const actual = await supabase
    .from('tournaments')
    .select('format, hole_count, tees, status')
    .eq('id', tournamentId)
    .single()

  // Sin la fila no se puede saber qué valor viejo conservar, así que no se escribe nada: con los
  // candados cerrados y sin valores viejos, el UPDATE escribiría los nuevos sobre un torneo que
  // quizás está en juego.
  if (actual.error || !actual.data) return { ok: false, error: actual.error ?? new Error('Torneo no encontrado') }

  const fila = actual.data as { format: string; hole_count: number; tees: string; status: string | null }
  const { valor: senales } = await leerSenalesDeTorneoEnJuego(supabase, tournamentId, fila.status)
  const candados = candadosDeConfiguracion(senales)

  const { error } = await supabase
    .from('tournaments')
    .update({
      ...cambios,
      format: candados.formato != null ? fila.format : cambios.format,
      hole_count: candados.hoyos != null ? fila.hole_count : cambios.hole_count,
      tees: candados.tee != null ? fila.tees : cambios.tees,
    })
    .eq('id', tournamentId)

  if (error) return { ok: false, error }

  // Solo se avisa de lo que el organizador QUERÍA cambiar: un candado sobre una columna que no
  // tocó no es noticia para él.
  const bloqueadas: ColumnaDeConfiguracion[] = []
  if (candados.formato != null && cambios.format !== fila.format) bloqueadas.push('formato')
  if (candados.hoyos != null && cambios.hole_count !== fila.hole_count) bloqueadas.push('hoyos')
  if (candados.tee != null && cambios.tees !== fila.tees) bloqueadas.push('tee')
  return { ok: true, bloqueadas }
}

export type { CandadosDeConfiguracion, SenalesDeTorneoEnJuego }
