import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  leerSenalesDeTorneoEnJuego,
  leerTeeDeCadaJugador,
  guardarConfiguracionDelTorneo,
  type ColumnaBloqueada,
  type ConfiguracionDelTorneo,
  type ResultadoDeGuardar,
} from './tournament-config'
import { JUGADOR_EN_TORNEO_STATUSES } from '@/golf/tournament-status'

/** Lo que cada tabla responde, más el `update`. Lo que no se declare responde vacío y sin error. */
interface Respuestas {
  hole_scores?: { count: number | null; error: unknown }
  tournament_groups?: { count: number | null; error: unknown }
  players?: { data: unknown[] | null; error: unknown }
  categories?: { data: unknown[] | null; error: unknown }
  course_tees?: { data: unknown[] | null; error: unknown }
  course_holes?: { data: unknown[] | null; error: unknown }
  tournaments?: { data: unknown; error: unknown }
  /**
   * La misma tabla `tournaments` la leen DOS consultas distintas: la fila de la configuración
   * (`course_id, hole_count`) y el contexto de hándicap del board, que trae la cancha embebida
   * (`courses(...)`). Declarar esta clave override solo la segunda; sin ella, las dos leen
   * `tournaments`. Hace falta para probar que una falla en el contexto no se confunde con una
   * falla en la fila.
   */
  tournaments_hcp?: { data: unknown; error: unknown }
  update?: { error: unknown }
}

/**
 * Un cliente de Supabase falso que ADEMÁS registra los filtros. El registro no es decoración: el
 * candado de los hoyos se quedó muerto todo un PR porque la consulta filtraba por una columna que
 * `hole_scores` no tiene y nadie miraba el filtro, solo el resultado del mock.
 */
function clienteFalso(respuestas: Respuestas = {}) {
  const registro: string[] = []
  const updates: Record<string, unknown>[] = []

  const from = (tabla: string) => {
    let esUpdate = false
    let cols = ''
    const anotar = (linea: string) => registro.push(`${tabla}.${linea}`)
    const q = {
      select: (c?: string) => ((cols = c ?? ''), anotar(`select(${cols})`), q),
      eq: (col: string, val: unknown) => (anotar(`eq(${col}=${String(val)})`), q),
      in: (col: string, vals: readonly unknown[]) => (anotar(`in(${col}=[${vals.join(',')}])`), q),
      not: (col: string, op: string, val: unknown) => (anotar(`not(${col} ${op} ${String(val)})`), q),
      single: () => (anotar('single()'), q),
      maybeSingle: () => (anotar('maybeSingle()'), q),
      order: (col: string) => (anotar(`order(${col})`), q),
      update: (payload: Record<string, unknown>) => {
        esUpdate = true
        updates.push(payload)
        anotar('update()')
        return q
      },
      then: <T>(ok: (v: unknown) => T, err?: (e: unknown) => T) => {
        const esContextoHcp = tabla === 'tournaments' && cols.includes('courses(')
        const respuesta = esUpdate
          ? (respuestas.update ?? { error: null })
          : ((esContextoHcp ? respuestas.tournaments_hcp : undefined) ??
            respuestas[tabla as keyof Respuestas] ?? { count: 0, data: [], error: null })
        return Promise.resolve(respuesta).then(ok, err)
      },
    }
    return q
  }

  return { cliente: { from } as unknown as SupabaseClient, registro, updates }
}

const CONFIG: ConfiguracionDelTorneo = {
  name: 'Copa de Primavera',
  course_id: 'c2',
  format: 'match_play',
  hole_count: 9,
  tees: 'dorado',
  use_handicap: true,
  cover_image_url: null,
  date_start: '2026-11-15',
}

/** La fila como está en la base: lo que el organizador quiere cambiar es TODO lo de `CONFIG`. */
const FILA = { course_id: 'c1', format: 'stroke_play', hole_count: 18, tees: 'blanco', status: 'in_progress' }

