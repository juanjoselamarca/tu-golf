/**
 * Tests del parser de output de Playwright que se usa en el workflow
 * .github/workflows/e2e-trigger.yml para armar el callback al admin.
 *
 * Antes este código estaba inline en el YAML (50 líneas dentro de un heredoc
 * de bash) y era imposible de testear. Esto cierra el gap: cubre todos los
 * branches del status (passed | failed | error con varias razones) más los
 * dos formatos de stdout contaminado que ya nos rompieron en CI.
 */
import { describe, it, expect } from 'vitest'
// El script .mjs no tiene tipos. Tipamos permisivamente porque es código de test.
import { parse as parseUntyped } from '../../scripts/parse-playwright-output.mjs'

type ParseReturn = {
  status: 'passed' | 'failed' | 'error'
  summary: { total: number; passed: number; failed: number; skipped: number }
  results: Array<{ name: string; status: string; error?: string }>
  truncated?: boolean
  error_message?: string
}
const parse = parseUntyped as (input: { outputContent: string; stderrContent: string }) => ParseReturn

const baseSuite = {
  config: { rootDir: '/runner' },
  errors: [],
  stats: { startTime: '2026-05-08T00:00:00Z', duration: 1000, expected: 0, unexpected: 0, skipped: 0, flaky: 0 },
  suites: [],
}

function buildSpec(name: string, status: 'passed' | 'failed' | 'skipped' | 'timedOut') {
  return {
    title: name,
    file: `e2e/${name}.spec.ts`,
    tests: [{ results: [{ status, duration: 100, errors: status === 'failed' ? [{ message: 'oops' }] : [] }] }],
  }
}

