// Canario del catálogo de canchas: corre contra la BD REAL y falla si una
// cancha ACTIVA no tiene de dónde sacar el par hoyo por hoyo.
//
// Por qué existe
// --------------
// El canario hermano (`catalogo-rating-canary`) vigila que el rating no mienta.
// Éste vigila algo anterior: que el par de cada hoyo EXISTA. Sin él no hay
// vs-par, el scorer no puede pintar birdie ni bogey, y el coach analiza una
// ronda sin referencia — se juegue gross o neto.
//
// El agujero era real. Hasta el 09-ago-2026 nadie preguntaba esto en ningún
// gate, y en producción quedaron 4 rondas libres FINALIZADAS (marzo-abril 2026,
// 12 jugadores) apuntando al club PADRE de un complejo de 27 hoyos con
// `recorridos` en null: el par no existía por ningún lado. El gate de creación
// ya lo bloquea; este canario es el que avisa cuando entra una cancha nueva sin
// el dato, antes de que alguien juegue encima.
//
// El par es alcanzable por dos vías, las mismas que usa el motor:
//   1. `course_holes` de la cancha misma.
//   2. `course_holes` de sus recorridos hijos, si la ronda los elige.
// Una cancha sin ninguna de las dos no se puede jugar bien de ninguna forma.
//
// Los `npm run test` de CI corren con credenciales placeholder → esto se
// saltea ahí. Quien lo corre de verdad es `.github/workflows/catalogo-canary.yml`
// con los secrets reales, en cada PR y cada push a main.
//
// Correr local: node --env-file=.env.local ./node_modules/vitest/vitest.mjs run \
//   src/__tests__/integration/catalogo-par-por-hoyo.canary.test.ts
//
// Read-only: no escribe nada.

import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * DEUDA CONOCIDA — canchas activas sin par hoyo por hoyo por ninguna vía.
 * Snapshot 09-ago-2026: las 6 tienen 0 rondas, 0 torneos y 0 histórico, así que
 * hoy no afectan a nadie. El gate de creación ya impide empezar una ronda ahí.
 *
 * Les falta el scorecard de FedeGolf (`fedegolf_cancha_id` está cargado en las
 * 6). Esta lista SÓLO puede achicarse: cuando se carguen los hoyos, se borra la
 * entrada en el MISMO PR que carga el dato.
 *
 * Cualquier cancha activa sin par por hoyo que NO esté acá rompe el canario.
 */
const DEUDA_CONOCIDA_SIN_PAR_POR_HOYO: Record<string, string> = {
  '8dabefec-87b4-4e98-a092-3c3ff3f1d44b': 'C.G. Barquito Chanaral - Barquito Chanaral (DAMAS)',
  '3c297b4b-2d06-4f9b-a8d9-1b286a2fdb07': 'C.G. Barquito Chanaral - Barquito Chanaral (VARONES)',
  '14d0eb01-9d68-4438-a4e8-765b1df03b3e': 'C.G. Rio Blanco - Rio Blanco (DAMAS)',
  '04b3601a-bcac-401f-8d83-d459d3712bc0': 'C.G. Rio Blanco - Rio Blanco (VARONES)',
  '67aa3631-d67b-4d6f-8d4f-bb1dda9e8d56': 'Iquique C.C. - Iquique (DAMAS)',
  'd39c9faf-7d3e-4c17-9507-6824bfd2d802': 'Iquique C.C. - Iquique (VARONES)',
}

/**
 * DEUDA CONOCIDA — las 4 rondas libres que se crearon ANTES de que existiera el
 * gate (09-ago-2026), sobre el club padre de un complejo de 27 hoyos y sin
 * `recorridos`. Están finalizadas, con 12 jugadores entre las cuatro.
 *
 * Las cuatro son modo GROSS, así que nadie recibió golpes de más: lo que les
 * falta es el par por hoyo, y con él el vs-par y el análisis del coach.
 *
 * NO se backfillean adivinando: los tres nueves de Brisas (Este/Norte/Sur) y de
 * Rocas (Azul/Blanca/Roja) tienen par 36 cada uno, así que el par TOTAL sale
 * igual con cualquier combinación — pero el par de CADA hoyo no, y ése es
 * justamente el dato que falta. Se completan cuando los jugadores confirmen qué
 * recorrido jugaron, y esta lista se achica en el mismo PR.
 */
const DEUDA_CONOCIDA_RONDAS_SIN_RECORRIDOS: Record<string, string> = {
  UA385E: 'Rocas de Santo Domingo, 9 hoyos, 05-abr-2026 (4 jugadores)',
  W24TBS: 'Brisas de Santo Domingo, 18 hoyos, 04-abr-2026 (3 jugadores)',
  W9SAXK: 'Rocas de Santo Domingo, 18 hoyos, 24-mar-2026 (4 jugadores)',
  AP3T6V: 'Brisas de Santo Domingo, 18 hoyos, 17-mar-2026 (1 jugador)',
}

