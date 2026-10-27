#!/usr/bin/env node
/**
 * Respaldo del bloqueo de migraciones tocadas que no se salta: el pre-push local se puede saltar con --no-verify o
 * desde otro clon; esto corre en GitHub con el YAML y el script de MAIN (.github/workflows/migraciones-inmutables.yml,
 * pull_request_target), y antes del `db push` en migraciones-prod.yml. Nunca ejecuta código del PR: solo lee objetos
 * git (ls-tree / rev-parse) del merge ref.
 *
 * Fail-closed. Falla si:
 *   (a) una migración (`.sql` directo en supabase/migrations/) de la base no está en HEAD con el MISMO blob:
 *       editada, borrada o renombrada. Editarla no cambia prod si ya la aplicó y, si no, re-correr la corrida
 *       aplica la versión vieja; borrarla o renombrarla rompe `supabase db push --include-all`.
 *   (b) una migración que HEAD agrega respecto de la base repite una versión que ya usa otro archivo de la base o de
 *       main actual (renombre o choque), o tiene un nombre que main actual ya trae con otro contenido.
 *   (c) no puede leer las migraciones, la base no trae ninguna, o (modo --pr) el PR no es mergeable o su merge ref
 *       no corresponde a su HEAD actual.
 * Salida, solo para (a): la etiqueta `permitir-tocar-migracion:<version>` en el PR. Es CONVENCIÓN, no control: GitHub
 * deja ponerla a cualquiera con permiso de triage, incluidos los agentes. Un agente nunca la pone (igual que
 * `fable-reviewed`); la pone Juanjo tras confirmar que esa migración FALLÓ al aplicarse en prod. Un renombre que
 * conserva la versión no se salva con la etiqueta: (b) no tiene salida.
 *
 * Uso:
 *   --pr                      (pull_request_target) env GH_TOKEN, GITHUB_REPOSITORY, PR. Trae refs/pull/PR/merge
 *                             fresco: base = MERGE^1 (la base exacta del merge), head = MERGE, main = origin/main.
 *   --base=<ref> --head=<ref> (push a main, en migraciones-prod.yml) etiquetas de los PRs del commit COMMIT_SHA.
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { archivoPorVersion, esMigracionAplicable, versionDeMigracion } from '../lib/nombre-migracion.mjs'

export const PREFIJO_ETIQUETA = 'permitir-tocar-migracion:'

const gitPorDefecto = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** Map archivo → blob de las migraciones aplicables de `ref`; lanza si git falla (fail-closed). */
export function migracionesDe(ref, git = gitPorDefecto) {
  const out = new Map()
  for (const linea of git(['-c', 'core.quotePath=false', 'ls-tree', ref, '--', 'supabase/migrations/']).split(/\r?\n/)) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(linea.trim())
    if (m && esMigracionAplicable(m[2])) out.set(m[2], m[1])
  }
  return out
}

/** Versiones exentas por etiquetas `permitir-tocar-migracion:<version>` (las demás etiquetas se ignoran). */
export const versionesExentas = etiquetas =>
  new Set(etiquetas.filter(e => e.startsWith(PREFIJO_ETIQUETA)).map(e => e.slice(PREFIJO_ETIQUETA.length).trim()))

/**
 * `base` y `head` = Map archivo → blob; `main` = el de main actual (null si no aplica). `etiquetas` = null si no se
 * pudieron leer (sin salida). Devuelve { errores, exentas } con un texto por problema.
 */
export function revisarInmutables({ base, head, main = null, etiquetas }) {
  const exentas = versionesExentas(etiquetas ?? [])
  const errores = []
  const usadas = []
  // Leer 0 migraciones de la base es una lectura rota (main tiene cientos), no una base vacía.
  if (base.size === 0) errores.push('❌ No se leyó ninguna migración de la base: no se puede verificar.')
  for (const [f, blob] of base) {
    const enHead = head.get(f)
    if (enHead === blob) continue
    const que = enHead === undefined ? 'borrada o renombrada' : 'editada'
    const version = versionDeMigracion(f)
    if (version !== null && exentas.has(version)) {
      usadas.push(`⚠ ${f} ${que}, exenta por la etiqueta ${PREFIJO_ETIQUETA}${version}`)
      continue
    }
    errores.push(`❌ ${f} está en main y el PR la dejó ${que}. Una migración mergeada no se toca: el cambio va en una ` +
      `migración NUEVA. Restáurala con \`git checkout origin/main -- ${f}\`.`)
  }
  const conocidas = archivoPorVersion([...base.keys(), ...(main?.keys() ?? [])])
  for (const [f, blob] of head) {
    if (base.has(f)) continue
    if (main?.has(f) && main.get(f) !== blob) {
      errores.push(`❌ ${f}: main ya trae ese archivo con otro contenido. Haz \`git merge origin/main\` y deja el de main ` +
        'como está; el cambio va en una migración NUEVA.')
      continue
    }
    const version = versionDeMigracion(f)
    const g = version === null ? undefined : conocidas.get(version)
    if (g !== undefined && g !== f) {
      errores.push(`❌ ${f}: main ya trae la versión ${version} como ${g}: si es tu migración renombrada, deja ${g} ` +
        'como está y el cambio va en una NUEVA; si es otra, renombra la tuya con un timestamp nuevo.')
    }
  }
  return { errores, exentas: usadas }
}

