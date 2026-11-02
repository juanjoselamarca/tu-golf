#!/usr/bin/env node
/**
 * scripts/promover-a-produccion.mjs — pasa a prod lo que hay en main. Vercel publica prod desde la rama `production`
 * y `migraciones-prod` aplica las migraciones en cada push a ella: mergear a main no toca prod.
 *
 * Avanza `production` al HEAD de main solo si no hay evento en vivo (sin credenciales de prod no promueve), si todas
 * las corridas que disparó el push de ese commit a main y sus estados (Vercel) terminaron en verde (la de CI tiene que
 * estar) y si el avance es fast-forward. Si `production` no existe, la crea en ese commit. Las corridas programadas
 * (monitor, canarios, E2E semanales) también cuelgan del HEAD de main, pero no prueban ese commit: no cuentan.
 *
 * Mueve la rama con la API de GitHub y no con git push: el pre-push solo deja pushear el HEAD del checkout y repetiría
 * el verify de un commit que el CI de main ya verificó. Un cambio de ref por la API dispara los workflows y el deploy
 * de Vercel igual que un push.
 *
 * Uso: npm run promover   → exit 0 promovido o nada que promover · exit 1 main no está lista · exit 3 evento en vivo
 */
import { execFileSync } from 'node:child_process'
import { consultarEvento, credencialesEvento, EXIT_EVENTO, MENSAJE_CONGELADO } from './ci/evento-en-vivo.mjs'

export const RAMA_PROD = 'production'
/** `name:` de .github/workflows/ci.yml (lo compara el test). */
export const WORKFLOW_CI = 'CI'
const CONCLUSIONES_VERDES = new Set(['success', 'skipped', 'neutral'])

/** Puro: lo que falta para que el commit esté en verde, vacío si está listo. `runs`: corridas del push a main. */
export function faltasDeMain({ runs, statuses }) {
  const faltas = runs
    .filter(r => r.status !== 'completed' || !CONCLUSIONES_VERDES.has(r.conclusion))
    .map(r => `${r.name}: ${r.status === 'completed' ? r.conclusion : r.status}`)
  if (!runs.some(r => r.name === WORKFLOW_CI)) faltas.push(`${WORKFLOW_CI}: todavía no corre`)
  return [...faltas, ...statuses.filter(s => s.state !== 'success').map(s => `${s.context}: ${s.state}`)]
}

/** Puro. `comparacion`: status de la API compare (production...main) o 'sin-rama' si production no existe. */
export function decidirPromocion({ evento, faltas, comparacion }) {
  if (evento.evento) return { promover: false, exit: EXIT_EVENTO, motivo: MENSAJE_CONGELADO(evento.motivo) }
  if (faltas.length > 0) return { promover: false, exit: 1, motivo: `main no está en verde: ${faltas.join(' · ')}` }
  if (comparacion === 'identical') return { promover: false, exit: 0, motivo: `${RAMA_PROD} ya está en el HEAD de main.` }
  if (comparacion !== 'ahead' && comparacion !== 'sin-rama') {
    return { promover: false, exit: 1, motivo: `${RAMA_PROD} no es ancestro de main (${comparacion}): alguien commiteó directo en ${RAMA_PROD}.` }
  }
  return { promover: true, exit: 0, motivo: '' }
}

const gh = args => execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const ghJson = ruta => JSON.parse(gh([ruta]))

function comparar(sha) {
  try {
    return ghJson(`repos/{owner}/{repo}/compare/${RAMA_PROD}...${sha}`).status
  } catch (e) {
    if (/HTTP 404/.test(String(e.stderr))) return 'sin-rama'
    throw e
  }
}

async function main() {
  const credenciales = credencialesEvento(process.env)
  if (!credenciales.url) {
    console.error('Sin credenciales de prod no se puede descartar un evento en vivo: corre `npm run promover` (usa .env.local).')
    return 1
  }
  const sha = ghJson('repos/{owner}/{repo}/commits/main').sha
  const faltas = faltasDeMain({
    runs: ghJson(`repos/{owner}/{repo}/actions/runs?head_sha=${sha}&event=push&branch=main&per_page=100`).workflow_runs,
    statuses: ghJson(`repos/{owner}/{repo}/commits/${sha}/status`).statuses,
  })
  const comparacion = comparar(sha)
  // El evento se consulta al final, lo más cerca posible del cambio de rama.
  const decision = decidirPromocion({ evento: await consultarEvento(credenciales), faltas, comparacion })
  if (!decision.promover) {
    console.log(decision.motivo)
    return decision.exit
  }
  if (comparacion === 'sin-rama') gh(['-X', 'POST', 'repos/{owner}/{repo}/git/refs', '-f', `ref=refs/heads/${RAMA_PROD}`, '-f', `sha=${sha}`])
  else gh(['-X', 'PATCH', `repos/{owner}/{repo}/git/refs/heads/${RAMA_PROD}`, '-f', `sha=${sha}`, '-F', 'force=false'])
  console.log(`${RAMA_PROD} → ${sha.slice(0, 8)}. Vercel publica ese commit; si trae migraciones, falta aprobar migraciones-prod.`)
  return 0
}

if (process.argv[1]?.endsWith('promover-a-produccion.mjs')) {
  main().then(code => setTimeout(() => process.exit(code), 200), e => {
    console.error(`✘ promover: ${e.stderr || e.message}`)
    process.exit(1)
  })
}
