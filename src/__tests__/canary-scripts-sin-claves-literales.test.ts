// Canario: ningún script trae una contraseña literal.
//
// Incidente 23-oct-2026: `src/scripts/seed-demo-data.ts` y `seed-test-players.ts`
// creaban cuentas con `password: 'demo-golfers-2026'` / `'test-golfers-2026'`. El repo
// es público y las 14 cuentas existían en prod con esa clave (`test-admin@golfers.plus`
// con rol admin): cualquiera podía entrar al panel de administración. Las claves se
// rotaron esa noche y los seeds pasaron a `claveSeed()` (variable de entorno o azar).
// `scripts/seed-coach-visual-test.mjs` tenía `const PASSWORD = 'VisualTest123!'`.
//
// Qué caza, en cualquier archivo de `scripts/` y `src/scripts/` (ts, js, mjs, cjs, json,
// sql, sh, ps1, py):
//   - clave de objeto:  password: '<literal>'   "password": "<literal>"   userPassword: '…'
//   - asignación:       const PASSWORD = '<literal>'   $password = "<literal>"   PGPASSWORD=literal
//   - fallback:         process.env.X || '<literal>'  /  ?? '<literal>'  (en una línea que habla de password)
//   - sql:              PASSWORD '<literal>'   crypt('<literal>', …)
// No cuentan: una clave compuesta (`'smoke-' + Date.now()`), un template literal con
// interpolación (`` `Seed-${x}` ``), una variable (`password,`, `password: PASSWORD`) ni un
// valor que es el NOMBRE de una variable de entorno (`'TEST_E2E_USER_PASSWORD'`).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const RAICES = ['scripts', 'src/scripts']
const EXTENSIONES = /\.(ts|tsx|mjs|cjs|js|json|sql|sh|ps1|py)$/
const ES_TEST = /\.test\.(ts|tsx|mjs|cjs|js)$/

const NOMBRE = String.raw`[A-Za-z_$]*(?:[Pp]assword|PASSWORD)`
// Grupo 1: comilla de apertura · grupo 2: el valor. El valor ya queda delimitado por las
// comillas; lo que sigue solo descarta una clave compuesta (`'x' + …`, `'x'.repeat()`, `'x'[0]`).
const NO_COMPUESTA = String.raw`(?!\s*[+.\[])`
const VALOR = String.raw`(['"\x60])((?:(?!\1).){4,})\1${NO_COMPUESTA}`
const CLAVE_DE_OBJETO = new RegExp(String.raw`["']?${NOMBRE}["']?\s*:\s*${VALOR}`)
const ASIGNACION = new RegExp(String.raw`(?:^|[\s(,{])${NOMBRE}\s*=\s*${VALOR}`)
const FALLBACK = new RegExp(String.raw`(?:\|\||\?\?)\s*${VALOR}`)
/** sh: `PGPASSWORD=abcd1234 psql …`, `export PASSWORD=abcd1234` (sin comillas, sin `$`). */
const ASIGNACION_SIN_COMILLAS = new RegExp(String.raw`(?:^|[\s(,{])${NOMBRE}=([^\s'"\x60$][^\s]{3,})`)
/** sql: `ALTER ROLE x PASSWORD 'abcd1234'` · `crypt('abcd1234', gen_salt('bf'))`. */
const SQL_PASSWORD = new RegExp(String.raw`\b(?:PASSWORD\s+|crypt\(\s*)${VALOR}`, 'i')
const HABLA_DE_PASSWORD = /password/i
/** `'TEST_E2E_USER_PASSWORD'`: el valor es el nombre de una variable de entorno (con `_`), no una clave. */
const NOMBRE_DE_ENV = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/

function esValorLiteral(comilla: string, valor: string): boolean {
  if (NOMBRE_DE_ENV.test(valor)) return false
  if (comilla === '`' && valor.includes('${')) return false
  return true
}

function esClaveLiteral(linea: string): boolean {
  for (const patron of [CLAVE_DE_OBJETO, ASIGNACION, SQL_PASSWORD]) {
    const m = patron.exec(linea)
    if (m && esValorLiteral(m[1], m[2])) return true
  }
  const sinComillas = ASIGNACION_SIN_COMILLAS.exec(linea)
  if (sinComillas && !NOMBRE_DE_ENV.test(sinComillas[1])) return true
  if (HABLA_DE_PASSWORD.test(linea)) {
    const m = FALLBACK.exec(linea)
    if (m && esValorLiteral(m[1], m[2])) return true
  }
  return false
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : archivos(p)
    return EXTENSIONES.test(f) && !ES_TEST.test(f) ? [p] : []
  })
}