async function api(ruta, token) {
  const res = await fetch(`https://api.github.com${ruta}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`${ruta}: HTTP ${res.status}`)
  return res.json()
}

/** Etiquetas de un PR o de los PRs de un commit; null si no se pudieron leer. */
async function etiquetas({ GH_TOKEN, GITHUB_REPOSITORY, PR, COMMIT_SHA }) {
  if (!GH_TOKEN || !GITHUB_REPOSITORY || (!PR && !COMMIT_SHA)) return null
  try {
    if (PR) return (await api(`/repos/${GITHUB_REPOSITORY}/issues/${PR}/labels?per_page=100`, GH_TOKEN)).map(l => l.name)
    const prs = await api(`/repos/${GITHUB_REPOSITORY}/commits/${COMMIT_SHA}/pulls`, GH_TOKEN)
    return prs.flatMap(p => p.labels.map(l => l.name))
  } catch {
    return null
  }
}

/**
 * Modo --pr: espera a que GitHub calcule `mergeable` (al consultarlo recalcula refs/pull/N/merge contra main actual),
 * trae el merge ref y comprueba que su 2º padre sea el HEAD actual del PR. Devuelve { base, head, main } (refs).
 */
export async function prepararMergeDelPr({ pr, leerPr, git = gitPorDefecto, esperar = ms => new Promise(r => setTimeout(r, ms)) }) {
  let datos
  for (let i = 0; i < 10; i++) {
    datos = await leerPr()
    if (datos.mergeable !== null) break
    await esperar(3000)
  }
  if (datos.mergeable === null) throw new Error('GitHub no terminó de calcular si el PR es mergeable: re-corre el job.')
  if (datos.mergeable === false) throw new Error('El PR tiene conflictos con main: haz `git merge origin/main` y pushea.')
  git(['fetch', '--no-tags', '--depth=2', 'origin', `+refs/pull/${pr}/merge:refs/remotes/pr/merge`, '+refs/heads/main:refs/remotes/origin/main'])
  const segundo = git(['rev-parse', 'refs/remotes/pr/merge^2'])
  if (segundo !== datos.head.sha) {
    throw new Error(`El merge ref del PR (2º padre ${segundo}) no es el HEAD actual del PR (${datos.head.sha}): re-corre el job.`)
  }
  return { base: 'refs/remotes/pr/merge^1', head: 'refs/remotes/pr/merge', main: 'refs/remotes/origin/main' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const env = process.env
  let r
  try {
    let refs
    if (process.argv.includes('--pr')) {
      if (!env.GH_TOKEN || !env.GITHUB_REPOSITORY || !env.PR) throw new Error('--pr necesita GH_TOKEN, GITHUB_REPOSITORY y PR.')
      refs = await prepararMergeDelPr({ pr: env.PR, leerPr: () => api(`/repos/${env.GITHUB_REPOSITORY}/pulls/${env.PR}`, env.GH_TOKEN) })
    } else {
      refs = { base: arg('base'), head: arg('head') ?? 'HEAD', main: null }
      if (!refs.base) throw new Error('Falta --base=<ref> (o --pr).')
    }
    const eti = await etiquetas(env)
    if (eti === null) console.log('⚠ No pude leer las etiquetas: sin salida por permitir-tocar-migracion.')
    r = revisarInmutables({
      base: migracionesDe(refs.base),
      head: migracionesDe(refs.head),
      main: refs.main ? migracionesDe(refs.main) : null,
      etiquetas: eti,
    })
    console.log(`Base ${refs.base} → ${refs.head}${refs.main ? ` (main actual: ${refs.main})` : ''}.`)
  } catch (e) {
    console.log(`::error::${e.message}`)
    process.exit(1)
  }
  for (const a of r.exentas) console.log(`::warning::${a}`)
  for (const e of r.errores) console.log(`::error::${e}`)
  if (r.errores.length > 0) process.exit(1)
  console.log('Migraciones de la base intactas y sin versiones repetidas.')
}
