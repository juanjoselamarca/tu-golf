// Canario del DATO: el índice Golfers+ guardado en `profiles.indice_golfers` es el que sale de las
// rondas de ese usuario, y el handicap con que está inscrita la gente en los torneos vivos es creíble.
//
// Por qué existe (03-nov-2026). El índice entra directo al neto. Lo escribe el RPC
// `calcular_indice_golfers` cuando ALGUIEN lo llama (fin de ronda, import, edición del historial); si un
// camino no lo llama o la llamada falla en silencio (`.then(() => {})`), el perfil queda con un índice
// viejo y nada lo nota: `canary-whs-index-sql` compara el RPC con el motor, no el dato con las rondas.
// La segunda vigilancia nació de un hallazgo real: 7 inscritos de un torneo `raw` de mayo quedaron con
// `handicap_at_registration` −59..−38 (índice − 60: course_rating NULL tratado como 0). El código de hoy
// ya no lo produce; el canario avisa si vuelve a entrar en un torneo donde se juega.
//
// Solo lectura, vía `exec_sql` (sin el tope de 1.000 filas de PostgREST). Lo corre prod-canarios.yml.

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { indexWindowDifferentials, type IndexWindowRound } from '@/golf/core/index-window'
import { computeGolfersIndex } from '@/golf/core/whs-index'
import { courseDataDeInscripcion, esHandicapDeInscripcionValido, rangoDeHandicapDeInscripcion } from '@/golf/handicap-index-range'

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Pisos de cardinalidad: por debajo, la consulta mide en vacío. Hoy: 614 rondas, 10 usuarios con 3+, 7 índices. */
const MIN_RONDAS = 100
const MIN_USUARIOS_CON_INDICE = 5

type Ronda = IndexWindowRound & { user_id: string }
type Perfil = { id: string; indice_golfers: number | null }
type Inscrito = {
  slug: string; hcp: number | null; hcp_calc_mode: string | null
  slope_rating: number | null; course_rating: number | null; par_total: number | null
}

const aDecima = (v: number | null) => (v == null ? null : Math.round(Number(v) * 10))

describe.skipIf(!url || !serviceKey)('índice Golfers+ guardado = recalculado; handicap de inscripción creíble', () => {
  let admin: SupabaseClient

  async function sql<T>(query: string): Promise<T[]> {
    const { data, error } = await admin.rpc('exec_sql', { query })
    if (error) throw error
    if (data && !Array.isArray(data) && typeof data === 'object' && 'error' in data) throw new Error(`exec_sql: ${(data as { error: string }).error}`)
    return (data ?? []) as T[]
  }

  beforeAll(() => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  })

  it('cada perfil tiene exactamente el índice que dan sus rondas (motor TS = RPC, sobre el dato real)', async () => {
    const rondas = await sql<Ronda>(
      `select user_id, id, played_at::text, created_at::text, diferencial, slope_rating, course_rating,
              excluded_from_handicap, total_gross, holes_played from historical_rounds`,
    )
    const perfiles = await sql<Perfil>('select id, indice_golfers from profiles')
    expect(rondas.length).toBeGreaterThanOrEqual(MIN_RONDAS)

    const porUsuario = new Map<string, Ronda[]>()
    for (const r of rondas) porUsuario.set(r.user_id, [...(porUsuario.get(r.user_id) ?? []), r])
    const calculado = new Map<string, number | null>()
    for (const [uid, rs] of porUsuario) calculado.set(uid, computeGolfersIndex(indexWindowDifferentials(rs)))

    const guardado = new Map(perfiles.map(p => [p.id, p.indice_golfers]))
    expect([...calculado.values()].filter(v => v != null).length).toBeGreaterThanOrEqual(MIN_USUARIOS_CON_INDICE)
    expect(perfiles.filter(p => p.indice_golfers != null).length).toBeGreaterThanOrEqual(MIN_USUARIOS_CON_INDICE)

    const usuarios = new Set([...calculado.keys(), ...perfiles.filter(p => p.indice_golfers != null).map(p => p.id)])
    const desfasados = [...usuarios]
      .filter(uid => aDecima(guardado.get(uid) ?? null) !== aDecima(calculado.get(uid) ?? null))
      .map(uid => `${uid.slice(0, 8)}: guardado ${guardado.get(uid) ?? 'null'} · rondas dan ${calculado.get(uid) ?? 'null'} (${porUsuario.get(uid)?.length ?? 0} rondas)`)
    expect(desfasados, 'perfiles con índice distinto al que dan sus rondas').toEqual([])
  })

  it('en los torneos vivos ningún inscrito tiene un handicap fuera del rango de ese torneo', async () => {
    const inscritos = await sql<Inscrito>(
      `select t.slug, p.handicap_at_registration as hcp, t.hcp_calc_mode, c.slope_rating, c.course_rating, c.par_total
       from players p join tournaments t on t.id = p.tournament_id left join courses c on c.id = t.course_id
       where t.es_demo = false and t.status in ('open', 'in_progress') and p.handicap_at_registration is not null`,
    )
    const fuera = inscritos
      .filter(i => !esHandicapDeInscripcionValido(Number(i.hcp), rangoDeHandicapDeInscripcion(i.hcp_calc_mode, courseDataDeInscripcion(i))))
      .map(i => `${i.slug} (${i.hcp_calc_mode}): ${i.hcp}`)
    expect(fuera, 'inscritos con handicap fuera del rango creíble de su torneo').toEqual([])
  })
})
