/**
 * Canario: `asegurar_tarjeta_vigente` (SQL) repite dos listas que en TypeScript tienen fuente única, porque el SQL no
 * puede importarlas:
 *   - tarjeta cerrada = CLOSED_ROUND_STATUSES (src/golf/tournament-rounds.ts): decide si la ronda vigente sigue en juego.
 *   - torneo finalizado = FINALIZADO_STATUSES (src/golf/tournament-live-status.ts): no se crean tarjetas.
 *   - "en juego" = tarjeta abierta de un jugador INSCRITO_APROBADO_STATUS (= contarTarjetasEnJuego de
 *     src/lib/data/tournaments/siguiente-ronda.ts): la tarjeta abierta de un WD/DQ no deja la ronda en juego.
 * Revisión del PR #828: la primera versión cortaba solo con 'closed' y dejaba crear tarjetas en un torneo 'published'.
 * Mira la ÚLTIMA migración que define la función y la copia de `supabase/schema.sql` (las dos tienen que decir lo mismo).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLOSED_ROUND_STATUSES } from '@/golf/tournament-rounds'
import { FINALIZADO_STATUSES } from '@/golf/tournament-live-status'
import { INSCRITO_APROBADO_STATUS } from '@/golf/tournament-status'

const leer = (...p: string[]) => readFileSync(path.resolve(process.cwd(), ...p), 'utf8').replace(/\r/g, '')
const funcion = (sql: string) => {
  const ini = sql.indexOf('CREATE OR REPLACE FUNCTION public.asegurar_tarjeta_vigente')
  expect(ini, 'no encontré asegurar_tarjeta_vigente').toBeGreaterThanOrEqual(0)
  return sql.slice(ini, sql.indexOf('$function$;', ini)).replace(/--.*$/gm, '')
}
const lista = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()

const fuentes = [
  ['migración', funcion(leer('supabase', 'migrations', '20261119100000_tarjeta_vigente_solo_aprobados.sql'))],
  ['schema.sql', funcion(leer('supabase', 'schema.sql'))],
] as const

describe('canario: estados de asegurar_tarjeta_vigente = fuentes únicas de TypeScript', () => {
  it.each(fuentes)('%s: tarjeta cerrada = CLOSED_ROUND_STATUSES', (_, sql) => {
    const m = /status\s+NOT\s+IN\s*\(([^)]*)\)/i.exec(sql)
    expect(m, sql).not.toBeNull()
    expect(lista(m![1])).toEqual([...CLOSED_ROUND_STATUSES].sort())
  })

  it.each(fuentes)('%s: torneo finalizado = FINALIZADO_STATUSES', (_, sql) => {
    const m = /v_tstatus\s+IN\s*\(([^)]*)\)/i.exec(sql)
    expect(m, sql).not.toBeNull()
    expect(lista(m![1])).toEqual([...FINALIZADO_STATUSES].sort())
  })

  it.each(fuentes)('%s: entre rondas solo corta si queda una ronda siguiente (v_vigente < total_rounds)', (_, sql) => {
    expect(sql).toMatch(/coalesce\(total_rounds,\s*1\)/i)
    expect(sql).toMatch(/IF\s+v_vigente\s*<\s*v_total\b/i)
  })

  it.each(fuentes)('%s: "en juego" cuenta solo tarjetas de jugadores aprobados', (_, sql) => {
    expect(sql).toMatch(/JOIN\s+players\s+pl\s+ON\s+pl\.id\s*=\s*r\.player_id/i)
    const m = /pl\.status\s*=\s*'([^']+)'/i.exec(sql)
    expect(m, sql).not.toBeNull()
    expect(m![1]).toBe(INSCRITO_APROBADO_STATUS)
  })
})
