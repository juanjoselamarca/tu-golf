/**
 * CANARIO — las superficies del CPI leen las mismas rondas (#545, revisión 1).
 *
 * /perfil, /api/cpi, /coach y el caché que escribe import-confirm mostraban CPI
 * distintos: dos no excluían las tarjetas FedeGolf, ninguna excluía las rondas
 * que el usuario sacó del índice y cada una leía una ventana distinta. La fuente
 * única es `fetchRondasCPI` (src/lib/data/perfil.ts); si alguien vuelve a armar
 * su propia lectura de `historical_rounds` para el CPI, este test se cae.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '..')
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8')

const SUPERFICIES = [
  'app/api/cpi/route.ts',
  'app/coach/page.tsx',
  'app/api/import/confirm/route.ts',
  'lib/data/perfil.ts',
]

describe('CPI: una sola lectura de rondas', () => {
  for (const rel of SUPERFICIES) {
    it(`${rel} obtiene las rondas del CPI con fetchRondasCPI`, () => {
      const src = leer(rel)
      expect(src).toMatch(/fetchRondasCPI\(supabase, (user\.id|userId)\)/)
      // calcularCPI sólo recibe las rondas de la fuente única.
      for (const m of src.matchAll(/calcularCPI\(([^)]*)\)/g)) expect(m[1].trim()).toMatch(/^rondas(CPI)?$/)
      // El mínimo de rondas lo decide calcularCPI (MIN_RONDAS), no cada superficie.
      expect(src).not.toMatch(/rondas(CPI)?\.length/)
    })
  }
})
