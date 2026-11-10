/**
 * CANARIO — un índice de hándicap se muestra con `formatearIndice` (src/golf/handicap-index-range.ts).
 *
 * El índice plus se guarda negativo: `x.toFixed(1)` lo muestra como "-1.0" en vez de "+1.0" (la notación
 * del golf). PR #765 los pasó todos a `formatearIndice`. Este test marca cualquier `.toFixed(1)` cuyo
 * receptor (el identificador, o la llamada/paréntesis entero, justo antes) nombre un índice o un hándicap
 * (`/indice|index|idx|hcp|handicap/i`) en src/app, src/components, src/lib y src/golf. Las excepciones
 * legítimas (deltas, cuentas, comparaciones) van en PERMITIDOS con archivo + fragmento y su porqué.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '..')
const RAICES = ['app', 'components', 'lib', 'golf']
const NOMBRE_INDICE = /(indice|index|idx|hcp|handicap)/i
const TOFIXED = '.toFixed(1)'

/** Archivo (relativo a src/) + fragmento de la línea. Sin número de línea: se corre. */
const PERMITIDOS: Array<{ archivo: string; fragmento: string; porque: string }> = [
  { archivo: 'components/GWIDisplay.tsx', fragmento: 'vsIndex.toFixed(1)', porque: 'delta con signo explícito (golpes vs esperado), no un índice' },
  { archivo: 'app/perfil/components/EditorialBlocks.tsx', fragmento: 'Math.abs(profile.indice - profile.indice_golfers).toFixed(1)', porque: 'distancia entre dos índices, siempre positiva' },
  { archivo: 'lib/fedegolf/tarjetas.ts', fragmento: 'indiceDerivado.toFixed(1) === oficialDelMismoInstante.toFixed(1)', porque: 'compara dos números a la décima; no se muestra' },
  { archivo: 'lib/fedegolf/tarjetas.ts', fragmento: "valor: indice.toFixed(1)", porque: 'paso de la cuenta (suma → promedio → truncado): va con el signo aritmético de los pasos anteriores' },
  { archivo: 'app/demo/taiger/page.tsx', fragmento: 'PLAYER.indiceGolfers.toFixed(1)', porque: 'maqueta con constantes positivas fijas, sin datos de usuario' },
  { archivo: 'app/demo/taiger/page.tsx', fragmento: 'PLAYER.indiceWHS.toFixed(1)', porque: 'maqueta con constantes positivas fijas, sin datos de usuario' },
  { archivo: 'app/demo/taiger/page.tsx', fragmento: '(-indiceDelta).toFixed(1)', porque: 'delta de la maqueta, con su signo escrito a mano' },
]

/** Receptores de cada `.toFixed(1)` de la línea: identificador encadenado o expresión entre paréntesis/llamada. */
function receptores(linea: string): string[] {
  const out: string[] = []
  for (let i = linea.indexOf(TOFIXED); i !== -1; i = linea.indexOf(TOFIXED, i + 1)) {
    let j = i
    let prof = 0
    while (j > 0) {
      const c = linea[j - 1]
      if (c === ')' || c === ']') { prof++; j--; continue }
      if (c === '(' || c === '[') { if (prof === 0) break; prof--; j--; continue }
      if (prof > 0 || /[\w$.?!]/.test(c)) { j--; continue }
      break
    }
    out.push(linea.slice(j, i))
  }
  return out
}

const marca = (linea: string) => receptores(linea).some(r => NOMBRE_INDICE.test(r))

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : archivos(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : []
  })
}

describe('índice: siempre con formatearIndice', () => {
  it('marca los receptores que fueron fallos reales y deja pasar los que no son índices', () => {
    for (const s of [
      '{idx_ != null ? idx_.toFixed(1) : \'—\'}', // ranking
      'return handicap.toFixed(1)', // hoja de salida + WhatsApp
      'currentHandicap != null ? currentHandicap.toFixed(1) : \'—\'', // coach / progreso
      'const meta = targetHandicap.toFixed(1)',
      '`Tu índice ahora: ${index.toFixed(1)}`', // historial
      '`Tu índice ahora: ${res.index.toFixed(1)}`',
      '{hcp != null ? hcp.toFixed(1) : \'—\'}', // tees del organizador
      '{r.hcp.toFixed(1)}', // simulación
      'profile.indice.toFixed(1)', 'u.indice_golfers.toFixed(1)', 'data.indiceGolfers.toFixed(1)',
      'status.ultimoIndice.toFixed(1)', 'body?.indice?.toFixed(1)', 'Number(profile.indice).toFixed(1)',
    ]) expect(marca(s), s).toBe(true)
    for (const s of ['r.diferencial.toFixed(1)', 'delta.toFixed(1)', 'suma.toFixed(1)', 'promedioCrudo.toFixed(2)']) {
      expect(marca(s), s).toBe(false)
    }
  })

  it('ningún archivo formatea un índice con toFixed(1) fuera de las excepciones', () => {
    const hallazgos: string[] = []
    const usados = new Set<number>()
    let barridos = 0
    for (const raiz of RAICES) {
      for (const abs of archivos(path.join(SRC, raiz))) {
        barridos++
        const rel = path.relative(SRC, abs).split(path.sep).join('/')
        fs.readFileSync(abs, 'utf8').split('\n').forEach((linea, i) => {
          if (!marca(linea)) return
          const k = PERMITIDOS.findIndex(p => p.archivo === rel && linea.includes(p.fragmento))
          if (k === -1) hallazgos.push(`${rel}:${i + 1}: ${linea.trim()}`)
          else usados.add(k)
        })
      }
    }
    // Guard: un barrido que no lee nada pasaría en vacío.
    expect(barridos).toBeGreaterThan(800)
    expect(hallazgos).toEqual([])
    // Una excepción que ya no calza con nada se borra (si no, tapa al siguiente que escriba esa línea).
    expect(PERMITIDOS.filter((_, k) => !usados.has(k)).map(p => `${p.archivo}: ${p.fragmento}`)).toEqual([])
  })
})
