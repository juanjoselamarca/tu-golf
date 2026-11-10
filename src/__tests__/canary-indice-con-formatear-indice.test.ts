/**
 * CANARIO — un índice de hándicap se muestra con `formatearIndice` (src/golf/handicap-index-range.ts).
 *
 * El índice plus se guarda negativo: `x.indice.toFixed(1)` lo muestra como "-1.0" en vez de "+1.0" (la
 * notación del golf). PR #765 los pasó todos a `formatearIndice`; si vuelve a aparecer un
 * `<índice>.toFixed(1)` en src/app o src/components, este test se cae.
 *
 * Mira el identificador justo antes del `.toFixed(1)` (o dentro de `Number(...)`), así que deja pasar
 * deltas y diferencias (`Math.abs(a.indice - b.indice).toFixed(1)`, `indiceDelta`), que no son índices.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '..')
const RAICES = ['app', 'components']

// /demo/taiger: maqueta con constantes positivas fijas (sin datos de usuario) en un archivo de 959 LOC
// pendiente de orden; no muestra índices reales.
const PERMITIDOS = new Set(['app/demo/taiger/page.tsx'])

const ID = '(?:indice|indice_golfers|indiceGolfers|ultimoIndice|handicap_index|indiceWHS)'
const PATRON_INDICE_TOFIXED = new RegExp(`(?:\\b${ID}\\??|Number\\([\\w.?]*\\b${ID}\\))\\.toFixed\\(1\\)`)

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : archivos(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

describe('índice: siempre con formatearIndice', () => {
  it('el patrón caza los casos reales y deja pasar deltas', () => {
    for (const s of [
      'profile.indice.toFixed(1)', 'u.indice_golfers.toFixed(1)', 'data.indiceGolfers.toFixed(1)',
      'status.ultimoIndice.toFixed(1)', 'body?.indice?.toFixed(1)', 'Number(profile.indice).toFixed(1)',
    ]) expect(s).toMatch(PATRON_INDICE_TOFIXED)
    for (const s of [
      'Math.abs(profile.indice - profile.indice_golfers).toFixed(1)', '(-indiceDelta).toFixed(1)', 'r.diferencial.toFixed(1)',
    ]) expect(s).not.toMatch(PATRON_INDICE_TOFIXED)
  })

  it('ningún archivo de src/app ni src/components formatea un índice con toFixed(1)', () => {
    const hallazgos: string[] = []
    for (const raiz of RAICES) {
      for (const abs of archivos(path.join(SRC, raiz))) {
        const rel = path.relative(SRC, abs).split(path.sep).join('/')
        if (PERMITIDOS.has(rel)) continue
        fs.readFileSync(abs, 'utf8').split('\n').forEach((linea, i) => {
          if (PATRON_INDICE_TOFIXED.test(linea)) hallazgos.push(`${rel}:${i + 1}: ${linea.trim()}`)
        })
      }
    }
    expect(hallazgos).toEqual([])
  })
})
