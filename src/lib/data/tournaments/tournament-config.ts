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
  type MotivoDelCandado,
  type SenalesDeTorneoEnJuego,
} from '@/golf/tournament-config-locks'
import { JUGADOR_EN_TORNEO_STATUSES } from '@/golf/tournament-status'
import type { TeeDeCadaJugador } from '@/golf/tournament-tees-mode'
import {
  COURSE_TEE_COLUMNS,
  playerGenderOf,
  resolvePlayerTee,
  teeCalculaHandicap,
  type CourseTeeRow,
  type ResolvePlayerTeeInput,
} from '@/golf/courses/resolve-player-tee'
import { getTeesWithGenderVariants, COURSE_VARIANT_COLUMNS } from '@/lib/data/course-tees'
import type { CourseVariantRow } from '@/golf/courses/gender-variant'

/** La categoría de un jugador, con lo que hace falta para resolverle el tee. */
interface FilaDeCategoria {
  default_tee_color: string | null
  gender: string | null
}

/** Un jugador con su categoría, como viene de PostgREST (ver `leerTeeDeCadaJugador`). */
interface FilaDeJugador {
  tee_id: string | null
  genero: string | null
  category_id: string | null
  categories: FilaDeCategoria | FilaDeCategoria[] | null
}

/**
 * El embed de una FK many-to-one devuelve un OBJETO, pero los tipos generados lo declaran array.
 * Se acepta cualquiera de las dos formas en vez de confiar en una: si PostgREST cambiara de
 * opinión, el conteo pasaría a decir "ninguno sin tee" en silencio — y ese es justo el fail-open
 * que este archivo viene a cerrar.
 */
