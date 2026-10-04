/**
 * Las claves privadas del GWI tienen UNA fuente (`gwi-claves-privadas.json`).
 * Antes el smoke HTTP y el E2E de prod tenían su propia regex, desalineada de la
 * de los tests (les faltaban courseAvg, peso, valor y confianza). Este canario
 * exige que los tres consumidores lean la lista canónica y que la lista cubra
 * todos los campos privados de `JugadorGWIInput` y del breakdown interno.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import claves from '@/golf/stats/gwi-claves-privadas.json'
import { CLAVES_PRIVADAS } from './fake-supabase'

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf-8')

describe('claves privadas del GWI — fuente única', () => {
  it.each(['e2e/http-smoke.ts', 'scripts/test-e2e-prod.mjs', 'src/__tests__/gwi-server/fake-supabase.ts'])(
    '%s lee la lista canónica y no tiene una regex propia',
    (ruta) => {
      const fuente = leer(ruta)
      expect(fuente).toMatch(/gwi-claves-privadas\.json/)
      // Una alternancia literal de claves privadas (`historicalAvg|…`) = lista duplicada.
      expect(fuente).not.toMatch(/(historicalAvg|patterns|"inputs")\|/)
    },
  )

  it('la regex de los tests es exactamente la lista canónica', () => {
    expect(CLAVES_PRIVADAS.source).toBe(claves.claves.join('|'))
  })

  it('las entradas son texto literal (sin metacaracteres de regex)', () => {
    for (const c of claves.claves) expect(c).not.toMatch(/[\^$.*+?()[\]{}|/]/)
  })

  it('cubre los campos privados de JugadorGWIInput y los números del breakdown interno', () => {
    const fuente = leer('src/golf/stats/gwi.ts')
    const input = fuente.slice(fuente.indexOf('export interface JugadorGWIInput'), fuente.indexOf('export function redactarGWIParaPublico'))
    for (const campo of ['currentScore', 'historicalAvg', 'historicalRoundsCount', 'courseAvg', 'courseRoundsCount', 'patterns', 'back9Collapse', 'postBogeySpiral']) {
      expect(input).toContain(campo)
      expect(claves.claves).toContain(campo)
    }
    for (const numero of ['"peso"', '"valor"', '"confianza"', 'narrativaSinPatron']) expect(claves.claves).toContain(numero)
  })
})