function clavesLiterales(raices: string[] = RAICES): string[] {
  const hallazgos: string[] = []
  for (const raiz of raices) {
    for (const archivo of archivos(raiz)) {
      readFileSync(archivo, 'utf8').split('\n').forEach((linea, i) => {
        if (esClaveLiteral(linea)) hallazgos.push(`${relative(process.cwd(), archivo).split(sep).join('/')}:${i + 1}`)
      })
    }
  }
  return hallazgos
}

describe('canario: scripts sin contraseñas literales', () => {
  it('ningún script de scripts/ ni src/scripts/ trae una contraseña literal', () => {
    expect(clavesLiterales()).toEqual([])
  })

  it('caza la clave literal como valor de objeto, asignación o fallback', () => {
    expect(esClaveLiteral("        password: 'demo-golfers-2026',")).toBe(true) // seed-demo-data.ts:78 original
    expect(esClaveLiteral('  password: "test-golfers-2026" }')).toBe(true)
    expect(esClaveLiteral('  "password": "abcd1234",')).toBe(true) // JSON
    expect(esClaveLiteral("  userPassword: 'abcd1234',")).toBe(true)
    expect(esClaveLiteral("const PASSWORD = 'VisualTest123!'")).toBe(true) // seed-coach-visual-test.mjs:38 original
    expect(esClaveLiteral('$password = "abcd1234"')).toBe(true) // ps1
    expect(esClaveLiteral('PASSWORD="abcd1234"')).toBe(true) // sh
    expect(esClaveLiteral("  password: process.env.E2E_PASSWORD || 'fallback-1234',")).toBe(true)
    expect(esClaveLiteral("  password: process.env.E2E_PASSWORD ?? 'fallback-1234',")).toBe(true)
    expect(esClaveLiteral('  password: `abcd1234`,')).toBe(true) // template sin interpolación
    // la clave no está al final de la línea
    expect(esClaveLiteral("await sb.auth.signInWithPassword({ email: 'a@b.cl', password: 'abcd1234' })")).toBe(true)
    expect(esClaveLiteral("  password: 'abcd1234' });")).toBe(true)
    expect(esClaveLiteral("{ email: 'x', password: 'abcd1234', name: 'y' }")).toBe(true)
    expect(esClaveLiteral('psycopg2.connect(password="abcd1234")')).toBe(true) // py
    expect(esClaveLiteral("const { PASSWORD = 'abcd1234' } = process.env")).toBe(true)
    // mayúsculas sin `_` no es un nombre de variable de entorno
    expect(esClaveLiteral("  password: 'GOLFERS2026',")).toBe(true)
    expect(esClaveLiteral('PASSWORD = "ADMIN1234"')).toBe(true)
    // sh y sql
    expect(esClaveLiteral('PGPASSWORD=abcd1234 psql -h localhost')).toBe(true)
    expect(esClaveLiteral('export PGPASSWORD=abcd1234')).toBe(true)
    expect(esClaveLiteral("ALTER ROLE app PASSWORD 'abcd1234';")).toBe(true)
    expect(esClaveLiteral("  crypt('abcd1234', gen_salt('bf')),")).toBe(true)
  })

  it('no marca claves compuestas, al azar, variables ni nombres de variables de entorno', () => {
    expect(esClaveLiteral("  password: 'smoke-test-' + Date.now(),")).toBe(false)
    expect(esClaveLiteral('  password: `Seed-${crypto.randomUUID()}`,')).toBe(false)
    expect(esClaveLiteral('const PASSWORD = `Visual-${randomBytes(12).toString("base64url")}`')).toBe(false)
    expect(esClaveLiteral('  password,')).toBe(false)
    expect(esClaveLiteral('  password: PASSWORD,')).toBe(false)
    expect(esClaveLiteral('  password: claveSeed(),')).toBe(false)
    expect(esClaveLiteral('  const { data } = await sb.auth.signInWithPassword({ email, password })')).toBe(false)
    expect(esClaveLiteral("  E2E_TEST_USER_PASSWORD: 'TEST_E2E_USER_PASSWORD',")).toBe(false)
    expect(esClaveLiteral("  const password = process.env.E2E_PASSWORD || process.env.OTRA")).toBe(false)
    expect(esClaveLiteral("  TEST_E2E_USER_PASSWORD: 'x',")).toBe(false) // valor de menos de 4 caracteres (fixture)
    expect(esClaveLiteral("  password: 'abcd1234'.repeat(2),")).toBe(false)
    expect(esClaveLiteral('export PGPASSWORD=$TEST_DB_PASSWORD')).toBe(false)
    expect(esClaveLiteral('export PGPASSWORD=TEST_DB_PASSWORD')).toBe(false)
    expect(esClaveLiteral('  E2E_TEST_USER_PASSWORD=${{ secrets.E2E_PASSWORD }}')).toBe(false)
    expect(esClaveLiteral('<input type="password" name="password">')).toBe(false)
    expect(esClaveLiteral("  console.log(`│ Password: ${password}`)")).toBe(false)
  })
})
