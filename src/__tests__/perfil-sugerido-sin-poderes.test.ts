/**
 * `ronda_libre_jugadores.perfil_sugerido_id` es SOLO una referencia: el perfil que el creador eligió
 * para un rival. No puede dar ninguno de los poderes que da `user_id` (anotar la ronda, avisos push,
 * índice desde el perfil, historial, calcular_indice_golfers). #581 dejó el user_id de los rivales en
 * null justamente porque el creador podía meter la ronda en la cuenta de cualquier usuario.
 *
 * Este test congela que en el schema la columna vive solo en su migración, sin policy, función ni
 * grant que la lea. Si una migración futura la necesita, se edita esta lista a conciencia (y pasa por
 * revisión de zona crítica).
 */
import { describe, expect, it } from 'vitest'
import { BASELINE, functionDefinition, migrationFiles, readMigration, stripSqlComments } from '@/__tests__/helpers/migration-sql'

const COLUMNA = 'perfil_sugerido_id'
const MIGRACION = '20261026120000_ronda_libre_jugadores_perfil_sugerido.sql'

describe('perfil_sugerido_id no da poderes', () => {
  it('solo su propia migración la menciona (ninguna policy, función ni grant la lee)', () => {
    const mencionan = migrationFiles().filter(f => stripSqlComments(readMigration(f)).includes(COLUMNA))
    expect(mencionan).toEqual([MIGRACION])
  })

  it('su migración solo agrega la columna (privada para la sesión), el comentario y el índice', () => {
    const sql = stripSqlComments(readMigration(MIGRACION))
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS perfil_sugerido_id uuid NULL\s+REFERENCES public\.profiles\(id\) ON DELETE SET NULL/)
    expect(sql).toMatch(/REVOKE SELECT \(perfil_sugerido_id\) ON public\.ronda_libre_jugadores FROM PUBLIC, anon, authenticated;/)
    expect(sql).not.toMatch(/\b(GRANT|POLICY|FUNCTION|TRIGGER|UPDATE|DELETE FROM|INSERT INTO)\b/i)
  })

  it('los lectores de permisos e índice siguen mirando user_id', () => {
    // Si alguno de estos se redefine en una migración posterior, la primera prueba ya lo vigila;
    // esto fija además que hoy dependen de user_id (el poder que el rival NO recibe).
    const baseline = readMigration(BASELINE)
    for (const fn of ['puede_anotar_ronda', 'calcular_indice_golfers']) {
      const def = functionDefinition(baseline, fn)
      expect(def, fn).toBeDefined()
      expect(def).toMatch(/user_id/)
      expect(def).not.toContain(COLUMNA)
    }
  })
})
