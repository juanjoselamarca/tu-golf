import { describe, it, expect } from 'vitest'
import { PLAYER_STATUSES } from '@/golf/tournament-status'
import { migrationFiles, readMigration, stripSqlComments } from './helpers/migration-sql'

/**
 * `PLAYER_STATUSES` contra el CHECK `players_status_check` de las migraciones.
 *
 * Antes este canario comparaba el literal de TypeScript contra el mismo literal escrito a mano en
 * el test: dos copias iguales no prueban nada sobre la base. Lo que importa es que un estado que
 * una migración agregue al CHECK aparezca en la constante, porque de ella salen las dos listas que
 * deciden quién entra al leaderboard, a los grupos y al scoring. Si el CHECK crece y la constante
 * no, el estado nuevo no queda en ningún bando y el canario de partición
 * (`src/golf/tournament-status.test.ts`) también se pone rojo.
 *
 * Se lee la ÚLTIMA migración que define la constraint (orden cronológico por nombre de archivo),
 * que es la que vale en prod: el baseline la crea y una migración posterior podría redefinirla con
 * DROP + ADD.
 */

/** `status = ANY (ARRAY['pending'::text, …])` → los valores entre comillas. */
function valoresDelCheck(sql: string): string[] | null {
  const limpio = stripSqlComments(sql).replace(/\s+/g, ' ')
  const constraint = [
    ...limpio.matchAll(/constraint\s+"?players_status_check"?\s+check\s*\(([\s\S]*?)\)\s*;/gi),
  ].at(-1)
  if (!constraint) return null
  const array = /array\s*\[([^\]]+)\]/i.exec(constraint[1])
  if (!array) return null
  return [...array[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('players_status_check', () => {
  it('PLAYER_STATUSES es exactamente el CHECK que declaran las migraciones', () => {
    const definiciones = migrationFiles()
      .sort()
      .map((f) => ({ f, valores: valoresDelCheck(readMigration(f)) }))
      .filter((d): d is { f: string; valores: string[] } => d.valores != null)

    // Sin la constraint en ninguna migración el canario no puede opinar: eso es un fallo del
    // canario, no una licencia para pasar en verde (ver `reference_tests_prod_pasan_en_vacio`).
    expect(definiciones.length, 'ninguna migración define players_status_check').toBeGreaterThan(0)

    const { f, valores } = definiciones[definiciones.length - 1]
    expect([...valores].sort(), `CHECK de ${f}`).toEqual([...PLAYER_STATUSES].sort())
  })
})
