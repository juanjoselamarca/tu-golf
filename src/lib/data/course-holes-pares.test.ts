// Regresión (dead-end hunter 09-oct-2026): el import de Garmin pedía los hoyos de
// todo el catálogo (3.249 filas) en una query; PostgREST corta en 1.000 sin avisar
// y Los Leones salía con par 4 en los 18 hoyos. fetchParesDeCanchas pagina.

import { describe, it, expect } from 'vitest'
import { fetchParesDeCanchas } from './course-holes'
import { MAX_FILAS_POSTGREST } from './postgrest-limites'

type Fila = { id: number; course_id: string; recorrido: string | null; numero: number; par: number }

/** Fake que se comporta como PostgREST: filtra `.in()`, ordena por id y corta en db-max-rows. */
function fakePostgrest(filas: Fila[], opts: { error?: unknown } = {}) {
  const llamadas: Array<{ ids: string[]; desde: number; hasta: number }> = []
  const cliente = {
    from() {
      let ids: string[] = []
      const builder = {
        select: () => builder,
        in: (_col: string, vals: string[]) => { ids = vals; return builder },
        order: () => builder,
        range: (desde: number, hasta: number) => {
          llamadas.push({ ids, desde, hasta })
          if (opts.error) return Promise.resolve({ data: null, error: opts.error })
          const visibles = filas.filter(f => ids.includes(f.course_id)).sort((a, b) => a.id - b.id)
          const pagina = visibles.slice(desde, Math.min(hasta + 1, desde + MAX_FILAS_POSTGREST))
          return Promise.resolve({ data: pagina, error: null })
        },
      }
      return builder
    },
  }
  return { cliente, llamadas }
}

function cancha(courseId: string, idBase: number, pares: number[], recorrido: string | null = null): Fila[] {
  return pares.map((par, i) => ({ id: idBase + i, course_id: courseId, recorrido, numero: i + 1, par }))
}

const PARES_LEONES = [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 3, 4, 4, 5, 5]

describe('fetchParesDeCanchas', () => {
  it('sin canchas no consulta', async () => {
    const { cliente, llamadas } = fakePostgrest([])
    expect(await fetchParesDeCanchas(cliente as never, [])).toEqual([])
    expect(llamadas).toHaveLength(0)
  })

  it('pagina más allá de las 1.000 filas: la cancha que quedaba fuera trae sus pares reales', async () => {
    // 60 canchas × 18 = 1.080 filas; Los Leones es la última (fuera de la 1ª página).
    const filas: Fila[] = []
    for (let c = 0; c < 59; c++) filas.push(...cancha(`c${c}`, c * 18, new Array(18).fill(4)))
    filas.push(...cancha('leones', 59 * 18, PARES_LEONES))
    const ids = [...Array.from({ length: 59 }, (_, c) => `c${c}`), 'leones']
    const { cliente, llamadas } = fakePostgrest(filas)

    const out = await fetchParesDeCanchas(cliente as never, ids)

    expect(out).toHaveLength(1080)
    expect(llamadas.length).toBe(2)
    const leones = out.filter(h => h.course_id === 'leones').map(h => h.par)
    expect(leones).toEqual(PARES_LEONES)
  })

  it('deduplica ids y ordena por recorrido + número', async () => {
    const filas = [
      ...cancha('brisas', 100, [5, 4, 3], 'Sur'),
      ...cancha('brisas', 0, [4, 3, 5], 'Norte'),
    ]
    const { cliente, llamadas } = fakePostgrest(filas)
    const out = await fetchParesDeCanchas(cliente as never, ['brisas', 'brisas', ''])
    expect(llamadas[0].ids).toEqual(['brisas'])
    expect(out.map(h => `${h.recorrido}${h.numero}`)).toEqual(['Norte1', 'Norte2', 'Norte3', 'Sur1', 'Sur2', 'Sur3'])
  })

  it('un error de la BD lanza (no se degrada a "sin pares" → pares inventados)', async () => {
    const { cliente } = fakePostgrest([], { error: new Error('timeout') })
    await expect(fetchParesDeCanchas(cliente as never, ['leones'])).rejects.toThrow('timeout')
  })
})
