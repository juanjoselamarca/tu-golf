/**
 * Canario: la RPC `calcular_indice_golfers` (la que guarda el índice) usa la misma tabla WHS 5.2a que
 * `calcularIndiceGolfersLocal` (la que lo muestra y la que usa el backfill del tope).
 *
 * Lee la última migración que define la función y evalúa sus CASE de `v_usar` y `v_ajuste` para 3 a 20
 * diferenciales. Falla si alguno difiere de `TABLA_WHS_5_2` o si vuelve el factor 0.96.
 */
import { describe, it, expect } from 'vitest'
import { migrationFiles, readMigration, stripSqlComments } from './helpers/migration-sql'
import { filaTablaWHS } from '@/golf/core/indice-whs'

const ultima = migrationFiles()
  .sort()
  .filter(f => /create\s+or\s+replace\s+function\s+(?:public\.)?calcular_indice_golfers\b/i.test(stripSqlComments(readMigration(f))))
  .at(-1)!
const sql = stripSqlComments(readMigration(ultima))

function evaluarCase(variable: string, n: number): number {
  const bloque = sql.match(new RegExp(String.raw`${variable}\s*:=\s*case([\s\S]*?)\bend\s*;`, 'i'))
  if (!bloque) throw new Error(`${ultima}: no encuentro "${variable} := CASE"`)
  for (const [, op, limite, valor] of bloque[1].matchAll(/when\s+v_count\s*(<=|=)\s*(\d+)\s+then\s+(-?[\d.]+)/gi)) {
    if (op === '<=' ? n <= Number(limite) : n === Number(limite)) return Number(valor)
  }
  const sino = bloque[1].match(/else\s+(-?[\d.]+)/i)
  if (!sino) throw new Error(`${ultima}: "${variable}" sin ELSE`)
  return Number(sino[1])
}

describe(`calcular_indice_golfers (${ultima})`, () => {
  it.each(Array.from({ length: 18 }, (_, i) => i + 3))('con %i diferenciales usa la fila de TABLA_WHS_5_2', n => {
    const fila = filaTablaWHS(n)!
    expect(evaluarCase('v_usar', n)).toBe(fila.usar)
    expect(evaluarCase('v_ajuste', n)).toBe(fila.ajuste)
  })

  it('sin el factor 0.96 y con un solo redondeo', () => {
    expect(sql).not.toMatch(/0\.96/)
    expect(sql).not.toMatch(/v_promedio\s+(?:decimal|numeric)\s*\(/i)
    expect(sql).toMatch(/v_indice\s*:=\s*round\(\s*v_promedio\s*\+\s*v_ajuste\s*,\s*1\s*\)/i)
  })
})
