#!/usr/bin/env node
/**
 * Expediente de revisión para `revisor-fable` (sección MODELOS de CLAUDE.md).
 *
 * MECÁNICO a propósito: lo arma un script, no el autor del cambio, para que el autor no
 * decida dónde mira el revisor. Trae el diff (nunca resumido), quién usa cada símbolo
 * tocado, candidatos de fuente canónica ya existente y el checklist fijo. El autor solo
 * aporta la intención (qué quiso hacer), en ≤150 palabras.
 *
 * Uso:
 *   node scripts/expediente-review.mjs --intencion "texto" [--base origin/main]
 *        [--desde <sha>] [--solo "src/golf,src/lib/data"] [--imagenes a.png,b.png] [--out ruta.md]
 *   --desde  → segunda vuelta: solo el delta desde ese commit (para un revisor NUEVO).
 *   --solo   → PR grande: un expediente por grupo de rutas (si supera ~60k tokens).
 *
 * Tests: solo la lista (el revisor los abre si quiere). Archivos con >400 líneas borradas
 * (refactor que mueve código): solo lo agregado + la versión anterior completa guardada en
 * `<out>.base/` para comparar (lo típico de un refactor es perder una guarda).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue
  const sig = argv[i + 1]
  args[argv[i].slice(2)] = sig !== undefined && !sig.startsWith('--') ? sig : 'true'
}
// core.quotepath=false: rutas con ñ/acentos llegan tal cual (si no, "dise\303\261o.md" y el diff sale vacío).
const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=false', ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const gitOk = (...a) => { try { return git(...a) } catch { return '' } }
// Todo relativo a la raíz del repo, aunque se corra desde un subdirectorio.
process.chdir(git('rev-parse', '--show-toplevel').trim())

const base = args.base ?? 'origin/main'
const rango = args.desde ? `${args.desde}..HEAD` : `${base}...HEAD`
const intencion = (args.intencion ?? '').trim()
if (!intencion || intencion === 'true') { console.error('Falta --intencion "qué quisiste hacer" (≤150 palabras).'); process.exit(1) }
if (intencion.split(/\s+/).length > 150) { console.error('La intención supera 150 palabras: di qué quisiste hacer, no dónde mirar.'); process.exit(1) }

const RUTAS = args.solo ? args.solo.split(',').map(s => s.trim()).filter(Boolean) : ['.']
const EXCLUIR = [':!**/__snapshots__/**', ':!package-lock.json', ':!graphify-out/**']
const ES_TEST = /(__tests__\/|\.test\.|\.spec\.)/
const out = args.out ?? `.claude/expedientes/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`
const baseRef = args.desde ?? git('merge-base', base, 'HEAD').trim()

// --no-renames: un renombre (típico de "el que toca, ordena") llega como borrado + agregado con rutas
// reales; con renames, numstat da `src/{viejo => nuevo}/x.ts` y el diff por archivo saldría vacío.
const stat = git('diff', '--no-renames', '--stat=120', rango, '--', ...RUTAS, ...EXCLUIR)
const commits = gitOk('log', '--oneline', args.desde ? `${args.desde}..HEAD` : `${base}..HEAD`)
const listar = rutas => git('diff', '--no-renames', '--numstat', rango, '--', ...rutas, ...EXCLUIR).split('\n').filter(Boolean)
  .map(l => { const [add, del, ...f] = l.split('\t'); return { add, del: Number(del) || 0, f: f.join('\t') } })
const numstat = listar(RUTAS)
const archivos = numstat.map(n => n.f)
const tests = archivos.filter(f => ES_TEST.test(f))
const imagenes = (args.imagenes ?? '').split(',').map(s => s.trim()).filter(Boolean)
// Sin diff solo se permite con imágenes (p. ej. /inbox juzgando variantes de diseño antes de commitear).
if (!archivos.length && !imagenes.length) { console.error(`Diff vacío para ${rango}.`); process.exit(1) }
// Con --solo, el revisor ve qué archivos NO entraron (para que no se pierdan por el recorte del autor).
const fuera = args.solo ? listar(['.']).map(n => n.f).filter(f => !archivos.includes(f)) : []
const sinCommit = gitOk('status', '--porcelain').split('\n').filter(l => l.trim() && !/^\?\? \.claude\//.test(l))
const lit = f => `:(literal)${f}`

// Diff por archivo de producción. Refactor con >400 líneas borradas: solo lo agregado + base guardada.
const grandes = []
const partes = []
for (const { add, del, f } of numstat) {
  if (ES_TEST.test(f)) continue
  if (del > 400) {
    const dest = join(`${out}.base`, f)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, gitOk('show', `${baseRef}:${f}`))
    grandes.push({ f, add, del, dest: resolve(dest) })
    partes.push(git('diff', '--no-renames', '--unified=0', rango, '--', lit(f)).split('\n').filter(x => !x.startsWith('-') || x.startsWith('---')).join('\n'))
  } else {
    partes.push(git('diff', '--no-renames', rango, '--', lit(f)))
  }
}
const diff = partes.join('\n')

// Zona crítica: fuente ÚNICA = .github/critical-zone-paths.txt (la misma que usa el guard del CI).
// Si falta el archivo se aborta: un "(ninguna)" falso haría saltarse la revisión obligatoria.
const PREFIJOS = (() => {
  try { return readFileSync('.github/critical-zone-paths.txt', 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')) }
  catch { console.error('Falta .github/critical-zone-paths.txt: no se puede determinar la zona crítica.'); process.exit(1) }
})()
const prod = archivos.filter(f => !ES_TEST.test(f))
// Sobre TODOS los archivos (tests incluidos), igual que el guard del CI: un PR de solo tests en zona
// crítica igual necesita el label fable-reviewed.
const zonas = PREFIJOS.filter(p => archivos.some(f => f.startsWith(p)))
const soloTestsEnZona = zonas.length > 0 && !PREFIJOS.some(p => prod.some(f => f.startsWith(p)))
// Pista adicional por nombre (no reemplaza a la lista): handicap/índice/scoring fuera de los prefijos.
const porNombre = prod.filter(f => !PREFIJOS.some(p => f.startsWith(p)) && /handicap|indice|stroke-index|leaderboard|scoring|billing|paywall|entitlement|rls/i.test(f))

// Líneas agregadas en código de producción.
const agregadas = []
let actual = null
for (const l of diff.split('\n')) {
  if (l.startsWith('+++ b/')) actual = l.slice(6)
  else if (l.startsWith('+') && !l.startsWith('+++') && actual && /\.(tsx?|mjs|js|sql)$/.test(actual)) agregadas.push([actual, l.slice(1)])
}

// 1) Símbolos de primer nivel definidos en el diff. Usos (sección 1) solo de los EXPORTADOS: los de primer
//    nivel no exportados (args, out…) generan cientos de líneas de ruido. Candidatos canónicos (2): todos.
const DEF = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+|type\s+|interface\s+|enum\s+)([A-Za-z_$][\w$]{2,})/
const simbolos = new Map()
const exportados = new Set()
for (const [f, l] of agregadas) {
  const m = l.match(DEF); if (!m) continue
  if (!simbolos.has(m[1])) simbolos.set(m[1], f)
  if (/^export\b/.test(l)) exportados.add(m[1])
}
const CODIGO = ['src/**/*.ts', 'src/**/*.tsx', 'scripts/**/*.mjs', 'supabase/**/*.sql']
const usos = [...simbolos].filter(([s]) => exportados.has(s)).map(([s, f]) => {
  const hits = gitOk('grep', '-n', '-w', s, '--', ...CODIGO).split('\n').filter(Boolean)
  const fuera = hits.filter(h => !h.startsWith(f + ':'))
  return { s, f, total: hits.length, fuera: fuera.slice(0, 12), resto: Math.max(0, fuera.length - 12) }
})

