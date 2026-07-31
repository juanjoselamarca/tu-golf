// Canario del catálogo de canchas: corre contra la BD REAL y falla si una
// cancha ACTIVA tiene un rating incoherente con su par.
//
// Por qué existe
// --------------
// El guardarrail de `resolverCourseHandicap` evita que un dato malo produzca un
// handicap absurdo, pero lo hace en silencio: la cancha queda repartiendo el
// índice crudo y nadie se entera. Este canario es el que grita. Un dato malo
// que entra al catálogo (import automático, carga manual, sync FedeGolf) tiene
// que romper el build ANTES de que alguien arme un torneo encima.
//
// Los `npm run test` de CI corren con credenciales placeholder → esto se
// saltea ahí. Quien lo corre de verdad es `.github/workflows/catalogo-canary.yml`
// con los secrets reales, en cada PR y cada push a main.
//
// Correr local: node --env-file=.env.local ./node_modules/vitest/vitest.mjs run \
//   src/__tests__/integration/catalogo-rating-canary.test.ts
//
// Read-only: no escribe nada.

import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { evaluarRating } from '@/golf/courses/rating-coherente'
import { esEscalaDe18Hoyos, courseRatingEnEscalaDe9, parEnEscalaDe9 } from '@/golf/core/course-handicap'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * DEUDA CONOCIDA — las 11 canchas de 9 hoyos cuyo rating está cargado en escala
 * de 18 (o es imposible). Documentadas, con guardarrail activo en el motor y en
 * la creación de torneos.
 *
 * Esta lista SÓLO puede achicarse. Cuando el Frente B cargue los ratings
 * oficiales de 9 hoyos (`front_course_rating` / `front_slope_rating`), se borra
 * la entrada correspondiente en el MISMO PR que carga el dato.
 *
 * Cualquier cancha activa incoherente que NO esté acá rompe el canario.
 */
const DEUDA_CONOCIDA_RATING_9H: Record<string, string> = {
  '14d0eb01-9d68-4438-a4e8-765b1df03b3e': 'C.G. Rio Blanco - Rio Blanco (DAMAS)',
  '04b3601a-bcac-401f-8d83-d459d3712bc0': 'C.G. Rio Blanco - Rio Blanco (VARONES)',
  'e20b950c-3f75-405e-99b1-8898f85b93af': 'Club de Golf Brisas de Santo Domingo - Este',
  '78c9b8d2-0608-46fa-8085-c7a652601ce8': 'Club de Golf Brisas de Santo Domingo - Norte',
  '7bb13daa-0877-4c05-bc93-8caf6500faaf': 'Club de Golf Brisas de Santo Domingo - Sur',
  'daa13f0b-e025-45b7-9307-4866ed721cb4': 'Club de Golf Marbella - Andes Pro',
  'b176f69f-b455-4307-b135-5762a4bc096d': 'Club de Golf Marbella - Pacifico Norte',
  'dd18b74f-5977-42b2-9cbc-abc2389ccab3': 'Club de Golf Marbella - Pacifico Sur',
  '2ec2bffd-2cfb-4e6e-8f74-68b3b04512f1': 'Club de Golf Rocas de Santo Domingo - Azul',
  '7b073e28-d30b-4cfc-afdc-0cd2df28660c': 'Club de Golf Rocas de Santo Domingo - Blanca',
  '057136a1-175f-444d-a4e9-e2a7236769cc': 'Club de Golf Rocas de Santo Domingo - Roja',
}

/**
 * Deuda conocida a nivel de TEE: filas sueltas cuyo rating no cuadra, en
 * canchas que igual tienen otra fuente sana (el motor baja de eslabón).
 * Mismo contrato: sólo puede achicarse.
 */
const DEUDA_CONOCIDA_TEES: Record<string, string> = {
  '5d6dcff8-f6c9-45f8-91a4-182b2853b0c8': 'C.G. Rinconada De Chillan (VARONES) — front/back no suman el rating total',
}

