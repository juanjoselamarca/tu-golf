/**
 * CANARIO — /perfil/stats y Mi Golf no cuentan rondas por su cuenta (ola 1, 16-nov-2026).
 *
 * /perfil/stats contaba eagles con par 4 inventado (countByResult + parPerHoleArray
 * con fallback) y elegía la mejor ronda sin mirar el formato (bestRoundByVsPar):
 * un scramble de 62 salía como mejor ronda y el historial decía otra cosa. La fuente
 * única es src/golf/stats/rondas-normalizadas.ts (normalizarRondas + agregarRondas);
 * si alguien vuelve a importar los helpers sueltos en estas superficies, este test se cae.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '..')
const SUPERFICIES = ['app/perfil/stats', 'components/mi-golf']
const PROHIBIDOS = /\b(countByResult|bestRoundByVsPar|parPerHoleArray)\b/

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return archivos(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('stats: una sola fuente de agregados', () => {
  for (const rel of SUPERFICIES) {
    it(`${rel}/** no importa countByResult, bestRoundByVsPar ni parPerHoleArray`, () => {
      const lista = archivos(path.join(SRC, rel))
      expect(lista.length).toBeGreaterThan(0) // el canario no pasa en vacío
      const culpables = lista.filter(f => PROHIBIDOS.test(fs.readFileSync(f, 'utf8')))
      expect(culpables.map(f => path.relative(SRC, f))).toEqual([])
    })
  }

  it('/perfil/stats lee la misma fuente que /perfil/historial', () => {
    const page = fs.readFileSync(path.join(SRC, 'app/perfil/stats/page.tsx'), 'utf8')
    expect(page).toMatch(/fetchRondasNormalizadas\(supabase, user\.id\)/)
    const hook = fs.readFileSync(path.join(SRC, 'app/perfil/stats/hooks/useStatsDerived.ts'), 'utf8')
    expect(hook).toMatch(/agregarRondas\(/)
  })
})