// 2) Candidatos de fuente canónica: exports existentes con palabras del nombre del símbolo nuevo.
const palabras = s => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_$]/g, ' ').toLowerCase().split(/\s+/).filter(w => w.length >= 5)
const candidatos = []
for (const [s, f] of simbolos) {
  const ws = palabras(s); if (!ws.length) continue
  const hits = gitOk('grep', '-n', '-i', '-E', `^export .*(${ws.join('|')})`, '--', 'src/golf', 'src/lib', ':!**/__tests__/**', ':!**/*.test.ts')
    .split('\n').filter(Boolean).filter(h => !h.startsWith(f + ':') && !new RegExp(`\\b${s.replace(/\$/g, '\\$')}\\b`).test(h))
  // Recorte por línea: un export de 2.000 caracteres (un prompt, una tabla) es ruido, no evidencia.
  if (hits.length) candidatos.push({ s, hits: hits.slice(0, 6).map(h => (h.length > 160 ? `${h.slice(0, 160)}…` : h)), resto: Math.max(0, hits.length - 6) })
}

// 3) Listas literales nuevas (posible lista canónica copiada) → ¿el mismo valor en otro lado?
const listas = []
for (const [f, l] of agregadas) {
  for (const m of l.matchAll(/\[\s*((?:'[^']+'|"[^"]+")(?:\s*,\s*(?:'[^']+'|"[^"]+"))+)\s*\]/g)) {
    const p = m[1].match(/'([^']+)'|"([^"]+)"/); const lit = p[1] ?? p[2]
    const otros = gitOk('grep', '-n', '-F', `'${lit}'`, '--', 'src', ':!**/__tests__/**', ':!**/*.test.ts')
      .split('\n').filter(Boolean).filter(h => !h.startsWith(f + ':'))
    listas.push({ f, lista: `[${m[1]}]`, otros: otros.slice(0, 6), resto: Math.max(0, otros.length - 6) })
  }
}

const lista = (xs, fmt) => xs.map(fmt).join('\n')
const mas = n => (n ? `\n  - … ${n} más` : '')
const F = '````'
const md = [
  `# Expediente de revisión — ${git('rev-parse', '--abbrev-ref', 'HEAD').trim()} (${rango}${args.solo ? ` · solo ${args.solo}` : ''})`,
  args.desde ? '\n**Segunda vuelta:** SOLO el delta desde la revisión anterior.' : '',
  `\n## Intención del autor (qué quiso hacer; no dice dónde mirar)\n${intencion}`,
  `\n## Zona crítica (.github/critical-zone-paths.txt)\n${zonas.length ? lista(zonas, z => `- ${z}`) : '- (ninguna)'}${soloTestsEnZona ? '\n(solo tests: el guard del CI igual exige el label fable-reviewed)' : ''}${porNombre.length ? `\nPosible zona crítica por nombre (fuera de la lista): ${porNombre.join(', ')}` : ''}`,
  sinCommit.length ? `\n**AVISO:** hay ${sinCommit.length} cambio(s) sin commit que NO están en este expediente.` : '',
  fuera.length ? `\n## Fuera de este expediente (--solo): no te los mostraron\n${lista(fuera, f => `- ${f}`)}` : '',
  `\n## Commits\n${F}\n${commits.trim()}\n${F}`,
  `\n## Archivos\n${F}\n${stat.trim()}\n${F}`,
  tests.length ? `\n## Tests tocados (no van en el diff; ábrelos si necesitas verificar cobertura)\n${lista(tests, t => `- ${t}`)}` : '',
  grandes.length ? `\n## Archivos con mucho código movido (en el diff va solo lo AGREGADO)\nVersión anterior completa para comparar (¿se perdió alguna guarda o caso?):\n${lista(grandes, g => `- ${g.f} (+${g.add} −${g.del}) → ${g.dest}`)}` : '',
  `\n## Símbolos definidos en el diff → usos fuera del archivo\n${usos.length ? lista(usos, u => `- \`${u.s}\` (${u.f}) — ${u.total} ocurrencias${u.fuera.length ? `\n${lista(u.fuera, h => `  - ${h.trim()}`)}${mas(u.resto)}` : ''}`) : '- (ninguno)'}`,
  `\n## Candidatos de fuente canónica ya existente (exports con palabras del nombre)\n${candidatos.length ? lista(candidatos, c => `- \`${c.s}\`:\n${lista(c.hits, h => `  - ${h.trim()}`)}${mas(c.resto)}`) : '- (ninguno)'}`,
  `\n## Listas literales nuevas → el mismo valor en otros archivos\n${listas.length ? lista(listas, x => `- ${x.f}: \`${x.lista}\`${x.otros.length ? `\n${lista(x.otros, h => `  - ${h.trim()}`)}${mas(x.resto)}` : ' — no aparece en otro lado'}`) : '- (ninguna)'}`,
  `\n## Checklist fijo (CLAUDE.md)