/**
 * Piso de cardinalidad. Si la query devuelve menos que esto, algo se rompió
 * (credenciales, RLS, filtro) y el canario estaría pasando en vacío.
 * El catálogo tiene 193 canchas y 477 tees (jul-2026); nunca debería encoger.
 */
const MINIMO_CANCHAS = 150
const MINIMO_TEES = 400

/**
 * PostgREST corta en 1.000 filas por defecto y NO avisa. Un catálogo que crece
 * dejaría filas sin mirar y el canario seguiría verde — el modo de falla que
 * este test existe para no tener. Se pide el rango explícito.
 */
const MAX_FILAS = 10_000

interface CourseRow {
  id: string
  nombre: string
  par_total: number | null
  course_rating: number | null
  activa: boolean | null
}

interface TeeRow {
  course_id: string
  nombre: string
  genero: string | null
  rating: number | null
  front_course_rating: number | null
  back_course_rating: number | null
}

interface Hallazgo {
  courseId: string
  detalle: string
}

describe('canario de catálogo — rating coherente con el par', () => {
  if (!supabaseUrl || !supabaseKey) {
    it.skip('skipped: sin credenciales de Supabase', () => {})
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  it('ninguna cancha ACTIVA tiene un rating incoherente fuera de la deuda conocida', async () => {
    const { data, error } = await supabase
      .from('courses')
      .select('id, nombre, par_total, course_rating, activa')
      .eq('activa', true)
      .range(0, MAX_FILAS - 1)
    expect(error, `error leyendo courses: ${error?.message}`).toBeNull()

    const courses = (data ?? []) as CourseRow[]
    // Guarda de cardinalidad: sin esto un filtro roto daría lista vacía → verde falso.
    expect(courses.length).toBeGreaterThanOrEqual(MINIMO_CANCHAS)

    const nuevos: Hallazgo[] = []
    const deudaVista = new Set<string>()

    for (const c of courses) {
      const holes = c.par_total != null && !esEscalaDe18Hoyos(c.par_total) ? 9 : 18
      const v = evaluarRating({ courseRating: c.course_rating, par: c.par_total, holes })
      if (!v.esIncoherente) continue
      if (DEUDA_CONOCIDA_RATING_9H[c.id]) {
        deudaVista.add(c.id)
        continue
      }
      nuevos.push({
        courseId: c.id,
        detalle: `${c.nombre} (${c.id}) — par ${c.par_total}, rating ${c.course_rating}, `
          + `delta ${v.delta?.toFixed(1)} sobre una tolerancia de ${v.tolerancia} a ${holes} hoyos`,
      })
    }

    // El canario tiene que MORDER. La prueba de que muerde es SINTÉTICA a
    // propósito: si dependiera de encontrar deuda real en prod, el día que el
    // Frente B cargue los ratings buenos el CI se pondría rojo por tener el
    // catálogo sano. `deudaVista` sólo se usa para reportar, no para afirmar.
    expect(
      evaluarRating({ courseRating: 72, par: 36, holes: 9 }).esIncoherente,
      'el detector dejó de marcar un rating de 18h sobre un par de 9 — revisá la tolerancia',
    ).toBe(true)
    // `deudaVista` no puede tener nada que NO esté declarado — si aparece, es
    // que el Record y la realidad se desincronizaron.
    deudaVista.forEach((id) => expect(DEUDA_CONOCIDA_RATING_9H[id]).toBeTruthy())

    expect(
      nuevos.map((n) => n.detalle),
      'Hay canchas ACTIVAS con rating incoherente que no están documentadas. '
        + 'Cargá el rating oficial correcto, o agregalas a DEUDA_CONOCIDA_RATING_9H con su motivo.',
    ).toEqual([])
  })

  it('ningún tee de una cancha ACTIVA tiene un rating incoherente fuera de la deuda conocida', async () => {
    const [{ data: courseData, error: cErr }, { data: teeData, error: tErr }] = await Promise.all([
      supabase
        .from('courses')
        .select('id, nombre, par_total, course_rating, activa')
        .eq('activa', true)
        .range(0, MAX_FILAS - 1),
      supabase
        .from('course_tees')
        .select('course_id, nombre, genero, rating, front_course_rating, back_course_rating')
        .range(0, MAX_FILAS - 1),
    ])
    expect(cErr, `error leyendo courses: ${cErr?.message}`).toBeNull()
    expect(tErr, `error leyendo course_tees: ${tErr?.message}`).toBeNull()

    const courses = (courseData ?? []) as CourseRow[]
    const tees = (teeData ?? []) as TeeRow[]
    expect(courses.length).toBeGreaterThanOrEqual(MINIMO_CANCHAS)
    expect(tees.length).toBeGreaterThanOrEqual(MINIMO_TEES)

    const porId = new Map(courses.map((c) => [c.id, c]))
    const conDeuda = { ...DEUDA_CONOCIDA_RATING_9H, ...DEUDA_CONOCIDA_TEES }

    const nuevos: string[] = []
    let evaluados = 0

    for (const t of tees) {
      const c = porId.get(t.course_id)
      if (!c || c.par_total == null) continue // tee de cancha inactiva o sin par
      const esCancha9h = !esEscalaDe18Hoyos(c.par_total)
      const etiqueta = `${c.nombre} · tee ${t.nombre}(${t.genero ?? '-'})`

      // 1. El rating publicado del tee, contra el par de su propia cancha.
      const holesTee = esCancha9h ? 9 : 18
      const parTee = esCancha9h ? parEnEscalaDe9(c.par_total) : c.par_total
      const vTee = evaluarRating({ courseRating: t.rating, par: parTee, holes: holesTee })
      if (t.rating != null) evaluados++
      if (vTee.esIncoherente && !conDeuda[c.id]) {
        nuevos.push(`${etiqueta} — rating ${t.rating} vs par ${parTee} (delta ${vTee.delta?.toFixed(1)})`)
      }

      // 2. Los ratings de 9 hoyos publicados, contra el par de 9 hoyos.
      const par9 = parEnEscalaDe9(c.par_total)
      for (const [campo, valor] of [
        ['front_course_rating', t.front_course_rating],
        ['back_course_rating', t.back_course_rating],
      ] as const) {
        const v9 = evaluarRating({ courseRating: valor, par: par9, holes: 9 })
        if (valor != null) evaluados++
        if (v9.esIncoherente && !conDeuda[c.id]) {
          nuevos.push(`${etiqueta} — ${campo} ${valor} vs par9 ${par9} (delta ${v9.delta?.toFixed(1)})`)
        }
      }
    }

    // Guarda: el bucle tiene que haber comparado algo de verdad.
    expect(evaluados, 'el canario no evaluó ni un rating — la query no mordió').toBeGreaterThan(MINIMO_TEES)

    expect(
      nuevos,
      'Hay tees de canchas ACTIVAS con rating incoherente sin documentar. '
        + 'Corregí el dato o agregá la cancha a DEUDA_CONOCIDA_TEES con su motivo.',
    ).toEqual([])
  })

  it('la deuda conocida no crece: sólo puede achicarse', () => {
    // Snapshot del 30-jul-2026. Si alguien agrega una cancha a la lista en vez
    // de arreglar el dato, este número cambia y el diff lo hace visible.
    expect(Object.keys(DEUDA_CONOCIDA_RATING_9H).length).toBeLessThanOrEqual(11)
    expect(Object.keys(DEUDA_CONOCIDA_TEES).length).toBeLessThanOrEqual(1)
  })

  it('courseRatingEnEscalaDe9 no rompe el veredicto de una cancha sana', () => {
    // Espejo de lo que hace el motor: una cancha de 18 sana sigue siendo sana
    // cuando se la mira a 9 hoyos. Corre sin BD, es la red de seguridad del
    // criterio que usan los dos tests de arriba.
    const cr9 = courseRatingEnEscalaDe9(71.6, 72)
    expect(evaluarRating({ courseRating: cr9, par: parEnEscalaDe9(72), holes: 9 }).esCreible).toBe(true)
  })
})
