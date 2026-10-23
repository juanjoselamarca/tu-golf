// Canario: ningún script trae una contraseña literal.
//
// Incidente 23-oct-2026: `src/scripts/seed-demo-data.ts` y `seed-test-players.ts`
// creaban cuentas con `password: 'demo-golfers-2026'` / `'test-golfers-2026'`. El repo
// es público y las 14 cuentas existían en prod con esa clave (`test-admin@golfers.plus`
// con rol admin): cualquiera podía entrar al panel de administración. Las claves se
// rotaron esa noche y los seeds pasaron a `claveSeed()` (variable de entorno o azar).
//
// Qué caza: `password: '<literal>'` o `password: "<literal>"` como valor completo
// (termina en `,` `}` o fin de línea). Una clave compuesta (`'smoke-' + Date.now()`),
// una variable (`password,`) o el nombre de una variable de entorno en mayúsculas
// (`TEST_E2E_USER_PASSWORD: '...'`) no cuentan.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const RAICES = ['scripts', 'src/scripts']
const CLAVE_LITERAL = /\bpassword\s*:\s*(['"`])(?:(?!\1).){4,}\1\s*(?:,|\}|$)/m

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : archivos(p)
    return /\.(ts|tsx|mjs|cjs|js)$/.test(f) && !/\.test\.(ts|tsx|mjs|cjs|js)$/.test(f) ? [p] : []
  })
}

export function clavesLiterales(raices: string[] = RAICES): string[] {
  const hallazgos: string[] = []
  for (const raiz of raices) {
    for (const archivo of archivos(raiz)) {
      const lineas = readFileSync(archivo, 'utf8').split('\n')
      lineas.forEach((linea, i) => {
        if (CLAVE_LITERAL.test(linea)) hallazgos.push(`${relative(process.cwd(), archivo).split(sep).join('/')}:${i + 1}`)
      })
    }
  }
  return hallazgos
}

describe('canario: scripts sin contraseñas literales', () => {
  it('ningún script de scripts/ ni src/scripts/ trae password: <literal>', () => {
    expect(clavesLiterales()).toEqual([])
  })

  it('el patrón distingue una clave literal de una compuesta o de una variable', () => {
    expect(CLAVE_LITERAL.test("  password: 'demo-golfers-2026',")).toBe(true)
    expect(CLAVE_LITERAL.test('  password: "test-golfers-2026" }')).toBe(true)
    expect(CLAVE_LITERAL.test("  password: 'smoke-test-' + Date.now(),")).toBe(false)
    expect(CLAVE_LITERAL.test('  password,')).toBe(false)
    expect(CLAVE_LITERAL.test('  password: claveSeed(),')).toBe(false)
    expect(CLAVE_LITERAL.test("  E2E_TEST_USER_PASSWORD: 'TEST_E2E_USER_PASSWORD',")).toBe(false)
  })
})
