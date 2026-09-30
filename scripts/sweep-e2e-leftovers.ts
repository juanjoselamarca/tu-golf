/**
 * Barre la basura de tests en prod (ver e2e/helpers/sweep-e2e-leftovers.ts).
 *
 *   npm run test:e2e:sweep                 # borra lo del usuario de test > 60 min
 *   npm run test:e2e:sweep -- --dry-run    # sólo cuenta
 *
 * En CI corre antes y después de los tests de integración. Nunca falla el job:
 * un barrido parcial se reporta como warning de GitHub Actions.
 */
import { sweepE2ELeftovers } from '../e2e/helpers/sweep-e2e-leftovers'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  try {
    const r = await sweepE2ELeftovers({ dryRun })
    const verbo = dryRun ? 'a barrer' : 'barridos'
    process.stdout.write(`sweep-e2e: ${r.tournaments} torneos y ${r.rondas} rondas ${verbo}\n`)
    for (const e of r.errors) process.stdout.write(`::warning title=sweep-e2e parcial::${e}\n`)
  } catch (err) {
    process.stdout.write(`::warning title=sweep-e2e falló::${err instanceof Error ? err.message : String(err)}\n`)
  }
}

void main()
