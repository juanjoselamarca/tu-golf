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
 * Desde el 03-oct-2026 el plan pago también da acceso (beta O plan), y eso
 * vive DENTRO de `canUseCoach` (checkCoachAccess.ts, único archivo exceptuado):
 * ninguna pantalla del coach chequea el plan por su cuenta.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const COACH_DIR = path.resolve(__dirname, '../app/coach')
const API_DIRS = [path.resolve(__dirname, '../app/api/coach'), path.resolve(__dirname, '../app/api/taiger')]
/** La fuente única del acceso: el único lugar del coach donde se consulta el plan. */
const FUENTE_UNICA = path.join(COACH_DIR, 'lib', 'checkCoachAccess.ts')

function archivosTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return archivosTsx(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

/**
 * ¿Este código gatea el coach por plan? Caza el import de ProGate/UpsellPage
 * (comilla simple o doble, alias `@/` o ruta relativa) y cualquier chequeo de
 * plan con una feature `coach-*` (useEntitlement / canAccessServer / useProAccess),
 * además de cualquier lectura directa del plan (checkFeatureAccess / canAccess /
 * getSubscription / subscription_tier). Escanea las pantallas del coach Y sus
 * endpoints (src/app/api/coach, src/app/api/taiger).
 */
const GATE_DE_PLAN =
  /billing\/(ProGate|UpsellPage)['"]|(useEntitlement|canAccessServer|useProAccess)\(\s*['"]coach-|(checkFeatureAccess|canAccess|getSubscription)\(|subscription_tier/

describe('Coach: el acceso vive en canUseCoach, no en ProGate', () => {
  const archivos = [COACH_DIR, ...API_DIRS].flatMap(archivosTsx)

  it('escanea las pantallas del coach (guard de cardinalidad)', () => {
    expect(archivos.some((f) => f.endsWith(path.join('progreso', 'page.tsx')))).toBe(true)
    expect(archivos.length).toBeGreaterThan(5)
    expect(archivos.some((f) => f.endsWith(path.join('taiger', 'chat', 'route.ts')))).toBe(true)
    expect(archivos.some((f) => f.endsWith(path.join('coach', 'progress', 'route.ts')))).toBe(true)
  })

  it('ni el coach ni sus endpoints consultan el plan fuera de canUseCoach', () => {
    const culpables = archivos
      .filter((f) => f !== FUENTE_UNICA)
      .filter((f) => GATE_DE_PLAN.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(path.resolve(__dirname, '..'), f))
    expect(culpables, `Gate de plan en el coach: ${culpables.join(', ')}. La regla de acceso vive en canUseCoach.`).toEqual([])
  })

  it('el detector discrimina las variantes (no sólo comilla simple + alias)', () => {
    expect(GATE_DE_PLAN.test(`import { ProGate } from '@/components/billing/ProGate'`)).toBe(true)
    expect(GATE_DE_PLAN.test(`import { ProGate } from "@/components/billing/ProGate"`)).toBe(true)
    expect(GATE_DE_PLAN.test(`import { UpsellPage } from '../../../components/billing/UpsellPage'`)).toBe(true)
    expect(GATE_DE_PLAN.test(`const { allowed } = useEntitlement('coach-plan')`)).toBe(true)
    expect(GATE_DE_PLAN.test(`await canAccessServer("coach-plan", supabase, id)`)).toBe(true)
    expect(GATE_DE_PLAN.test(`import { UpsellCardSkeleton } from '@/components/billing/UpsellCardSkeleton'`)).toBe(false)
    expect(GATE_DE_PLAN.test(`const r = await checkFeatureAccess(supabase, user.id, 'coach-plan')`)).toBe(true)
    expect(GATE_DE_PLAN.test(`if (canAccess(ctx, 'coach-plan', true))`)).toBe(true)
    expect(GATE_DE_PLAN.test(`const sub = await getSubscription(supabase, id)`)).toBe(true)
    expect(GATE_DE_PLAN.test(`.select('subscription_tier')`)).toBe(true)
    expect(GATE_DE_PLAN.test(`useEntitlement('leaderboard-live')`)).toBe(false)
  })

  it('la fuente única consulta el plan con la feature canónica coach-plan', () => {
    expect(fs.readFileSync(FUENTE_UNICA, 'utf8')).toMatch(/canAccessServer\('coach-plan'/)
  })

  it('el layout de /coach/progreso autoriza server-side con checkCoachAccess', () => {
    const layout = fs.readFileSync(path.join(COACH_DIR, 'progreso', 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/await checkCoachAccess\(\)/)
  })
})