describe('parse-playwright-output', () => {
  describe('inputs malformados', () => {
    it('devuelve error si no hay JSON', () => {
      const out = parse({ outputContent: '', stderrContent: '' })
      expect(out.status).toBe('error')
      expect(out.error_message).toContain('No se encontró')
    })

    it('devuelve error si el JSON está corrupto', () => {
      const out = parse({ outputContent: '{not valid json', stderrContent: 'something bad' })
      expect(out.status).toBe('error')
      expect(out.error_message).toContain('ParseError')
      expect(out.error_message).toContain('something bad')
    })

    it('tolera console.log de global-setup antes del JSON (el caso real que rompió en CI)', () => {
      const contaminated = '[e2e-setup] Login vía UI...\n[e2e-setup] ✅ Login OK\n' + JSON.stringify({
        ...baseSuite,
        suites: [{ title: 'smoke', file: 'smoke.spec.ts', specs: [buildSpec('test1', 'passed')], suites: [] }],
      })
      const out = parse({ outputContent: contaminated, stderrContent: '' })
      expect(out.status).toBe('passed')
      expect(out.summary.total).toBe(1)
    })
  })

  describe('semántica del status', () => {
    it('passed: todos los tests pasan', () => {
      const json = { ...baseSuite, suites: [{ title: 's', file: 's.spec.ts', specs: [buildSpec('a', 'passed'), buildSpec('b', 'passed')], suites: [] }] }
      const out = parse({ outputContent: JSON.stringify(json), stderrContent: '' })
      expect(out.status).toBe('passed')
      expect(out.summary).toEqual({ total: 2, passed: 2, failed: 0, skipped: 0 })
    })

    it('failed: al menos un test falló', () => {
      const json = { ...baseSuite, suites: [{ title: 's', file: 's.spec.ts', specs: [buildSpec('a', 'passed'), buildSpec('b', 'failed')], suites: [] }] }
      const out = parse({ outputContent: JSON.stringify(json), stderrContent: '' })
      expect(out.status).toBe('failed')
      expect(out.summary.failed).toBe(1)
    })

    it('failed: timedOut cuenta como failed', () => {
      const json = { ...baseSuite, suites: [{ title: 's', file: 's.spec.ts', specs: [buildSpec('a', 'timedOut')], suites: [] }] }
      const out = parse({ outputContent: JSON.stringify(json), stderrContent: '' })
      expect(out.status).toBe('failed')
      expect(out.summary.failed).toBe(1)
    })

    it('error: total=0 (el caso de rondas-existentes throw que abortaba discovery)', () => {
      const json = {
        ...baseSuite,
        errors: [{ message: 'Error: SUPABASE_ACCESS_TOKEN no está en .env.local', location: { file: 'foo.spec.ts', line: 36 } }],
      }
      const out = parse({ outputContent: JSON.stringify(json), stderrContent: '' })
      expect(out.status).toBe('error')
      expect(out.error_message).toContain('no descubrió')
      expect(out.error_message).toContain('SUPABASE_ACCESS_TOKEN')
    })

    it('error: todos skipeados (no se verificó nada — antes reportaba falsamente passed)', () => {
      const json = { ...baseSuite, suites: [{ title: 's', file: 's.spec.ts', specs: [buildSpec('a', 'skipped'), buildSpec('b', 'skipped')], suites: [] }] }
      const out = parse({ outputContent: JSON.stringify(json), stderrContent: '' })
      expect(out.status).toBe('error')
      expect(out.error_message).toContain('skipeados')
      expect(out.summary).toEqual({ total: 2, passed: 0, failed: 0, skipped: 2 })
    })
  })

  describe('walker recursivo', () => {
    it('aplana suites anidadas con prefijo del title', () => {
      // El parser dropea passed/skipped del array `results` para mantener
      // el payload bajo el límite de WAF de Vercel. Usamos un test failed
      // para verificar el prefix del walker.
      const json = {
        ...baseSuite,
        suites: [{
          title: 'mobile-chromium',
          file: 's.spec.ts',
          specs: [],
          suites: [{
            title: 'login flow',
            specs: [buildSpec('redirect', 'failed')],
            suites: [],
          }],
        }],
      }
      const out = parse({ outputContent: JSON.stringify(json), stderrContent: '' })
      expect(out.results[0].name).toContain('login flow ›')
      expect(out.results[0].name).toContain('redirect')
    })

    it('trunca error a 500 chars para reducir PII en BD', () => {
      const longError = 'X'.repeat(2000)
      const json = {
        ...baseSuite,
        suites: [{
          title: 's',
          file: 's.spec.ts',
          specs: [{ title: 'a', file: 'e2e/a.spec.ts', tests: [{ results: [{ status: 'failed', errors: [{ message: longError }] }] }] }],
          suites: [],
        }],
      }
      const out = parse({ outputContent: JSON.stringify(json), stderrContent: '' })
      expect(out.results[0].error!.length).toBeLessThanOrEqual(500)
    })
  })

  describe('payload truncation (Vercel WAF guard)', () => {
    it('dropea passed/skipped de results pero mantiene los counts en summary', () => {
      const json = {
        ...baseSuite,
        suites: [{
          title: 's',
          file: 's.spec.ts',
          specs: [
            buildSpec('test-1', 'passed'),
            buildSpec('test-2', 'passed'),
            buildSpec('test-3', 'skipped'),
            buildSpec('test-4', 'failed'),
          ],
          suites: [],
        }],
      }
      const out = parse({ outputContent: JSON.stringify(json), stderrContent: '' })
      // Summary tiene los counts completos
      expect(out.summary).toEqual({ total: 4, passed: 2, failed: 1, skipped: 1 })
      // Pero results solo contiene el failed
      expect(out.results).toHaveLength(1)
      expect(out.results[0].status).toBe('failed')
      // Y marca truncated=true
      expect(out.truncated).toBe(true)
    })

    it('no marca truncated si todos los tests fallaron', () => {
      const json = {
        ...baseSuite,
        suites: [{
          title: 's',
          file: 's.spec.ts',
          specs: [buildSpec('a', 'failed'), buildSpec('b', 'timedOut')],
          suites: [],
        }],
      }
      const out = parse({ outputContent: JSON.stringify(json), stderrContent: '' })
      expect(out.results).toHaveLength(2)
      expect(out.truncated).toBeUndefined()
    })
  })
})
