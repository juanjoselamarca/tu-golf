/**
 * Piezas comunes del health check de admin (`GET /api/admin/health-check`): tipos del resultado,
 * cronómetro y el envoltorio que convierte una excepción en un check `fail`.
 */

export interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  details?: unknown
  duration_ms?: number
}

export interface Category {
  name: string
  checks: Check[]
}

export interface HealthCheckResult {
  timestamp: string
  duration_ms: number
  summary: {
    total: number
    passed: number
    warnings: number
    failed: number
  }
  categories: Category[]
}

export async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now()
  const result = await fn()
  return { result, ms: Date.now() - start }
}

export async function safeCheck(name: string, fn: () => Promise<Check>): Promise<Check> {
  try {
    return await fn()
  } catch (err) {
    return {
      name,
      status: 'fail',
      message: err instanceof Error ? err.message : 'Error desconocido',
    }
  }
}

/** Cuenta pass/warn/fail de todas las categorías. */
export function resumirChecks(categories: Category[]): HealthCheckResult['summary'] {
  const allChecks = categories.flatMap((c) => c.checks)
  return {
    total: allChecks.length,
    passed: allChecks.filter((c) => c.status === 'pass').length,
    warnings: allChecks.filter((c) => c.status === 'warn').length,
    failed: allChecks.filter((c) => c.status === 'fail').length,
  }
}
