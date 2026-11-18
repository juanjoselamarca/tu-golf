/**
 * Canario (Fable #829): "quién aparece en la tabla" vive en JUGADOR_EN_TABLA_STATUSES (src/golf/tournament-status).
 * leaderboard.ts, scoring.ts (Resumen) y tvBoard.ts repetían el literal; si uno cambiaba, las pantallas mostraban
 * jugadores distintos. Y la tabla es el complemento de JUGADOR_FUERA_STATUSES dentro de players_status_check.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { INSCRITO_APROBADO_STATUS, JUGADOR_EN_TABLA_STATUSES, JUGADOR_FUERA_STATUSES } from '@/golf/tournament-status'

const leer = (...p: string[]) => readFileSync(path.resolve(process.cwd(), ...p), 'utf8')
const ARCHIVOS = ['leaderboard.ts', 'scoring.ts', 'tvBoard.ts'].map((f) => ['src', 'lib', 'data', 'tournaments', f])

describe('canario: quién aparece en la tabla = JUGADOR_EN_TABLA_STATUSES', () => {
  it.each(ARCHIVOS)('%s/%s/%s/%s/%s importa la lista y no repite el literal', (...p) => {
    const src = leer(...p)
    expect(src).toContain("in('status', JUGADOR_EN_TABLA_STATUSES)")
    expect(src).not.toMatch(/\[\s*'pending'\s*,\s*'approved'\s*,\s*'waitlist'\s*\]/)
  })

  it('tabla ∪ fuera = los estados de players_status_check, sin cruce; quien recibe tarjeta está en la tabla', () => {
    const m = /players_status_check" CHECK \(\(status = ANY \(ARRAY\[([^\]]*)\]/.exec(leer('supabase', 'schema.sql'))
    expect(m).not.toBeNull()
    const todos = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()
    expect([...JUGADOR_EN_TABLA_STATUSES, ...JUGADOR_FUERA_STATUSES].sort()).toEqual(todos)
    expect(JUGADOR_EN_TABLA_STATUSES).toContain(INSCRITO_APROBADO_STATUS)
  })
})
