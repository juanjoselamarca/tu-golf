#!/usr/bin/env node
/**
 * Decisiones que Juanjo ya tomó sobre un tema, para el expediente del `/consejo`: que el consejo no recomiende algo
 * que ya se descartó ni contradiga una regla vigente sin decirlo.
 *
 * Busca en la memoria del proyecto (feedback_* y project_*, fuera del repo y privada) y en docs/design-decisions/.
 * Devuelve los archivos que más calzan con las palabras, con su descripción y las líneas que mencionan una decisión.
 * La salida va al expediente (.claude/expedientes/, gitignored): nunca a un archivo versionado.
 *
 * Uso:  node scripts/consejo/decisiones-previas.mjs inscripción invitado whatsapp [--max 10]
 *       CONSEJO_MEMORIA=<dir> para otra carpeta de memoria.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Sin tildes y en minúsculas, para que «inscripción» calce con «inscripcion». Pura. */
export function normalizar(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Carpeta de proyecto de Claude Code para un checkout: C:\a b\c → C--a-b-c. Pura. */
export function slugDeProyecto(ruta) {
  return ruta.replace(/[:\\/ ]/g, '-')
}

const SEÑAL_DE_DECISION = /juanjo|decidi|decision|descart|norma|regla|why:|nunca|siempre|no quiere|prefiere/

/**
 * Puntaje de un documento: qué palabras distintas aparecen, cada una con su peso (pesa más), y cuántas veces. Las líneas que
 * devuelve son las que tienen alguna palabra y, primero, las que además suenan a decisión. Pura.
 */
export function puntuar(texto, palabras, pesos = {}) {
  const norm = normalizar(texto)
  const claves = palabras.map(normalizar).filter(Boolean)
  const presentes = claves.filter((p) => norm.includes(p))
  if (!presentes.length) return null
  const veces = claves.reduce((s, p) => s + norm.split(p).length - 1, 0)
  const distintas = presentes.reduce((s, p) => s + (pesos[p] ?? 1), 0)
  // Sin el encabezado del archivo (name/description/metadata): la descripción ya se muestra aparte.
  const cuerpo = texto.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  const lineas = cuerpo.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const conPalabra = lineas.filter((l) => claves.some((p) => normalizar(l).includes(p)))
  const ordenadas = [
    ...conPalabra.filter((l) => SEÑAL_DE_DECISION.test(normalizar(l))),
    ...conPalabra.filter((l) => !SEÑAL_DE_DECISION.test(normalizar(l))),
  ]
  return { puntaje: Math.round(distintas * 100) + veces, lineas: ordenadas.slice(0, 3).map((l) => (l.length > 240 ? `${l.slice(0, 240)}…` : l)) }
}

function descripcionDe(texto) {
  const m = texto.match(/^description:\s*"?(.+?)"?\s*$/m)
  return m ? m[1] : ''
}

function carpetaMemoria() {
  if (process.env.CONSEJO_MEMORIA) return process.env.CONSEJO_MEMORIA
  // En un worktree, el checkout principal es el padre del .git común: la memoria es la de ese proyecto.
  const comun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim()
  return join(homedir(), '.claude', 'projects', slugDeProyecto(dirname(comun)), 'memory')
}

function fuentes() {
  const salida = []
  const mem = carpetaMemoria()
  if (existsSync(mem)) {
    for (const f of readdirSync(mem)) if (/^(feedback|project)_.+\.md$/.test(f)) salida.push({ origen: `memoria/${f}`, ruta: join(mem, f) })
  } else {
    console.error(`(sin memoria en ${mem}: solo docs/design-decisions)`)
  }
  const dd = join(process.cwd(), 'docs', 'design-decisions')
  if (existsSync(dd)) for (const f of readdirSync(dd)) if (f.endsWith('.md') && !f.startsWith('_')) salida.push({ origen: `docs/design-decisions/${f}`, ruta: join(dd, f) })
  return salida
}

/**
 * Peso de cada palabra según qué tan rara es entre todos los documentos (IDF): «borrador» u «organizador» aparecen en
 * medio archivo y casi no distinguen; «quién anota» sí. Una palabra que está en todos pesa poco, nunca cero. Pura.
 */
export function pesosPorRareza(palabras, docs) {
  const n = docs.length || 1
  const pesos = {}
  for (const p of palabras.map(normalizar).filter(Boolean)) {
    const df = docs.filter((d) => normalizar(d.texto).includes(p)).length
    pesos[p] = Math.log((n + 1) / (df + 1)) + 0.1
  }
  return pesos
}

export function buscarDecisiones(palabras, docs, max = 10) {
  const pesos = pesosPorRareza(palabras, docs)
  return docs
    .map((d) => ({ ...d, r: puntuar(d.texto, palabras, pesos) }))
    .filter((d) => d.r)
    .sort((a, b) => b.r.puntaje - a.r.puntaje)
    .slice(0, max)
}

function main() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--max')
  const max = i >= 0 ? Number(args[i + 1]) || 10 : 10
  const palabras = args.filter((a, j) => a !== '--max' && j !== i + 1)
  if (!palabras.length) {
    console.error('uso: node scripts/consejo/decisiones-previas.mjs <palabra> [<palabra> ...] [--max 10]')
    process.exit(2)
  }
  const docs = fuentes().map((f) => ({ ...f, texto: readFileSync(f.ruta, 'utf8') }))
  const hallados = buscarDecisiones(palabras, docs, max)
  console.log(`## Decisiones previas sobre: ${palabras.join(', ')}\n`)
  if (!hallados.length) {
    console.log('- Ninguna registrada.')
    return
  }
  for (const h of hallados) {
    const desc = descripcionDe(h.texto)
    console.log(`- **${basename(h.origen)}**${desc ? ` — ${desc}` : ''}`)
    for (const l of h.r.lineas) console.log(`  > ${l}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
