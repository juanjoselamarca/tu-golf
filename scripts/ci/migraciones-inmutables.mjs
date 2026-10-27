#!/usr/bin/env node
/**
 * Respaldo en CI del bloqueo de migraciones tocadas (el pre-push local se puede saltar con --no-verify o desde otro
 * clon; este no). Corre en el job obligatorio "Verificación (tsc + tests + build)" de ci.yml, sobre el commit de
 * merge del PR (actions/checkout con pull_request hace checkout de refs/pull/N/merge, que ya contiene la base).
 *
 * Fail-closed. Falla si:
 *   (a) una migración (`.sql` directo en supabase/migrations/) de la base no está en HEAD con el MISMO blob:
 *       editada, borrada o renombrada. Editarla no cambia prod si ya la aplicó y, si no, re-correr la corrida
 *       aplica la versión vieja; borrarla o renombrarla rompe `supabase db push --include-all`.
 *   (b) una migración que HEAD agrega tiene una versión que la base ya usa (renombre de una de main, o choque).
 *   (c) no puede leer las migraciones de la base o de HEAD, o la base no trae ninguna.
 * Única salida, solo para (a): la etiqueta del PR `permitir-tocar-migracion:<version>` (la pone SOLO Juanjo, tras
 * confirmar que esa migración FALLÓ al aplicarse en prod), leída en vivo por la API: tras ponerla hay que re-correr
 * el job. Sin poder leer las etiquetas, no hay salida. (b) no tiene salida: se renombra con un timestamp nuevo.
 *
 * Uso (CI):  node scripts/ci/migraciones-inmutables.mjs --base=origin/main
 *            env GH_TOKEN, GITHUB_REPOSITORY, PR (número). Sin PR (p. ej. un push a main) revisa sin salida.
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { esMigracionAplicable, versionDeMigracion } from '../lib/nombre-migracion.mjs'

export const PREFIJO_ETIQUETA = 'permitir-tocar-migracion:'

const gitPorDefecto = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

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
 * Compara las migraciones de la base con las de HEAD. `etiquetas` = null si no se pudieron leer (sin salida).
 * Devuelve { errores, exentas } con un texto por problema.
 */
export function revisarInmutables({ base, head, etiquetas }) {
  const exentas = versionesExentas(etiquetas ?? [])
  const errores = []
  // Leer 0 migraciones de la base es una lectura rota (main tiene cientos), no una base vacía.
  if (base.size === 0) errores.push('❌ No se leyó ninguna migración de la base: no se puede verificar.')
  const usadas = []
  const versionesBase = new Map([...base.keys()].map(f => [versionDeMigracion(f), f]).filter(([v]) => v !== null))
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
  for (const f of head.keys()) {
    if (base.has(f)) continue
    const version = versionDeMigracion(f)
    const g = version === null ? undefined : versionesBase.get(version)
    if (g !== undefined) {
      errores.push(`❌ ${f}: main ya trae la versión ${version} como ${g}: si es tu migración renombrada, deja ${g} ` +
        'como está y el cambio va en una NUEVA; si es otra, renombra la tuya con un timestamp nuevo.')
    }
  }
  return { errores, exentas: usadas }
}

async function etiquetasDelPr({ GH_TOKEN, GITHUB_REPOSITORY, PR }) {
  if (!GH_TOKEN || !GITHUB_REPOSITORY || !PR) return null
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${PR}/labels?per_page=100`, {
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    return (await res.json()).map(l => l.name)
  } catch {
    return null
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv.find(a => a.startsWith('--base='))?.slice('--base='.length) ?? 'origin/main'
  let r
  try {
    const etiquetas = process.env.PR ? await etiquetasDelPr(process.env) : []
    if (etiquetas === null) console.log('⚠ No pude leer las etiquetas del PR: sin salida por permitir-tocar-migracion.')
    r = revisarInmutables({ base: migracionesDe(base), head: migracionesDe('HEAD'), etiquetas })
  } catch (e) {
    console.log(`::error::No pude leer las migraciones de ${base} o de HEAD: ${e.message}`)
    process.exit(1)
  }
  for (const a of r.exentas) console.log(`::warning::${a}`)
  for (const e of r.errores) console.log(`::error::${e}`)
  if (r.errores.length > 0) process.exit(1)
  console.log(`Migraciones de ${base} intactas en el PR y sin versiones repetidas.`)
}
