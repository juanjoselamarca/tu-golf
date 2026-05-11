/**
 * Parser puro del output del Playwright JSON reporter. Sin I/O ni side-effects.
 * El CLI que invoca este parser desde el workflow vive en
 * scripts/parse-playwright-output-cli.mjs.
 *
 * Tests: src/__tests__/parse-playwright-output.test.ts
 *
 * Semántica del status:
 *   - JSON malformado o ausente            → 'error'
 *   - total === 0 (no descubrió tests)     → 'error' (incluye raw.errors de Playwright)
 *   - total > 0 && skipped === total        → 'error' (todo skipeado = no se verificó nada)
 *   - failed > 0 (algún test falló)         → 'failed'
 *   - resto                                  → 'passed'
 */

const MAX_ERROR_CHARS = 500   // por test (baja de 2000 para reducir PII en BD)
const MAX_STDERR_CHARS = 1000
const MAX_PW_ERRORS_CHARS = 1500

function buildErrorPayload(reason, extras = {}) {
  return {
    status: 'error',
    error_message: [
      reason,
      extras.parseError && `ParseError: ${extras.parseError}`,
      extras.stderr && `stderr(0-${MAX_STDERR_CHARS}):\n${extras.stderr.slice(0, MAX_STDERR_CHARS)}`,
      extras.head && `stdout(0-500):\n${extras.head}`,
      extras.errors && `errors: ${JSON.stringify(extras.errors).slice(0, MAX_PW_ERRORS_CHARS)}`,
      extras.stats && `stats: ${JSON.stringify(extras.stats).slice(0, 500)}`,
    ].filter(Boolean).join('\n\n'),
  }
}

function walkSuites(raw) {
  const tests = []
  const visit = (suite, prefix = '') => {
    for (const s of suite.suites ?? []) {
      visit(s, prefix + (s.title ? `${s.title} › ` : ''))
    }
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const result = t.results?.[0]
        if (!result) continue
        tests.push({
          name: prefix + spec.title,
          status: result.status,
          duration_ms: result.duration,
          file: spec.file,
          error: result.errors?.[0]?.message?.slice(0, MAX_ERROR_CHARS),
        })
      }
    }
  }
  for (const s of raw.suites ?? []) visit(s)
  return tests
}

function summarize(tests) {
  return {
    total: tests.length,
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => ['failed', 'timedOut', 'interrupted'].includes(t.status)).length,
    skipped: tests.filter((t) => t.status === 'skipped').length,
  }
}

export function parse({ outputContent, stderrContent }) {
  const stderr = stderrContent ?? ''

  // El JSON reporter escribe a stdout, pero global-setup.ts hace console.log
  // antes del JSON. Buscamos el primer `{` y parseamos desde ahí.
  const jsonStart = outputContent.indexOf('{')
  if (jsonStart < 0) {
    return buildErrorPayload(
      'Playwright no produjo output JSON parseable.',
      { parseError: 'No se encontró `{` en stdout', stderr, head: outputContent.slice(0, 500) },
    )
  }

  let raw
  try {
    raw = JSON.parse(outputContent.slice(jsonStart))
  } catch (err) {
    return buildErrorPayload(
      'Playwright no produjo output JSON parseable.',
      { parseError: err.message, stderr, head: outputContent.slice(jsonStart, jsonStart + 500) },
    )
  }

  const tests = walkSuites(raw)
  const summary = summarize(tests)

  if (summary.total === 0) {
    return {
      ...buildErrorPayload(
        'Playwright corrió pero no descubrió ni ejecutó tests.',
        { errors: Array.isArray(raw.errors) ? raw.errors : [], stats: raw.stats || {} },
      ),
      summary,
      results: tests,
    }
  }

  if (summary.skipped === summary.total) {
    return {
      ...buildErrorPayload(
        'Todos los tests fueron skipeados — no se verificó nada.',
        { stats: raw.stats || {} },
      ),
      summary,
      results: tests,
    }
  }

  const status = summary.failed > 0 ? 'failed' : 'passed'
  return { status, summary, results: tests }
}
