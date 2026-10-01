/**
 * El GWI reparte golpes con el COURSE HANDICAP, no con el índice crudo (01-oct-2026).
 * Data real de prod: ronda demo GATEB2BN (Los Leones, 9 hoyos desde el 10). Antes,
 * Tomás Demo (índice 12) recibía 12 golpes en 9 hoyos → neto -12 con un back 9 en par.
 * Discrimina: con el índice crudo el neto daría gross − índice; con el CH, gross − CH.
 */
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { courseHandicapsDeRonda } from '@/lib/data/ronda-libre'
import { fetchHoyosDeLaRonda } from '@/lib/data/course-holes'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { marcadorEnCursoGWI } from '@/golf/stats/gwi'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!url || !serviceKey)('GWI neto — data real (demo back 9 GATEB2BN)', () => {
  it('el neto descuenta el course handicap de 9h, no el índice', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const { data: ronda } = await admin
      .from('rondas_libres')
      .select('course_id, tees, holes, hoyo_inicio, recorridos, ronda_libre_jugadores(id, nombre, user_id, handicap, tees, scores)')
      .eq('codigo', 'GATEB2BN')
      .maybeSingle()
    expect(ronda, 'la demo GATEB2BN desapareció: el test no probaría nada').toBeTruthy()
    expect(ronda!.holes).toBe(9)

    const catalogo = await fetchHoyosDeLaRonda(admin, ronda!.course_id, ronda!.recorridos as string[] | null, 'numero, par, stroke_index')
    const deLaCancha = hoyosDeLaVuelta(catalogo as never, 9)
    const jugados = hoyosDeLaRonda(ronda!.hoyo_inicio, 9)
    const hoyos = deLaCancha.filter(h => jugados.includes(h.numero))
    const parDeLaCancha = deLaCancha.reduce((s, h) => s + h.par, 0)
    const { courseHcpMap, indexByJugador } = await courseHandicapsDeRonda(admin, ronda as never, parDeLaCancha)

    const jugadores = ronda!.ronda_libre_jugadores as Array<{ id: string; nombre: string; scores: Record<string, number> }>
    expect(jugadores.length).toBeGreaterThan(0)
    for (const j of jugadores) {
      const ch = courseHcpMap[j.id]
      const idx = indexByJugador[j.id]
      const m = marcadorEnCursoGWI({
        scores: j.scores, hoyos, siAlloc: normalizedStrokeIndexByHole(hoyos, 9, jugados), courseHcp: ch, totalHoyos: 9,
      })
      expect(m.hoyosCompletados, j.nombre).toBe(9)
      // Con 9 hoyos y CH < 9 cada golpe de ventaja cae en un hoyo distinto: neto = gross − CH.
      expect(ch, `${j.nombre}: CH ${ch} < índice ${idx}`).toBeLessThan(idx)
      if (ch <= 9) expect(m.overUnderNeto, j.nombre).toBe(m.overUnderGross - ch)
    }
  })
})
