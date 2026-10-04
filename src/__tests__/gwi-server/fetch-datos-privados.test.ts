/**
 * fetchDatosPrivadosGWI — batch primero (2 queries por request), camino por
 * usuario sólo si el batch podría venir truncado por el tope de PostgREST.
 * Supabase falso que SÍ aplica `eq/in(user_id)`, el orden ya dado y `.limit`
 * (y el tope de 1.000 filas), para que el recorte en memoria se pruebe de verdad.
 */
import { describe, it, expect } from 'vitest'
import { fetchDatosPrivadosGWI } from '@/lib/data/gwi'
import { MAX_FILAS_POSTGREST } from '@/lib/data/postgrest-limites'

type Fila = { user_id: string } & Record<string, unknown>

function supabaseQueFiltra(tablas: Record<string, Fila[]>) {
  const consultas: Array<{ tabla: string; usuarios: string[]; limit: number | null }> = []
  return {
    consultas,
    from(tabla: string) {
      let usuarios: string[] = []
      let limit: number | null = null
      const q = {
        select: () => q,
        not: () => q,
        order: () => q,
        eq: (col: string, v: string) => { if (col === 'user_id') usuarios = [v]; return q },
        in: (col: string, v: string[]) => { if (col === 'user_id') usuarios = v; return q },
        limit: (n: number) => { limit = n; return q },
        then: (ok: (r: { data: Fila[]; error: null }) => unknown) => {
          consultas.push({ tabla, usuarios, limit })
          const filas = (tablas[tabla] ?? []).filter(f => usuarios.includes(f.user_id))
          const tope = Math.min(limit ?? Infinity, MAX_FILAS_POSTGREST)
          return Promise.resolve({ data: filas.slice(0, tope), error: null }).then(ok)
        },
      }
      return q
    },
  }
}

const rondas = (uid: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ user_id: uid, total_gross: 70 + i, course_name: 'A', holes_played: 18, scores: null }))

describe('fetchDatosPrivadosGWI', () => {
  it('ronda libre (4 jugadores × 60): UNA query por tabla y recorte por usuario en memoria', async () => {
    // Intercaladas por fecha como las devolvería ORDER BY played_at desc.
    const hist = [0, 1, 2, 3].flatMap(i => [rondas('a', 80)[i], rondas('b', 3)[i]].filter(Boolean)).concat(rondas('a', 80).slice(4))
    const sb = supabaseQueFiltra({ historical_rounds: hist, player_patterns: [{ user_id: 'b', pattern_type: 'back_nine_collapse', confidence: 0.8, metadata: null }] })
    const r = await fetchDatosPrivadosGWI(sb as never, ['a', 'b', 'c', 'd'], 60)

    expect(sb.consultas.map(c => c.tabla)).toEqual(['historical_rounds', 'player_patterns'])
    expect(sb.consultas[0].usuarios).toEqual(['a', 'b', 'c', 'd'])
    // El recorte respeta el límite por usuario y el orden (las más recientes).
    expect(r.historialPorUsuario.get('a')).toHaveLength(60)
    expect(r.historialPorUsuario.get('a')![0]).toMatchObject({ total_gross: 70 })
    expect(r.historialPorUsuario.get('b')).toHaveLength(3)
    expect(r.historialPorUsuario.get('c')).toEqual([])
    expect(r.historialPorUsuario.get('a')![0]).not.toHaveProperty('user_id')
    expect(r.patronesPorUsuario.get('b')).toHaveLength(1)
    expect(r.patronesPorUsuario.get('a')).toEqual([])
  })

  it('batch que llega al tope de PostgREST (posible truncamiento) → cae al camino por usuario', async () => {
    // 10 usuarios × 60 = 600 ≤ 1000, pero entre todos tienen 1.200 rondas: el batch vuelve con 1.000.
    const ids = Array.from({ length: 10 }, (_, i) => `u${i}`)
    const sb = supabaseQueFiltra({ historical_rounds: ids.flatMap(u => rondas(u, 120)), player_patterns: [] })
    const r = await fetchDatosPrivadosGWI(sb as never, ids, 60)

    const hist = sb.consultas.filter(c => c.tabla === 'historical_rounds')
    expect(hist[0]).toMatchObject({ usuarios: ids, limit: MAX_FILAS_POSTGREST })
    expect(hist.slice(1).map(c => c.limit)).toEqual(Array(10).fill(60))
    for (const u of ids) expect(r.historialPorUsuario.get(u)).toHaveLength(60)
  })

  it('torneo grande (usuarios × límite > tope) → directo al camino por usuario, con límite explícito', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`) // 30 × 40 = 1.200 > 1.000
    const sb = supabaseQueFiltra({ historical_rounds: ids.flatMap(u => rondas(u, 50)), player_patterns: [] })
    const r = await fetchDatosPrivadosGWI(sb as never, ids, 40)

    const hist = sb.consultas.filter(c => c.tabla === 'historical_rounds')
    expect(hist).toHaveLength(30)
    expect(hist.every(c => c.usuarios.length === 1 && c.limit === 40)).toBe(true)
    for (const u of ids) expect(r.historialPorUsuario.get(u)).toHaveLength(40)
  })

  it('sin usuarios no consulta nada', async () => {
    const sb = supabaseQueFiltra({})
    await fetchDatosPrivadosGWI(sb as never, [], 60)
    expect(sb.consultas).toEqual([])
  })
})
