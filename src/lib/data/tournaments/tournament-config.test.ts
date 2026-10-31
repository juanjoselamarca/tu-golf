import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  leerSenalesDeTorneoEnJuego,
  leerTeeDeCadaJugador,
  guardarConfiguracionDelTorneo,
  type ConfiguracionDelTorneo,
} from './tournament-config'
import { JUGADOR_EN_TORNEO_STATUSES } from '@/golf/tournament-status'

/** Lo que cada tabla responde, más el `update`. Lo que no se declare responde vacío y sin error. */
interface Respuestas {
  hole_scores?: { count: number | null; error: unknown }
  tournament_groups?: { count: number | null; error: unknown }
  players?: { data: unknown[] | null; error: unknown }
  categories?: { data: unknown[] | null; error: unknown }
  tournaments?: { data: unknown; error: unknown }
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
    const anotar = (linea: string) => registro.push(`${tabla}.${linea}`)
    const q = {
      select: (cols?: string) => (anotar(`select(${cols ?? ''})`), q),
      eq: (col: string, val: unknown) => (anotar(`eq(${col}=${String(val)})`), q),
      in: (col: string, vals: readonly unknown[]) => (anotar(`in(${col}=[${vals.join(',')}])`), q),
      not: (col: string, op: string, val: unknown) => (anotar(`not(${col} ${op} ${String(val)})`), q),
      single: () => (anotar('single()'), q),
      update: (payload: Record<string, unknown>) => {
        esUpdate = true
        updates.push(payload)
        anotar('update()')
        return q
      },
      then: <T>(ok: (v: unknown) => T, err?: (e: unknown) => T) => {
        const respuesta = esUpdate
          ? (respuestas.update ?? { error: null })
          : (respuestas[tabla as keyof Respuestas] ?? { count: 0, data: [], error: null })
        return Promise.resolve(respuesta).then(ok, err)
      },
    }
    return q
  }

  return { cliente: { from } as unknown as SupabaseClient, registro, updates }
}

const CONFIG: ConfiguracionDelTorneo = {
  name: 'Copa de Primavera',
  course_id: 'c1',
  format: 'match_play',
  hole_count: 9,
  tees: 'dorado',
  use_handicap: true,
  cover_image_url: null,
  date_start: '2026-11-15',
}

