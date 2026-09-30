/**
 * Barre la basura de tests en prod (ver e2e/helpers/sweep-e2e-leftovers.ts).
 *
 *   set -a; . ./.env.local; set +a          # local: cargar credenciales primero
 *   npm run test:e2e:sweep -- --dry-run     # sólo cuenta
 *   npm run test:e2e:sweep                  # borra lo del usuario de test > 60 min
 *
 * En CI corre al final del job de integración: en pull_request sólo cuenta
 * (dry-run); el borrado real corre sólo en push a main (código ya revisado).
 * Nunca falla el job: un barrido parcial se reporta como warning de Actions.
 */
import { sweepE2ELeftovers } from '../e2e/helpers/sweep-e2e-leftovers'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  try {
    const r = await sweepE2ELeftovers({ dryRun })
    const verbo = dryRun ? 'a barrer (dry-run)' : 'barridos'
    process.stdout.write(`::notice title=sweep-e2e::${r.tournaments} torneos y ${r.rondas} rondas ${verbo}\n`)
    for (const e of r.errors) process.stdout.write(`::warning title=sweep-e2e parcial::${e}\n`)
  } catch (err) {
    process.stdout.write(`::warning title=sweep-e2e falló::${err instanceof Error ? err.message : String(err)}\n`)
  }
}

void main()