/**
 * Piso de cardinalidad. Si una query devuelve menos que esto, algo se rompió
 * (credenciales, RLS, filtro, paginación) y el canario estaría pasando en vacío.
 * El catálogo tiene 186 canchas activas y 3.300+ hoyos (ago-2026).
 */
const MINIMO_CANCHAS = 150
const MINIMO_HOYOS = 2_500

/**
 * PostgREST corta en 1.000 filas y NO avisa. Pedir un `.range()` más grande NO
 * alcanza: `db-max-rows` es un techo del servidor, así que la respuesta vuelve
 * truncada igual. `course_holes` tiene 3.300+ filas y se cortaba en 1.000 — un
 * tercio del catálogo sin mirar, con el canario en verde. Por eso se pagina.
 */
const PAGINA = 1_000

/** Tope de seguridad para no colgar el test si algo devuelve páginas infinitas. */
const MAX_PAGINAS = 100

interface CourseRow {
  id: string
  nombre: string
  parent_id: string | null
}

interface RondaRow {
  id: string
  codigo: string
  course_id: string
  recorridos: string[] | null
  fecha: string
  es_demo: boolean | null
}

describe('canario de catálogo — el par hoyo por hoyo existe', () => {
  if (!supabaseUrl || !supabaseKey) {
    it.skip('skipped: sin credenciales de Supabase', () => {})
    return
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey)

  /** Una respuesta de PostgREST, sin depender de sus tipos genéricos. */
  type Respuesta = PromiseLike<{ data: unknown; error: { message?: string } | null }>

  /**
   * Trae una consulta entera, página por página.
   *
   * `construir` recibe el rango y devuelve el query ya armado, para que cada
   * caller use los tipos reales de supabase-js y este helper no tenga que
   * imitarlos. Cada query DEBE ordenar por una columna ÚNICA: con un ORDER BY
   * no-único (o sin ninguno) PostgREST no garantiza orden estable entre páginas
   * y las filas se duplican o se pierden en los bordes — el modo de falla del #254.
   */
  async function paginar<T>(
    que: string,
    construir: (desde: number, hasta: number) => Respuesta,
  ): Promise<T[]> {
    const out: T[] = []
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const desde = pagina * PAGINA
      const { data, error } = await construir(desde, desde + PAGINA - 1)
      expect(error, `error leyendo ${que}: ${error?.message}`).toBeNull()
      const filas = (data ?? []) as T[]
      out.push(...filas)
      if (filas.length < PAGINA) return out
    }
    throw new Error(`${que}: más de ${MAX_PAGINAS * PAGINA} filas — ¿paginación rota?`)
  }

  const traerRondasConCancha = () =>
    paginar<RondaRow>('rondas_libres', (desde, hasta) =>
      supabase
        .from('rondas_libres')
        .select('id, codigo, course_id, recorridos, fecha, es_demo')
        .not('course_id', 'is', null)
        .order('id', { ascending: true })
        .range(desde, hasta),
    )

  /** Canchas activas + el set de course_id que tienen al menos un hoyo. */
  async function leerCatalogo() {
    const [courses, hoyos] = await Promise.all([
      paginar<CourseRow>('courses', (desde, hasta) =>
        supabase
          .from('courses')
          .select('id, nombre, parent_id')
          .eq('activa', true)
          .order('id', { ascending: true })
          .range(desde, hasta),
      ),
      paginar<{ id: string; course_id: string }>('course_holes', (desde, hasta) =>
        supabase
          .from('course_holes')
          .select('id, course_id')
          .order('id', { ascending: true })
          .range(desde, hasta),
      ),
    ])

    // Guardas de cardinalidad: sin esto un filtro roto daría lista vacía → verde falso.
    expect(courses.length).toBeGreaterThanOrEqual(MINIMO_CANCHAS)
    expect(hoyos.length).toBeGreaterThanOrEqual(MINIMO_HOYOS)

    return { courses, conHoyos: new Set(hoyos.map((h) => h.course_id)) }
  }

  /** Los padres que tienen al menos un recorrido hijo CON hoyos cargados. */
  function padresConHijosSanos(courses: CourseRow[], conHoyos: Set<string>): Set<string> {
    return new Set(
      courses.filter((c) => c.parent_id && conHoyos.has(c.id)).map((c) => c.parent_id as string),
    )
  }

  /** ¿De dónde puede salir el par de esta cancha? Mismas vías que el motor. */
  function sinParPorHoyo(courses: CourseRow[], conHoyos: Set<string>): CourseRow[] {
    const conHijosSanos = padresConHijosSanos(courses, conHoyos)
    return courses.filter((c) => !conHoyos.has(c.id) && !conHijosSanos.has(c.id))
  }

  it('ninguna cancha ACTIVA se quedó sin par por hoyo fuera de la deuda conocida', async () => {
    const { courses, conHoyos } = await leerCatalogo()

    const nuevas = sinParPorHoyo(courses, conHoyos).filter(
      (c) => !DEUDA_CONOCIDA_SIN_PAR_POR_HOYO[c.id],
    )

    expect(
      nuevas.map((c) => `${c.nombre} (${c.id})`),
      nuevas.length === 0
        ? ''
        : `Canchas activas sin par hoyo por hoyo (ni propio ni de sus recorridos).\n`
          + `O se carga el scorecard, o se marca la cancha inactiva. Si es deuda`
          + ` aceptada, se agrega a DEUDA_CONOCIDA_SIN_PAR_POR_HOYO con su motivo.`,
    ).toEqual([])
  })

  it('la deuda conocida sólo puede achicarse', async () => {
    const { courses, conHoyos } = await leerCatalogo()
    const sinPar = new Set(sinParPorHoyo(courses, conHoyos).map((c) => c.id))

    // Una entrada que ya no aparece es una cancha ARREGLADA (o desactivada).
    // Eso son buenas noticias y NO puede poner el canario en rojo: sólo se pide
    // que se limpie la lista, y para eso alcanza con nombrarlas.
    const yaResueltas = Object.entries(DEUDA_CONOCIDA_SIN_PAR_POR_HOYO).filter(
      ([id]) => !sinPar.has(id),
    )
    if (yaResueltas.length > 0) {
      console.info(
        `[canario] ${yaResueltas.length} cancha(s) de la deuda ya tienen su par por hoyo — `
          + `bórralas de DEUDA_CONOCIDA_SIN_PAR_POR_HOYO:\n`
          + yaResueltas.map(([id, nombre]) => `  · ${nombre} (${id})`).join('\n'),
      )
    }
    // Lo que SÍ es un problema es que la lista crezca sola: el test de arriba lo
    // cubre, y este techo evita que alguien la ensanche sin verlo.
    expect(Object.keys(DEUDA_CONOCIDA_SIN_PAR_POR_HOYO).length).toBeLessThanOrEqual(6)
  })

  it('ninguna ronda libre quedó apuntando a una cancha sin par por hoyo', async () => {
    // El gate de creación ya lo impide, pero una ronda anterior al gate, o una
    // cancha que pierde sus hoyos después, harían reaparecer esto en silencio.
    const { courses, conHoyos } = await leerCatalogo()
    const sinPar = new Set(sinParPorHoyo(courses, conHoyos).map((c) => c.id))
    const conHijosSanos = padresConHijosSanos(courses, conHoyos)

    const rondas = await traerRondasConCancha()

    const rotas = rondas.filter((r) => {
      if (r.es_demo) return false
      if (DEUDA_CONOCIDA_RONDAS_SIN_RECORRIDOS[r.codigo]) return false
      if (sinPar.has(r.course_id)) return true
      // Una cancha multi-recorrido sólo resuelve el par si la ronda eligió loops.
      const dependeDeLoops = !conHoyos.has(r.course_id) && conHijosSanos.has(r.course_id)
      return dependeDeLoops && (r.recorridos ?? []).length === 0
    })

    expect(
      rotas.map((r) => `${r.codigo} (${r.fecha})`),
      rotas.length === 0
        ? ''
        : `Rondas libres NUEVAS sin par hoyo por hoyo. El gate de creación`
          + ` (09-ago-2026) tendría que haberlas frenado: si aparecen acá, el gate`
          + ` tiene un agujero. No se backfillean adivinando los recorridos.`,
    ).toEqual([])
  })

  it('la deuda de rondas viejas sigue acotada a las 4 conocidas', async () => {
    // Espeja el contrato de la deuda de canchas: sólo puede achicarse. Si una
    // ronda de la lista ya tiene sus recorridos, son buenas noticias y no puede
    // poner el canario en rojo — sólo se pide limpiar la lista.
    const { courses, conHoyos } = await leerCatalogo()
    const conHijosSanos = padresConHijosSanos(courses, conHoyos)

    const rondas = await traerRondasConCancha()
    const porCodigo = new Map(rondas.map((r) => [r.codigo, r]))

    const yaResueltas = Object.keys(DEUDA_CONOCIDA_RONDAS_SIN_RECORRIDOS).filter((codigo) => {
      const r = porCodigo.get(codigo)
      if (!r) return true // borrada
      const dependeDeLoops = !conHoyos.has(r.course_id) && conHijosSanos.has(r.course_id)
      return !dependeDeLoops || (r.recorridos ?? []).length > 0
    })
    if (yaResueltas.length > 0) {
      console.info(
        `[canario] ${yaResueltas.length} ronda(s) de la deuda ya tienen sus recorridos — `
          + `bórralas de DEUDA_CONOCIDA_RONDAS_SIN_RECORRIDOS: ${yaResueltas.join(', ')}`,
      )
    }
    expect(Object.keys(DEUDA_CONOCIDA_RONDAS_SIN_RECORRIDOS).length).toBeLessThanOrEqual(4)
  })
})