/** Las columnas bloqueadas, ordenadas, para comparar sin depender del orden del código. */
const columnasBloqueadas = (r: ResultadoDeGuardar): string[] =>
  r.ok ? r.bloqueadas.map((b) => b.columna).sort() : ['<error>']

const bloqueadas = (r: ResultadoDeGuardar): ColumnaBloqueada[] => (r.ok ? r.bloqueadas : [])

describe('leerSenalesDeTorneoEnJuego', () => {
  it('cuenta los scores por el embed de rounds, no por una columna que hole_scores no tiene', async () => {
    const { cliente, registro } = clienteFalso({
      hole_scores: { count: 72, error: null },
      tournament_groups: { count: 0, error: null },
    })
    const { valor } = await leerSenalesDeTorneoEnJuego(cliente, 't1', 'in_progress')
    expect(valor.scores).toBe(72)
    // El filtro va por la relación, que es la única forma de llegar al torneo desde `hole_scores`.
    expect(registro).toContain('hole_scores.eq(rounds.tournament_id=t1)')
    expect(registro.some((l) => l === 'hole_scores.eq(tournament_id=t1)')).toBe(false)
    // Y el embed es `!inner`: sin eso el filtro por la relación no excluye nada.
    expect(registro.some((l) => l.startsWith('hole_scores.select(') && l.includes('rounds!inner'))).toBe(true)
  })

  it('las tarjetas compartidas son los grupos CON ronda_libre_id: ese es el marcador', async () => {
    const { cliente, registro } = clienteFalso({ tournament_groups: { count: 3, error: null } })
    const { valor } = await leerSenalesDeTorneoEnJuego(cliente, 't1', 'open')
    expect(valor.tarjetasCompartidas).toBe(3)
    expect(registro).toContain('tournament_groups.eq(tournament_id=t1)')
    expect(registro).toContain('tournament_groups.not(ronda_libre_id is null)')
  })

  it('pasa el status tal cual: el candado del formato lo decide quien llama, no esta consulta', async () => {
    const { cliente } = clienteFalso()
    expect((await leerSenalesDeTorneoEnJuego(cliente, 't1', 'published')).valor.status).toBe('published')
    expect((await leerSenalesDeTorneoEnJuego(cliente, 't1', null)).valor.status).toBeNull()
  })

  // El bug original: PostgREST devolvía error, el conteo venía null y el candado leía ese null como
  // "0 scores". Acá el null se CONSERVA para que `candadosDeConfiguracion` falle cerrado.
  it('un conteo con error vuelve null, nunca 0', async () => {
    const { cliente } = clienteFalso({
      hole_scores: { count: null, error: new Error('42703') },
      tournament_groups: { count: null, error: new Error('sin red') },
    })
    const { valor, errores } = await leerSenalesDeTorneoEnJuego(cliente, 't1', 'draft')
    expect(valor.scores).toBeNull()
    expect(valor.tarjetasCompartidas).toBeNull()
    // Los errores salen para que el caller los reporte con su contexto, en vez de morir en silencio.
    expect(errores).toHaveLength(2)
  })

  it('un conteo vacío es 0 y no null: ahí sí se miró', async () => {
    const { cliente } = clienteFalso({
      hole_scores: { count: null, error: null },
      tournament_groups: { count: null, error: null },
    })
    const { valor, errores } = await leerSenalesDeTorneoEnJuego(cliente, 't1', 'draft')
    expect(valor.scores).toBe(0)
    expect(valor.tarjetasCompartidas).toBe(0)
    expect(errores).toHaveLength(0)
  })
})