- Bugs y casos borde: vacíos, nulos, 9/18/27 hoyos, hoyo_inicio 10, 4 jugadores, nombres largos, sin red.
- Seguridad: RLS, quién lee/escribe qué, secretos, open redirect, service-role.
- Golf: contra reglas reales (WHS, course handicap 9h, stroke index, net, tee por jugador, match play).
- "Un concepto, una fuente": lista/predicado/umbral duplicado, predicado inconsistente, hardcode que ya existe canónico.
- Archivos protegidos: cambio mínimo; Navbar sin \`onAuthStateChange(async\` ni await que bloquee el render.
- CERO FALLOS: ¿qué pasa si esto falla en cancha, en medio de un torneo?`,
  imagenes.length ? `\n## Screenshots (390px, claro/oscuro, ya tomados)\n${lista(imagenes, i => `- ${resolve(i)}`)}\nChecklist visual: uso en cancha, Nielsen, WCAG 2.2 AA (contraste compositado), leyes de UX, estados completos, DESIGN.md, benchmark.` : '',
  `\n## Diff (producción)\n${F}diff\n${diff}\n${F}\n`,
].join('\n')

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, md)
const tokens = Math.round(md.length / 4)
console.log(`${resolve(out)}\n~${tokens.toLocaleString('es-CL')} tokens · ${archivos.length} archivos (${tests.length} tests) · zona crítica: ${zonas.length ? zonas.join(', ') : 'no'}`)
if (tokens > 60000) console.log('AVISO: expediente >60k tokens. Pártelo con --solo (un expediente y un revisor por grupo de rutas).')