/** La fila como está en la base: lo que el organizador quiere cambiar es TODO lo de `CONFIG`. */
const FILA = { format: 'stroke_play', hole_count: 18, tees: 'blanco', status: 'in_progress' }

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
  // La unidad es el JUGADOR: `players.category_id` es nullable, así que un inscrito sin categoría
  // se queda sin tee aunque TODAS las categorías del torneo tengan uno.
  it('cuenta los jugadores sin tee resoluble, no las categorías sin tee', async () => {
    const { cliente } = clienteFalso({
      players: {
        data: [
          { tee_id: 'tee-1', category_id: 'cat-1', categories: { default_tee_color: null } },
          { tee_id: null, category_id: 'cat-1', categories: { default_tee_color: 'blanco' } },
          { tee_id: null, category_id: null, categories: null },
        ],
        error: null,
      },
      categories: { data: [{ default_tee_color: 'blanco' }, { default_tee_color: 'azul' }], error: null },
    })
    const { valor } = await leerTeeDeCadaJugador(cliente, 't1')
    // El primero tiene tee propio, el segundo lo saca de su categoría, el tercero no tiene de dónde.
    expect(valor).toEqual({ jugadoresSinTee: 1, jugadoresTotal: 3, categoriasConTee: 2, categoriasTotal: 2 })
  })

  // Los tipos generados declaran el embed como ARRAY aunque PostgREST devuelva un objeto. Si el
  // conteo confiara en una sola forma, el día que cambie diría "ninguno sin tee" en silencio: justo
  // el fail-open que este módulo vino a cerrar.
  it('lee el tee de la categoría venga como objeto o como array', async () => {
    const { cliente } = clienteFalso({
      players: {
        data: [
          { tee_id: null, category_id: 'cat-1', categories: [{ default_tee_color: 'blanco' }] },
          { tee_id: null, category_id: 'cat-2', categories: [{ default_tee_color: null }] },
          { tee_id: null, category_id: 'cat-3', categories: [] },
        ],
        error: null,
      },
    })
    const { valor } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBe(2)
    expect(valor.jugadoresTotal).toBe(3)
  })

  // Un retirado o descalificado no juega: contarlo haría que la pantalla avise un problema que no
  // existe y ofrezca cambiarle el tee a todo el torneo por alguien que no va a salir a la cancha.
  it('solo cuenta a los jugadores que siguen dentro del torneo, desde la lista canónica', async () => {
    const { cliente, registro } = clienteFalso()
    await leerTeeDeCadaJugador(cliente, 't1')
    expect(registro).toContain(`players.in(status=[${[...JUGADOR_EN_TORNEO_STATUSES].join(',')}])`)
    expect(registro).toContain('players.eq(tournament_id=t1)')
    expect(registro).toContain('categories.eq(tournament_id=t1)')
  })

  it('si la consulta de jugadores falla, no afirma que ninguno se quedó sin tee', async () => {
    const { cliente } = clienteFalso({
      players: { data: null, error: new Error('sin red') },
      categories: { data: [{ default_tee_color: 'blanco' }], error: null },
    })
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.jugadoresSinTee).toBeNull()
    expect(valor.categoriasConTee).toBe(1)
    expect(errores).toHaveLength(1)
  })

  it('si la consulta de categorías falla, tampoco afirma cuántas tienen tee', async () => {
    const { cliente } = clienteFalso({
      players: { data: [], error: null },
      categories: { data: null, error: new Error('sin red') },
    })
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor.categoriasConTee).toBeNull()
    expect(valor.categoriasTotal).toBe(0)
    expect(valor.jugadoresSinTee).toBe(0)
    expect(errores).toHaveLength(1)
  })

  it('un torneo sin inscritos ni categorías no inventa jugadores afectados', async () => {
    const { cliente } = clienteFalso({ players: { data: [], error: null }, categories: { data: [], error: null } })
    const { valor, errores } = await leerTeeDeCadaJugador(cliente, 't1')
    expect(valor).toEqual({ jugadoresSinTee: 0, jugadoresTotal: 0, categoriasConTee: 0, categoriasTotal: 0 })
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
    expect(updates[0]).toMatchObject({ format: 'match_play', hole_count: 9, tees: 'dorado', name: 'Copa de Primavera' })
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
    expect(resultado.ok).toBe(true)
    expect(resultado.ok && resultado.bloqueadas.sort()).toEqual(['formato', 'hoyos', 'tee'])
    expect(updates[0]).toMatchObject({ format: 'stroke_play', hole_count: 18, tees: 'blanco' })
    // Y lo que el torneo en juego no bloquea se guarda igual: el organizador podía cambiar el nombre.
    expect(updates[0].name).toBe('Copa de Primavera')
    expect(updates[0].date_start).toBe('2026-11-15')
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
      format: FILA.format,
      hole_count: FILA.hole_count,
    })
    expect(resultado.ok && resultado.bloqueadas).toEqual(['tee'])
  })

  it('con la tarjeta compartida creada, el tee queda y los hoyos siguen editables', async () => {
    const { cliente, updates } = clienteFalso({
      tournaments: { data: FILA, error: null },
      hole_scores: { count: 0, error: null },
      tournament_groups: { count: 1, error: null },
    })
    const resultado = await guardarConfiguracionDelTorneo(cliente, 't1', CONFIG)
    expect(resultado.ok && resultado.bloqueadas.sort()).toEqual(['formato', 'tee'])
    expect(updates[0]).toMatchObject({ tees: 'blanco', hole_count: 9 })
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
    expect(resultado.ok && resultado.bloqueadas.sort()).toEqual(['formato', 'hoyos', 'tee'])
    expect(updates[0]).toMatchObject({ format: 'stroke_play', hole_count: 18, tees: 'blanco', name: 'Copa de Primavera' })
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