describe('leerTeeDeCadaJugador', () => {
  /**
   * Los tees que esta cancha publica. 'dorado' existe con nombre pero SIN rating ni slope: el motor
   * no puede calcular con él y cae al rating general de la cancha.
   */
  const TEES = [
    { id: 'tee-blanco', nombre: 'blanco', rating: 71.2, slope: 132, yardaje_total: 6100, genero: 'M' },
    { id: 'tee-azul', nombre: 'azul', rating: 73.1, slope: 137, yardaje_total: 6500, genero: 'M' },
    { id: 'tee-dorado', nombre: 'dorado', rating: null, slope: null, yardaje_total: 5900, genero: 'M' },
  ]

  /**
   * Un torneo en un modo de asignación (`tournaments.tees` no matchea ningún nombre de tee), tal
   * como lo lee el contexto de hándicap del board: la cancha viene EN el mismo embed, con su par,
   * sus ratings y su catálogo de tees.
   *
   * El par y los ratings no son decoración: son la señal de escala del guardarrail. Con el par
   * ausente, el rating de un tee sano parece increíble y el motor lo descarta.
   */
  const TORNEO = {
    tees: 'per_player',
    course_id: 'c1',
    hole_count: 18,
    hcp_calc_mode: 'whs',
    hcp_pct: null,
    modo_juego: null,
    formato_juego: null,
    format: 'stroke_play',
    // Sin marcador de género ni club FedeGolf, así que no hay variante hermana que leer.
    courses: {
      id: 'c1',
      nombre: 'Los Quillayes',
      fedegolf_club_id: null,
      par_total: 72,
      slope_rating: 128,
      course_rating: 70.5,
      course_tees: TEES,
    },
  }

  const conTees = (extra: Respuestas = {}): Respuestas => ({
    tournaments: { data: TORNEO, error: null },
    ...extra,
  })

  /** El mismo torneo con la cancha retocada (par, ratings o catálogo de tees). */
  const conCancha = (cancha: Record<string, unknown>, extra: Respuestas = {}): Respuestas =>
    conTees({
      tournaments: { data: { ...TORNEO, courses: { ...TORNEO.courses, ...cancha } }, error: null },
      ...extra,
    })

  const jugador = (p: Partial<{ tee_id: string | null; genero: string | null; category_id: string | null; categories: unknown }> = {}) => ({
    tee_id: null,
    genero: null,
    category_id: null,
    categories: null,
    ...p,
  })

  // La unidad es el JUGADOR: `players.category_id` es nullable, así que un inscrito sin categoría
  // se queda sin tee aunque TODAS las categorías del torneo tengan uno.
  it('cuenta los jugadores sin tee resoluble, no las categorías sin tee', async () => {
    const { cliente } = clienteFalso(
      conTees({
        players: {
          data: [
            jugador({ tee_id: 'tee-blanco', category_id: 'cat-1' }),
            jugador({ category_id: 'cat-1', categories: { default_tee_color: 'blanco', gender: null } }),
            jugador(),
          ],
          error: null,
        },
        categories: {
          data: [
            { default_tee_color: 'blanco', gender: null },
            { default_tee_color: 'azul', gender: null },
          ],
          error: null,
        },
      }),
    )
    const { valor } = await leerTeeDeCadaJugador(cliente, 't1')
    // El primero tiene tee propio, el segundo lo saca de su categoría, el tercero no tiene de dónde.
    expect(valor).toEqual({ jugadoresSinTee: 1, categoriasConTee: 2, categoriasTotal: 2 })
  })

  // Los tipos generados declaran el embed como ARRAY aunque PostgREST devuelva un objeto. Si el
  // conteo confiara en una sola forma, el día que cambie diría "ninguno sin tee" en silencio: justo
  // el fail-open que este módulo vino a cerrar.
  it('lee el tee de la categoría venga como objeto o como array', async () => {
    const { cliente } = clienteFalso(
      conTees({
        players: {
          data: [
            jugador({ category_id: 'cat-1', categories: [{ default_tee_color: 'blanco', gender: null }] }),
            jugador({ category_id: 'cat-2', categories: [{ default_tee_color: null, gender: null }] }),
            jugador({ category_id: 'cat-3', categories: [] }),
          ],
          error: null,
        },
      }),
    )
    const { valor } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBe(2)
  })

  // ─── El hallazgo de la 8ª vuelta: el conteo tiene que LLAMAR al motor, no espejar su predicado ───

  // `players.tee_id` apunta a una fila de `course_tees`. Al cambiar la cancha del torneo nadie
  // limpia esa columna, así que el id queda HUÉRFANO: `resolvePlayerTee` no lo encuentra y el
  // hándicap sale del rating de la cancha. Contando `tee_id != null` la pantalla decía que tenía tee.
  it('un tee_id que apunta a un tee de otra cancha NO cuenta como tee', async () => {
    const { cliente } = clienteFalso(
      conTees({ players: { data: [jugador({ tee_id: 'tee-de-otra-cancha' })], error: null } }),
    )
    expect((await leerTeeDeCadaJugador(cliente, 't1')).valor.jugadoresSinTee).toBe(1)
  })

  // Y la cadena SIGUE: el eslabón huérfano no deja al jugador sin tee si su categoría sí resuelve.
  it('con el tee_id huérfano pero la categoría con tee, el jugador sí tiene de dónde sacarlo', async () => {
    const { cliente } = clienteFalso(
      conTees({
        players: {
          data: [
            jugador({
              tee_id: 'tee-de-otra-cancha',
              category_id: 'cat-1',
              categories: { default_tee_color: 'azul', gender: null },
            }),
          ],
          error: null,
        },
      }),
    )
    expect((await leerTeeDeCadaJugador(cliente, 't1')).valor.jugadoresSinTee).toBe(0)
  })

  // El selector del wizard ofrece colores que esta cancha no publica (el propio formulario lo
  // avisa). Una categoría que apunta a uno de esos no le da tee a nadie.
  it('una categoría con un color que la cancha no publica no cuenta como categoría con tee', async () => {
    const { cliente } = clienteFalso(
      conTees({
        players: {
          data: [jugador({ category_id: 'cat-1', categories: { default_tee_color: 'negras', gender: null } })],
          error: null,
        },
        categories: {
          data: [
            { default_tee_color: 'negras', gender: null },
            { default_tee_color: 'blanco', gender: null },
          ],
          error: null,
        },
      }),
    )
    const { valor } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBe(1)
    expect(valor.categoriasConTee).toBe(1)
    expect(valor.categoriasTotal).toBe(2)
  })

  // `ratingsDeLaRondaDelJugador` exige slope Y rating antes de usar el tee: un tee a medio cargar
  // resuelve por nombre y el hándicap sale igual del rating de la cancha.
  it('un tee sin slope ni rating no sirve para calcular, así que no cuenta', async () => {
    const { cliente } = clienteFalso(
      conTees({
        players: {
          data: [
            jugador({ tee_id: 'tee-dorado' }),
            jugador({ category_id: 'cat-1', categories: { default_tee_color: 'dorado', gender: null } }),
          ],
          error: null,
        },
        categories: { data: [{ default_tee_color: 'dorado', gender: null }], error: null },
      }),
    )
    const { valor } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBe(2)
    expect(valor.categoriasConTee).toBe(0)
  })

  it('una cancha sin tees cargados deja a todos sin tee resoluble', async () => {
    const { cliente } = clienteFalso(
      conCancha(
        { course_tees: [] },
        {
        players: {
          data: [
            jugador({ tee_id: 'tee-blanco' }),
            jugador({ category_id: 'cat-1', categories: { default_tee_color: 'blanco', gender: null } }),
          ],
          error: null,
        },
        categories: { data: [{ default_tee_color: 'blanco', gender: null }], error: null },
        },
      ),
    )
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBe(2)
    expect(valor.categoriasConTee).toBe(0)
    // Es un dato real, no un error: la cancha de verdad no publica tees.
    expect(errores).toHaveLength(0)
  })

  // El contexto del motor lo lee `fetchLegacyHcpContext`, que PROPAGA el error (el board prefiere
  // una pantalla de error antes que un neto parpadeando). Acá ese throw tiene que volverse "no se
  // pudo contar", no un fail-open ni una excepción que tumbe la pantalla de editar.
  it('si no se pudo leer el contexto del motor, no afirma que ninguno se quedó sin tee', async () => {
    const { cliente } = clienteFalso(
      conTees({
        tournaments_hcp: { data: null, error: new Error('sin red') },
        players: { data: [jugador()], error: null },
        categories: { data: [{ default_tee_color: 'blanco', gender: null }], error: null },
      }),
    )
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBeNull()
    expect(valor.categoriasConTee).toBeNull()
    expect(errores).toHaveLength(1)
  })

  it('si no se pudo leer la fila del torneo, tampoco cuenta nada', async () => {
    const { cliente } = clienteFalso({
      tournaments: { data: null, error: new Error('PGRST116') },
      players: { data: [jugador()], error: null },
    })
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBeNull()
    expect(valor.categoriasConTee).toBeNull()
    expect(errores).toHaveLength(1)
  })

  // 27 de los 45 torneos de prod guardan un COLOR en `tournaments.tees`: ese es el ÚLTIMO eslabón
  // de la cadena y rescata a todos los que no tienen nada propio.
  it('con un tee global que la cancha publica, nadie se queda sin tee', async () => {
    const { cliente } = clienteFalso(
      conTees({
        tournaments: { data: { ...TORNEO, tees: 'blanco' }, error: null },
        players: { data: [jugador(), jugador({ category_id: 'cat-1', categories: [] })], error: null },
        categories: { data: [{ default_tee_color: null, gender: null }], error: null },
      }),
    )
    const { valor } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBe(0)
    // Pero la categoría NO tiene tee: la pregunta de las categorías es si ELLAS lo dan, no si sus
    // jugadores lo sacan de otra parte.
    expect(valor.categoriasConTee).toBe(0)
  })

  it('un tee global que la cancha no publica no rescata a nadie', async () => {
    const { cliente } = clienteFalso(
      conTees({
        tournaments: { data: { ...TORNEO, tees: 'negras' }, error: null },
        players: { data: [jugador()], error: null },
      }),
    )
    expect((await leerTeeDeCadaJugador(cliente, 't1')).valor.jugadoresSinTee).toBe(1)
  })

  // Un retirado o descalificado no juega: contarlo haría que la pantalla avise un problema que no
  // existe y ofrezca cambiarle el tee a todo el torneo por alguien que no va a salir a la cancha.
  it('solo cuenta a los jugadores que siguen dentro del torneo, desde la lista canónica', async () => {
    const { cliente, registro } = clienteFalso(conTees())
    await leerTeeDeCadaJugador(cliente, 't1')
    expect(registro).toContain(`players.in(status=[${[...JUGADOR_EN_TORNEO_STATUSES].join(',')}])`)
    expect(registro).toContain('players.eq(tournament_id=t1)')
    expect(registro).toContain('categories.eq(tournament_id=t1)')
    expect(registro).toContain('tournaments.eq(id=t1)')
    // El contexto sale del lector del BOARD (`fetchLegacyHcpContext`): la cancha del torneo con su
    // par, sus ratings y su catálogo de tees en un solo embed. Contra los tees de otra cancha, un
    // tee_id válido parecería huérfano y uno huérfano parecería válido; y sin el par, el rating de
    // un tee sano parece increíble.
    const select = registro.find((l) => l.startsWith('tournaments.select(') && l.includes('courses('))
    for (const col of ['par_total', 'slope_rating', 'course_rating', 'course_tees(', 'rating', 'slope', 'genero']) {
      expect(select, col).toContain(col)
    }
    // Y el par de la RONDA sale del catálogo de hoyos de esa cancha, como en el historial.
    expect(registro).toContain('course_holes.eq(course_id=c1)')
  })

  // ─── El hallazgo de la 9ª vuelta: la cadena tiene TRES portones, no dos ───

  // C.G. Río Blanco, real: cancha de 9 (par 35) con sus tres tees cargados en escala de 18 (rating
  // 55). El tee RESUELVE y publica slope y rating, así que `teeCalculaHandicap` dice que sí, pero
  // el guardarrail `ratingEsCreible` lo rechaza contra el par de 9 y el motor cae al rating de la
  // cancha. Un conteo que se quedaba en el segundo portón decía "0 jugadores sin tee" mientras los
  // cuatro puntuaban con el rating general: #292/#303.
  it('un tee cuyo rating no pasa el guardarrail no cuenta, aunque publique slope y rating', async () => {
    const { cliente } = clienteFalso(
      conCancha(
        {
          par_total: 35,
          course_rating: 35.4,
          slope_rating: 125,
          course_tees: [{ id: 'tee-mentiroso', nombre: 'blanco', rating: 55, slope: 113, genero: 'M' }],
        },
        {
          tournaments: {
            data: {
              ...TORNEO,
              hole_count: 9,
              courses: {
                ...TORNEO.courses,
                par_total: 35,
                course_rating: 35.4,
                slope_rating: 125,
                course_tees: [{ id: 'tee-mentiroso', nombre: 'blanco', rating: 55, slope: 113, genero: 'M' }],
              },
            },
            error: null,
          },
          players: { data: [jugador({ tee_id: 'tee-mentiroso' }), jugador()], error: null },
          categories: { data: [{ default_tee_color: 'blanco', gender: null }], error: null },
        },
      ),
    )
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    // Los DOS caen al rating de la cancha: el que apunta al tee mentiroso y el que no tiene tee.
    expect(valor.jugadoresSinTee).toBe(2)
    // Y la categoría que apunta a ese mismo tee tampoco da un tee con el que calcular.
    expect(valor.categoriasConTee).toBe(0)
    expect(errores).toHaveLength(0)
  })

  // El mismo tee, en una cancha cuyo par SÍ está en la escala de su rating: acá el guardarrail lo
  // acepta. Sin este par, el test de arriba pasaría en verde con un conteo que rechaza todo.
  it('y el mismo tee en la escala correcta sí cuenta', async () => {
    const { cliente } = clienteFalso(
      conCancha(
        { par_total: 54, course_tees: [{ id: 'tee-sano', nombre: 'blanco', rating: 55, slope: 113, genero: 'M' }] },
        { players: { data: [jugador({ tee_id: 'tee-sano' })], error: null } },
      ),
    )
    expect((await leerTeeDeCadaJugador(cliente, 't1')).valor.jugadoresSinTee).toBe(0)
  })

  // Sin `courses.par_total`, la escala la da el CATÁLOGO DE HOYOS de la cancha (`parDeLaRondaDelTorneo`),
  // que es la segunda fuente del motor. Esta es la única razón por la que el conteo lee `course_holes`:
  // la misma cancha de 9 con tees en escala de 18, con el par 35 saliendo de sus hoyos en vez de su
  // columna, tiene que seguir rechazando el tee. Con un default de par 72 el rating 55 parecería sano.
  it('sin par en la cancha, la escala la dan sus hoyos: el tee mentiroso sigue sin contar', async () => {
    const { cliente } = clienteFalso(
      conTees({
        tournaments: {
          data: {
            ...TORNEO,
            hole_count: 9,
            courses: {
              ...TORNEO.courses,
              par_total: null,
              course_rating: 35.4,
              slope_rating: 125,
              course_tees: [{ id: 'tee-mentiroso', nombre: 'blanco', rating: 55, slope: 113, genero: 'M' }],
            },
          },
          error: null,
        },
        course_holes: {
          data: Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: i === 0 ? 3 : 4, stroke_index: i + 1 })),
          error: null,
        },
        players: { data: [jugador({ tee_id: 'tee-mentiroso' })], error: null },
      }),
    )
    expect((await leerTeeDeCadaJugador(cliente, 't1')).valor.jugadoresSinTee).toBe(1)
  })

  it('si la consulta de jugadores falla, no afirma que ninguno se quedó sin tee', async () => {
    const { cliente } = clienteFalso(
      conTees({
        players: { data: null, error: new Error('sin red') },
        categories: { data: [{ default_tee_color: 'blanco', gender: null }], error: null },
      }),
    )
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBeNull()
    expect(valor.categoriasConTee).toBe(1)
    expect(errores).toHaveLength(1)
  })

  it('si la consulta de categorías falla, tampoco afirma cuántas tienen tee', async () => {
    const { cliente } = clienteFalso(
      conTees({ players: { data: [], error: null }, categories: { data: null, error: new Error('sin red') } }),
    )
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.categoriasConTee).toBeNull()
    expect(valor.categoriasTotal).toBe(0)
    expect(valor.jugadoresSinTee).toBe(0)
    expect(errores).toHaveLength(1)
  })

  it('un torneo sin inscritos ni categorías no inventa jugadores afectados', async () => {
    const { cliente } = clienteFalso(
      conTees({ players: { data: [], error: null }, categories: { data: [], error: null } }),
    )
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor).toEqual({ jugadoresSinTee: 0, categoriasConTee: 0, categoriasTotal: 0 })
    expect(errores).toHaveLength(0)
  })
})

