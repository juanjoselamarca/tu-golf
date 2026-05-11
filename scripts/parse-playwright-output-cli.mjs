#!/usr/bin/env node
/**
 * CLI wrapper que lee playwright-output.json + playwright-stderr.log,
 * llama al parser puro y escribe callback-payload.json para el workflow.
 *
 * Lib parser: scripts/parse-playwright-output.mjs (puro, testeado)
 * Workflow: .github/workflows/e2e-trigger.yml step "Parse results y armar payload"
 *
 * Env vars opcionales para override de paths (útil en tests/locales):
 *   PLAYWRIGHT_OUTPUT_FILE  default: playwright-output.json
 *   PLAYWRIGHT_STDERR_FILE  default: playwright-stderr.log
 *   CALLBACK_PAYLOAD_FILE   default: callback-payload.json
 */
import fs from 'fs'
import { parse } from './parse-playwright-output.mjs'

const OUTPUT_FILE = process.env.PLAYWRIGHT_OUTPUT_FILE || 'playwright-output.json'
const STDERR_FILE = process.env.PLAYWRIGHT_STDERR_FILE || 'playwright-stderr.log'
const PAYLOAD_FILE = process.env.CALLBACK_PAYLOAD_FILE || 'callback-payload.json'

function readSafe(path) {
  try { return fs.readFileSync(path, 'utf8') } catch { return '' }
}

const payload = parse({
  outputContent: readSafe(OUTPUT_FILE),
  stderrContent: readSafe(STDERR_FILE),
})
fs.writeFileSync(PAYLOAD_FILE, JSON.stringify(payload))
console.log(
  `E2E: ${payload.summary?.passed ?? 0}/${payload.summary?.total ?? 0} passed, ` +
  `${payload.summary?.failed ?? 0} failed, ${payload.summary?.skipped ?? 0} skipped ` +
  `(status=${payload.status})`,
)
