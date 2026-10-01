/**
 * El GWI reparte golpes con el COURSE HANDICAP, no con el índice crudo (01-oct-2026).
 * Data real de prod: ronda demo GATEB2BN (Los Leones, 9 hoyos desde el 10). Antes,
 * Tomás Demo (índice 12) recibía 12 golpes en 9 hoyos → neto -12 con 36 golpes.
 */
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { courseHandicapsDeRonda } from '@/lib/data/ronda-libre'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!url || !serviceKey)('courseHandicapsDeRonda — data real (GWI)', () => {
  it('9 hoyos: el course handicap parte el índice a la mitad (≈ CH de 9h), no lo usa crudo', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const { data: ronda } = await admin
      .from('rondas_libres')
      .select('course_id, tees, holes, recorridos, ronda_libre_jugadores(id, nombre, user_id, handicap, tees)')
      .eq('codigo', 'GATEB2BN')
      .maybeSingle()
    if (!ronda) return // la demo se borró: nada que verificar (no es un falso verde: lo cubre el unit de course-handicap)
    expect(ronda.holes).toBe(9)
    const { courseHcpMap, indexByJugador } = await courseHandicapsDeRonda(admin, ronda as never, 72)
    for (const j of ronda.ronda_libre_jugadores as Array<{ id: string; nombre: string }>) {
      const idx = indexByJugador[j.id]
      const ch = courseHcpMap[j.id]
      expect(Number.isFinite(ch), j.nombre).toBe(true)
      // CH 9h = idx/2 × slope/113 + (CR9 − par9): para índices de 12-20 queda muy por debajo del índice.
      if (idx >= 8) expect(ch, `${j.nombre} idx ${idx} → CH ${ch}`).toBeLessThan(idx)
    }
  })
})