describe('guardarConfiguracionDelTorneo', () => {
  it('sin nada en juego escribe todo lo que el organizador cambió', async () => {
    const { cliente, updates } = clienteFalso({
      tournaments: { data: { ...FILA, status: 'draft' }, error: null },
      hole_scores: { count: 0, error: null },
      tournament_groups: { count: 0, error: null },
    })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    expect(resultado).toEqual({ ok: true, bloqueadas: [] })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      course_id: 'c2',
      format: 'match_play',
      hole_count: 9,
      tees: 'dorado',
      name: 'Copa de Primavera',
    })
  })

  // El P1 de la 7ª vuelta: los candados que la pantalla recibió por props pueden tener minutos de
  // antigüedad. Lo que decide es esta relectura, no lo que el cliente creía al cargar.
  it('con el torneo ya en juego escribe el valor VIEJO de lo bloqueado y guarda el resto', async () => {
    const { cliente, updates } = clienteFalso({
      tournaments: { data: FILA, error: null },
      hole_scores: { count: 18, error: null },
      tournament_groups: { count: 0, error: null },
    })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    expect(columnasBloqueadas(resultado)).toEqual(['cancha', 'formato', 'hoyos', 'tee'])
    expect(updates[0]).toMatchObject({ course_id: 'c1', format: 'stroke_play', hole_count: 18, tees: 'blanco' })
    // Y lo que el torneo en juego no bloquea se guarda igual: el organizador podía cambiar el nombre.
    expect(updates[0].name).toBe('Copa de Primavera')
    expect(updates[0].date_start).toBe('2026-11-15')
  })

  // El hallazgo de la 8ª vuelta: la CANCHA no tenía candado. Cambiarla con scores puestos mueve el
  // rating, el par y los stroke index de los hoyos ya jugados, y deja los `players.tee_id`
  // apuntando a tees de otra cancha.
  it('la cancha queda bloqueada con scores puestos, con su motivo', async () => {
    const { cliente, updates } = clienteFalso({
      tournaments: { data: FILA, error: null },
      hole_scores: { count: 1, error: null },
    })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', { ...CONFIG, course_id: 'c9' })
    expect(bloqueadas(resultado)).toContainEqual({ columna: 'cancha', motivo: 'scores' })
    expect(updates[0].course_id).toBe('c1')
  })

  // El motivo viaja de vuelta porque la pantalla tiene que decirlo: con solo la lista de columnas,
  // el aviso afirmaba "el torneo ya está en juego" sobre un torneo publicado con 0 scores.
  it('devuelve el motivo de cada columna, no solo que quedó bloqueada', async () => {
    const { cliente } = clienteFalso({
      tournaments: { data: { ...FILA, status: 'open' }, error: null },
      hole_scores: { count: 0, error: null },
      tournament_groups: { count: 0, error: null },
    })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    // Publicado y sin scores: solo el formato cierra, y el motivo es la publicación.
    expect(bloqueadas(resultado)).toEqual([{ columna: 'formato', motivo: 'publicado' }])
  })

  // Solo se le avisa de lo que QUERÍA cambiar: un candado sobre una columna que no tocó no es
  // noticia para él, y decírselo lo haría buscar un problema que no tiene.
  it('solo reporta como bloqueado lo que el organizador de verdad intentó cambiar', async () => {
    const { cliente } = clienteFalso({
      tournaments: { data: FILA, error: null },
      hole_scores: { count: 18, error: null },
    })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', {
      ...CONFIG,
      course_id: FILA.course_id,
      format: FILA.format,
      hole_count: FILA.hole_count,
    })
    expect(bloqueadas(resultado)).toEqual([{ columna: 'tee', motivo: 'scores' }])
  })

  // `startTournament` le copia al scorer la cancha, los hoyos y el tee (`rondas_libres`), así que la
  // primera tarjeta compartida congela los tres aunque todavía no haya ni un score.
  it('con la tarjeta compartida creada quedan la cancha, los hoyos y el tee', async () => {
    const { cliente, updates } = clienteFalso({
      tournaments: { data: FILA, error: null },
      hole_scores: { count: 0, error: null },
      tournament_groups: { count: 1, error: null },
    })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    expect(columnasBloqueadas(resultado)).toEqual(['cancha', 'formato', 'hoyos', 'tee'])
    expect(bloqueadas(resultado)).toContainEqual({ columna: 'tee', motivo: 'tarjeta-compartida' })
    expect(updates[0]).toMatchObject({ course_id: 'c1', tees: 'blanco', hole_count: 18 })
  })

  // Si la relectura no responde, los candados cierran (`candadosDeConfiguracion` con conteos null) y
  // el resto se guarda igual: negarle el cambio de nombre por un hiccup de red sería castigarlo por
  // algo que no hizo.
  it('si no se pudieron leer las señales, no mueve lo bloqueado pero guarda lo demás', async () => {
    const { cliente, updates } = clienteFalso({
      tournaments: { data: FILA, error: null },
      hole_scores: { count: null, error: new Error('sin red') },
      tournament_groups: { count: null, error: new Error('sin red') },
    })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    expect(columnasBloqueadas(resultado)).toEqual(['cancha', 'formato', 'hoyos', 'tee'])
    // El motivo NO afirma que el torneo esté en juego: no se pudo mirar.
    for (const b of bloqueadas(resultado)) expect(b.motivo, b.columna).toBe('indeterminado')
    expect(updates[0]).toMatchObject({
      course_id: 'c1',
      format: 'stroke_play',
      hole_count: 18,
      tees: 'blanco',
      name: 'Copa de Primavera',
    })
  })

  // Sin la fila no se sabe qué valor viejo conservar: con los candados cerrados y sin valores viejos,
  // el UPDATE escribiría los nuevos sobre un torneo que quizás está andando. Así que no escribe nada.
  it('si no se pudo leer la fila, no escribe NADA', async () => {
    const { cliente, updates } = clienteFalso({ tournaments: { data: null, error: new Error('PGRST116') } })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    expect(resultado.ok).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it('si la fila vuelve vacía sin error, tampoco escribe nada', async () => {
    const { cliente, updates } = clienteFalso({ tournaments: { data: null, error: null } })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    expect(resultado.ok).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it('un UPDATE que falla no se reporta como guardado', async () => {
    const { cliente } = clienteFalso({
      tournaments: { data: FILA, error: null },
      hole_scores: { count: 0, error: null },
      update: { error: new Error('RLS') },
    })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    expect(resultado.ok).toBe(false)
  })

  it('lee la fila del torneo que va a escribir, no otra', async () => {
    const { cliente, registro } = clienteFalso({
      tournaments: { data: FILA, error: null },
      hole_scores: { count: 0, error: null },
    })
    await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    expect(registro.filter((l) => l === 'tournaments.eq(id=t1)')).toHaveLength(2)
    expect(registro).toContain('tournaments.single()')
  })
})