function categoriaDe(fila: FilaDeJugador): FilaDeCategoria | null {
  const cat = Array.isArray(fila.categories) ? fila.categories[0] : fila.categories
  return cat ?? null
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
 * Los tees contra los que se resuelve: los de la cancha del torneo PRIMERO y los de su variante de
 * género después, exactamente como los arma el board (`getTeesWithGenderVariants`). Sin la fila
 * hermana, a una jugadora se le resolvería el tee del género equivocado y el conteo diría "tiene
 * tee" por una fila que el motor no va a usar.
 *
 * `null` = no se pudo saber. Vacío = la cancha no publica tees, que es un dato real: entonces NADIE
 * tiene tee resoluble y el motor cae al rating de la cancha para todos.
 */
async function leerTeesDeLaCanchaDelTorneo(
  supabase: SupabaseClient,
  torneo: { course_id: string | null; courses: CourseVariantRow | CourseVariantRow[] | null },
): Promise<{ tees: CourseTeeRow[] | null; error: unknown }> {
  const course = (Array.isArray(torneo.courses) ? torneo.courses[0] : torneo.courses) ?? null
  if (!torneo.course_id || !course) return { tees: [], error: null }

  const propios = await supabase.from('course_tees').select(COURSE_TEE_COLUMNS).eq('course_id', torneo.course_id)
  if (propios.error) return { tees: null, error: propios.error }

  try {
    // `getTeesWithGenderVariants` PROPAGA el error de la variante de género a propósito (degradarlo
    // a `[]` cambiaría el hándicap de las jugadoras en silencio), así que acá se atrapa y se
    // convierte en "no se pudo contar".
    return {
      tees: await getTeesWithGenderVariants(supabase, course, (propios.data ?? []) as CourseTeeRow[]),
      error: null,
    }
  } catch (e) {
    return { tees: null, error: e }
  }
}

/**
 * De dónde sale el tee de cada jugador: a cuántos inscritos NO les resuelve el motor y cuántas
 * categorías traen un tee que la cancha publica.
 *
 * La unidad es el JUGADOR porque `resolvePlayerTee` resuelve jugador por jugador: `players.tee_id`
 * -> la `default_tee_color` de SU categoría -> `tournaments.tees` (que en estos torneos guarda el
 * MODO y no matchea ningún tee). `players.category_id` es nullable, así que un inscrito sin
 * categoría no tiene de dónde sacarlo aunque TODAS las categorías del torneo tengan tee.
 *
 * Y el conteo LLAMA al motor en vez de espejar su predicado. Contar `tee_id == null &&
 * default_tee_color == null` se veía igual y divergía en tres lugares, todos hacia el mismo lado
 * —la pantalla calla y el hándicap sale del rating de la cancha—:
 *
 * 1. `players.tee_id` apunta a una fila de `course_tees`. Cambiar la cancha del torneo deja ese id
 *    HUÉRFANO (nada limpia `players.tee_id`), y `resolvePlayerTee` no lo encuentra.
 * 2. Un `categories.default_tee_color` que esta cancha no publica por nombre no resuelve: el
 *    selector del wizard ofrece colores que no están en `course_tees` (el propio formulario lo
 *    avisa con "Esta cancha no publica este tee").
 * 3. Un tee resuelto SIN slope o sin rating no sirve para calcular: `teeCalculaHandicap` es el
 *    mismo predicado que aplica `ratingsDeLaRondaDelJugador` antes de usarlo.
 *
 * Se traen las listas y se cuenta en JS en vez de pagar conteos en la base: son un puñado de filas
 * por torneo (el mayor en prod tiene 5 jugadores) y el criterio queda escrito una sola vez.
 */
export async function leerTeeDeCadaJugador(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<LecturaConErrores<TeeDeCadaJugador>> {
  // La fila del torneo se lee acá y no llega por props: el tee global y la cancha son parte del
  // predicado, y una prop de hace minutos volvería a meter el fail-open que este archivo cierra.
  const torneo = await supabase
    .from('tournaments')
    .select(`tees, course_id, courses(${COURSE_VARIANT_COLUMNS})`)
    .eq('id', tournamentId)
    .single()

  const [jugadores, cats, deLaCancha] = await Promise.all([
    supabase
      .from('players')
      .select('id, tee_id, genero, category_id, categories(default_tee_color, gender)')
      .eq('tournament_id', tournamentId)
      .in('status', [...JUGADOR_EN_TORNEO_STATUSES]),
    supabase.from('categories').select('default_tee_color, gender').eq('tournament_id', tournamentId),
    torneo.error || !torneo.data
      ? Promise.resolve({ tees: null as CourseTeeRow[] | null, error: null })
      : leerTeesDeLaCanchaDelTorneo(
          supabase,
          torneo.data as unknown as { course_id: string | null; courses: CourseVariantRow | null },
        ),
  ])

  const filas = (jugadores.data ?? []) as unknown as FilaDeJugador[]
  const categorias = (cats.data ?? []) as unknown as FilaDeCategoria[]
  const courseTees = deLaCancha.tees
  // En un modo de asignación esto NO matchea ningún tee (guarda 'per_player', 'mixed'…), pero se
  // pasa igual: el conteo tiene que ser la cadena del motor completa, no la cadena menos el último
  // eslabón. Un torneo que guarda un COLOR resuelve por acá y nadie se queda sin tee.
  const teeGlobal = ((torneo.data as { tees?: string | null } | null)?.tees ?? null) as string | null

  /** ¿Resuelve el motor un tee con el que calcular? El mismo camino que `compute-player-course-hcp`. */
  const resuelve = (input: Omit<ResolvePlayerTeeInput, 'courseTees'>) =>
    teeCalculaHandicap(resolvePlayerTee({ ...input, courseTees: courseTees ?? [] }).tee)

  // null (y no 0) cuando algo no se pudo leer: decir "ninguno se queda sin tee" sin haber mirado es
  // la misma mentira que prometerle la categoría a todos.
  //
  // Sin los tees de la cancha no se puede resolver NADA, así que ese hueco tumba los dos conteos.
  // El resto es por conteo: que fallen los jugadores no dice nada de las categorías, y al revés
  // tampoco. Juntarlos en una sola bandera hacía que un hiccup en una consulta borrara la respuesta
  // de la otra, y la pantalla terminaba diciendo "no pudimos leer las categorías" con las
  // categorías perfectamente leídas.
  const sinTees = torneo.error != null || courseTees == null

  return {
    valor: {
      jugadoresSinTee: sinTees || jugadores.error != null
        ? null
        : filas.filter(
            (f) =>
              !resuelve({
                playerTeeId: f.tee_id,
                categoryDefaultTeeColor: categoriaDe(f)?.default_tee_color ?? null,
                tournamentTeesGlobal: teeGlobal,
                playerGender: playerGenderOf({ genero: f.genero, categories: categoriaDe(f) }),
              }),
          ).length,
      // Acá el tee global va en null a propósito: la pregunta es si ESTA categoría da un tee, no si
      // sus jugadores lo sacan de otra parte. Con el global adentro, un torneo que guarda un color
      // habría contado todas sus categorías como "con tee", incluidas las que no tienen ninguno.
      categoriasConTee:
        sinTees || cats.error != null
          ? null
          : categorias.filter((c) =>
              resuelve({
                playerTeeId: null,
                categoryDefaultTeeColor: c.default_tee_color,
                tournamentTeesGlobal: null,
                playerGender: playerGenderOf({ categories: c }),
              }),
            ).length,
      categoriasTotal: categorias.length,
    },
    errores: [jugadores.error, cats.error, torneo.error, deLaCancha.error].filter((e) => e != null),
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

/**
 * Una columna que el guardado dejó como estaba, con el MOTIVO por el que no la escribió. El motivo
 * viaja de vuelta porque la pantalla tiene que decirlo: con solo la lista de columnas, el aviso
 * afirmaba "el torneo ya está en juego" incluso cuando el candado era por publicación (0 scores) o
 * por un conteo que no se pudo hacer.
 */
export interface ColumnaBloqueada {
  columna: ColumnaDeConfiguracion
  motivo: MotivoDelCandado
}

export type ResultadoDeGuardar =
  | { ok: true; bloqueadas: ColumnaBloqueada[] }
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
    .select('course_id, format, hole_count, tees, status')
    .eq('id', tournamentId)
    .single()

  // Sin la fila no se puede saber qué valor viejo conservar, así que no se escribe nada: con los
  // candados cerrados y sin valores viejos, el UPDATE escribiría los nuevos sobre un torneo que
  // quizás está en juego.
  if (actual.error || !actual.data) return { ok: false, error: actual.error ?? new Error('Torneo no encontrado') }

  const fila = actual.data as {
    course_id: string | null
    format: string
    hole_count: number
    tees: string
    status: string | null
  }
  const { valor: senales } = await leerSenalesDeTorneoEnJuego(supabase, tournamentId, fila.status)
  const candados = candadosDeConfiguracion(senales)

  /** El valor viejo cuando la columna está bloqueada, el nuevo cuando no. UNA regla para las cuatro. */
  const aEscribir = <T>(columna: ColumnaDeConfiguracion, viejo: T, nuevo: T): T =>
    candados[columna] != null ? viejo : nuevo

  const { error } = await supabase
    .from('tournaments')
    .update({
      ...cambios,
      // `course_id` entra al UPDATE desde la fila vieja cuando está bloqueado: cambiar la cancha con
      // scores puestos mueve el rating, el par y los stroke index de los hoyos YA jugados, y deja
      // los `players.tee_id` apuntando a tees de otra cancha.
      course_id: aEscribir<string | null>('cancha', fila.course_id, cambios.course_id),
      format: aEscribir('formato', fila.format, cambios.format),
      hole_count: aEscribir('hoyos', fila.hole_count, cambios.hole_count),
      tees: aEscribir('tee', fila.tees, cambios.tees),
    })
    .eq('id', tournamentId)

  if (error) return { ok: false, error }

  // Solo se avisa de lo que el organizador QUERÍA cambiar: un candado sobre una columna que no
  // tocó no es noticia para él. Y viaja con el motivo, para que la pantalla no afirme uno que no es.
  const bloqueadas: ColumnaBloqueada[] = []
  const anotar = (columna: ColumnaDeConfiguracion, cambio: boolean) => {
    const motivo = candados[columna]
    if (motivo != null && cambio) bloqueadas.push({ columna, motivo })
  }
  anotar('cancha', cambios.course_id !== fila.course_id)
  anotar('formato', cambios.format !== fila.format)
  anotar('hoyos', cambios.hole_count !== fila.hole_count)
  anotar('tee', cambios.tees !== fila.tees)
  return { ok: true, bloqueadas }
}

export type { CandadosDeConfiguracion, SenalesDeTorneoEnJuego }
