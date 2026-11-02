import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// El atajo del pre-push (árbol ya verificado) salta tsc, tests, build y schema, pero NO el bloqueo de migraciones
// tocadas: depende de origin/main, que cambia después de npm run verify.
describe('verify.mjs: el atajo del árbol verificado', () => {
  const verify = readFileSync('scripts/verify.mjs', 'utf8')
  const schema = readFileSync('scripts/verify-db-schema.mjs', 'utf8')

  it('corre el guard de migraciones antes de saltarse los checks', () => {
    const guard = verify.indexOf('run(\'migraciones\', `${SCHEMA} --solo-migraciones`)')
    const salto = verify.indexOf('skipping the checks')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(salto)
    expect(verify).toContain("const SCHEMA = 'node scripts/verify-db-schema.mjs'")
  })

  it('--solo-migraciones sale recién después del bloqueo de revisarMigracionesTocadas', () => {
    const bloqueo = schema.indexOf('if (tocadas.bloquea)')
    const sale = schema.indexOf("if (process.argv.includes('--solo-migraciones')) process.exit(0)")
    expect(bloqueo).toBeGreaterThan(-1)
    expect(sale).toBeGreaterThan(bloqueo)
    expect(sale).toBeLessThan(schema.indexOf('const files = walk(SRC_ROOT)'))
  })
})
