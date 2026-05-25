#!/usr/bin/env node
/**
 * check-no-new-console.mjs — gate de CI que bloquea PRs que agregan nuevos
 * `console.*` en código productivo.
 *
 * Por qué este script y no `no-console: error` en ESLint:
 *   - Hoy hay 465 ocurrencias de console.* en 66 archivos (mayo 2026).
 *   - Activar la regla como error rompería todo el CI hasta migrar las 465.
 *   - La migración a captureError() es gradual (ver CLAUDE.md regla "el que
 *     toca, ordena").
 *   - Este script detecta SOLO líneas AGREGADAS en el diff vs main que
 *     introducen un console.*. Las preexistentes no afectan.
 *
 * Uso local:
 *   node scripts/check-no-new-console.mjs              # diff vs origin/main
 *   node scripts/check-no-new-console.mjs --base=HEAD~5  # diff vs commit
 *
 * Uso en CI (.github/workflows/ci.yml):
 *   - Solo corre en pull_request events
 *   - Compara head SHA contra base SHA del PR
 *
 * Excepciones (NO se cuentan):
 *   - tests (src/__tests__/, archivos .test.ts/.tsx)
 *   - scripts CLI (src/scripts/)
 *   - capa de logging (src/lib/logger.ts, src/lib/error-tracking.ts, etc.)
 *   - console.error (permitido por ESLint actual — útil para errores reales)
 */

import { execSync } from 'node:child_process'

const args = process.argv.slice(2)
const baseArg = args.find((a) => a.startsWith('--base='))
const base = baseArg ? baseArg.split('=')[1] : process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : 'origin/main'

const EXCLUDED_PATHS = [
  /^src\/__tests__\//,
  /\.test\.tsx?$/,
  /^src\/scripts\//,
  /^src\/lib\/logger\.ts$/,
  /^src\/lib\/error-tracking\.ts$/,
  /^src\/lib\/inbox-logger\.ts$/,
  /^src\/utils\/logger\.ts$/,
]

function isExcluded(path) {
  return EXCLUDED_PATHS.some((re) => re.test(path))
}

function getDiff() {
  // git diff no acepta el glob ** en pathspec literal — hay que usar
  // :(glob) o filtrar por extensión en JS. Optamos por filtrar en JS para
  // evitar dependencia de la versión de git.
  try {
    return execSync(`git diff --unified=0 ${base}...HEAD -- src/`, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    })
  } catch (err) {
    console.error(`[check-no-new-console] no se pudo obtener diff vs ${base}`)
    console.error(err.message)
    process.exit(2)
  }
}

function isTypescriptSource(path) {
  return /\.(ts|tsx)$/.test(path)
}

function parseAdditions(diff) {
  const violations = []
  let currentFile = null
  let currentHunkStart = 0
  let lineOffset = 0

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6)
      lineOffset = 0
      continue
    }
    if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)/)
      currentHunkStart = m ? parseInt(m[1], 10) : 0
      lineOffset = 0
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.slice(1)
      // Excluir comentarios obvios — no se penaliza un comentario que mencione console.
      const stripped = content.replace(/^\s*\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')
      // console.log / .warn / .info / .debug (console.error está permitido por ESLint)
      if (/\bconsole\.(log|warn|info|debug)\s*\(/.test(stripped)) {
        if (currentFile && isTypescriptSource(currentFile) && !isExcluded(currentFile)) {
          violations.push({
            file: currentFile,
            line: currentHunkStart + lineOffset,
            text: content.trim().slice(0, 120),
          })
        }
      }
      lineOffset++
    } else if (!line.startsWith('-') && !line.startsWith('\\')) {
      lineOffset++
    }
  }
  return violations
}

const diff = getDiff()
if (!diff.trim()) {
  console.log('[check-no-new-console] sin cambios en src/. OK.')
  process.exit(0)
}

const violations = parseAdditions(diff)

if (violations.length === 0) {
  console.log('[check-no-new-console] sin nuevos console.log/warn/info/debug. OK.')
  process.exit(0)
}

console.error(`\n❌ Este PR agrega ${violations.length} nuevo(s) console.* en código productivo.\n`)
console.error('Usar en su lugar:')
console.error('  - captureError(err, "ctx.op", { meta })  // de src/lib/error-tracking.ts')
console.error('  - logger.info/warn/...                    // si existe un logger del módulo')
console.error('  - console.error(...)                      // permitido para errores reales\n')
console.error('Detalle:')
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  →  ${v.text}`)
}
console.error('\nVer CLAUDE.md sección "REGLA OPERATIVA" para contexto.')
process.exit(1)
