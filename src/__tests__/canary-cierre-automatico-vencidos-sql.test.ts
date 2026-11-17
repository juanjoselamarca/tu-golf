/**
 * Canario: la migración que excluye del cierre automático los torneos ya vencidos usa el MISMO día de cierre que
 * la app (`diaDeCierreDelTorneo`: fin + GRACE_DIAS_TORNEO + 1). Si cambia la gracia en TypeScript y no en el SQL,
 * la exclusión dejaría fuera (o dentro) torneos que la app muestra distinto. PR2 repite el UPDATE: también entra acá.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GRACE_DIAS_TORNEO } from '@/golf/tournament-live-status'

const DIR = path.resolve(process.cwd(), 'supabase', 'migrations')
const EXCLUSION = /set\s+cierre_automatico\s*=\s*false[\s\S]*?;/gi

describe('canario: exclusión de vencidos del cierre automático = día de cierre de la app', () => {
  const updates = readdirSync(DIR).filter(f => f.endsWith('.sql')).flatMap(f =>
    [...readFileSync(path.join(DIR, f), 'utf8').replace(/--.*$/gm, '').matchAll(EXCLUSION)].map(m => ({ f, sql: m[0] })))

  it('existe al menos un UPDATE de exclusión (el canario mira algo)', () => {
    expect(updates.length).toBeGreaterThan(0)
  })

  it.each(updates.map(u => [u.f, u.sql]))('%s: hoy Chile >= fin + (GRACE + 1)', (_, sql) => {
    const m = /\(now\(\)\s+at\s+time\s+zone\s+'America\/Santiago'\)::date\s*>=\s*greatest\(date_start,\s*coalesce\(date_end,\s*date_start\)\)\s*\+\s*(\d+)/i.exec(sql)
    expect(m, sql).not.toBeNull()
    expect(Number(m![1])).toBe(GRACE_DIAS_TORNEO + 1)
  })
})
