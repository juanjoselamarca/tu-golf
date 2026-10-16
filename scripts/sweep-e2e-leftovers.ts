/**
 * Barre la basura de tests en prod (ver e2e/helpers/sweep-e2e-leftovers.ts).
 *
 *   set -a; . ./.env.local; set +a          # local: cargar credenciales primero
 *   npm run test:e2e:sweep -- --dry-run     # sólo cuenta
 *   npm run test:e2e:sweep                  # borra lo del usuario de test y los efímeros > 60 min
 *
 * En CI: contra la base de pruebas (integracion, e2e-auth-weekly vía
 * con-base-de-pruebas.mjs) borra en cada corrida, también en PR; contra prod
 * borra sólo en el canario programado (prod-canarios), nunca con código de un PR.
 * Nunca falla el job: un barrido parcial se reporta como warning de Actions.
 */
import { sweepE2ELeftovers } from '../e2e/helpers/sweep-e2e-leftovers'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  try {
    const r = await sweepE2ELeftovers({ dryRun })
    const verbo = dryRun ? 'a barrer (dry-run)' : 'barridos'
    process.stdout.write(`::notice title=sweep-e2e::${r.tournaments} torneos, ${r.rondas} rondas y ${r.usuarios} usuarios efímeros ${verbo}\n`)
    for (const e of r.errors) process.stdout.write(`::warning title=sweep-e2e parcial::${e}\n`)
  } catch (err) {
    process.stdout.write(`::warning title=sweep-e2e falló::${err instanceof Error ? err.message : String(err)}\n`)
  }
}

void main()
