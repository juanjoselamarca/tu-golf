/**
 * TEST CANARIO — ninguna pantalla del coach decide el acceso con ProGate.
 *
 * El acceso al coach tiene UNA regla: `canUseCoach` (src/app/coach/lib/
 * checkCoachAccess.ts), aplicada server-side en /coach, en el layout de cada
 * sub-ruta (`checkCoachAccess()`) y en los endpoints. Hasta el 02-oct-2026
 * /coach/progreso además envolvía todo en `<ProGate feature="coach-tracking">`
 * (regla de plan, cliente): la beta con plan free pasaba el layout y veía el
 * upsell. Dos reglas para el mismo concepto = una pantalla que miente.
 *
 * Si al lanzar se exige plan para el coach, el cambio va en `canUseCoach`,
 * no en un ProGate por pantalla.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const COACH_DIR = path.resolve(__dirname, '../app/coach')

function archivosTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return archivosTsx(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('Coach: el acceso vive en canUseCoach, no en ProGate', () => {
  const archivos = archivosTsx(COACH_DIR)

  it('escanea las pantallas del coach (guard de cardinalidad)', () => {
    expect(archivos.some((f) => f.endsWith(path.join('progreso', 'page.tsx')))).toBe(true)
    expect(archivos.length).toBeGreaterThan(5)
  })

  it('ningún archivo bajo src/app/coach importa ProGate ni UpsellPage', () => {
    const culpables = archivos
      .filter((f) => /from '@\/components\/billing\/(ProGate|UpsellPage)'/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(COACH_DIR, f))
    expect(culpables, `Gate de plan en el coach: ${culpables.join(', ')}. La regla de acceso vive en canUseCoach.`).toEqual([])
  })

  it('el layout de /coach/progreso autoriza server-side con checkCoachAccess', () => {
    const layout = fs.readFileSync(path.join(COACH_DIR, 'progreso', 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/await checkCoachAccess\(\)/)
  })
})
