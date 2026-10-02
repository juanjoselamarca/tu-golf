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
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue
  const sig = argv[i + 1]
  args[argv[i].slice(2)] = sig !== undefined && !sig.startsWith('--') ? sig : 'true'
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const gitOk = (...a) => { try { return git(...a) } catch { return '' } }

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

const stat = git('diff', '--stat=120', rango, '--', ...RUTAS, ...EXCLUIR)
const commits = git('log', '--oneline', args.desde ? `${args.desde}..HEAD` : `${base}..HEAD`)
const numstat = git('diff', '--numstat', rango, '--', ...RUTAS, ...EXCLUIR).split('\n').filter(Boolean)
  .map(l => { const [add, del, ...f] = l.split('\t'); return { add, del: Number(del) || 0, f: f.join('\t') } })
const archivos = numstat.map(n => n.f)
const tests = archivos.filter(f => ES_TEST.test(f))
if (!archivos.length) { console.error(`Diff vacío para ${rango}.`); process.exit(1) }

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
    partes.push(git('diff', '--unified=0', rango, '--', f).split('\n').filter(x => !x.startsWith('-') || x.startsWith('---')).join('\n'))
  } else {
    partes.push(git('diff', rango, '--', f))
  }
}
const diff = partes.join('\n')

// Zona crítica (CLAUDE.md → MODELOS).
const CRITICA = [
  [/^src\/golf\/(core|formats)\//, 'motor de golf (core/formats)'],
  [/handicap|indice|stroke-index|leaderboard|scoring/i, 'handicap / índice / scoring / leaderboard'],
  [/^supabase\/migrations\//, 'migración SQL'],
  [/billing|paywall|entitlement|ProGate/i, 'paywall / pagos'],
  [/^src\/proxy\.ts$|^src\/components\/Navbar\.tsx$|^src\/app\/layout\.tsx$|^src\/lib\/supabase\.ts$/, 'ARCHIVO PROTEGIDO'],
]
const zonas = [...new Set(archivos.filter(f => !ES_TEST.test(f)).flatMap(f => CRITICA.filter(([re]) => re.test(f)).map(([, n]) => n)))]

// Líneas agregadas en código de producción.
const agregadas = []
let actual = null
for (const l of diff.split('\n')) {
  if (l.startsWith('+++ b/')) actual = l.slice(6)
  else if (l.startsWith('+') && !l.startsWith('+++') && actual && /\.(tsx?|mjs|js|sql)$/.test(actual)) agregadas.push([actual, l.slice(1)])
}

// 1) Símbolos exportados o de primer nivel definidos en el diff → usos (las variables locales son ruido).
const DEF = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+|type\s+|interface\s+|enum\s+)([A-Za-z_$][\w$]{2,})/
const simbolos = new Map()
for (const [f, l] of agregadas) { const m = l.match(DEF); if (m && !simbolos.has(m[1])) simbolos.set(m[1], f) }
const CODIGO = ['src/**/*.ts', 'src/**/*.tsx', 'scripts/**/*.mjs', 'supabase/**/*.sql']
const usos = [...simbolos].map(([s, f]) => {
  const hits = gitOk('grep', '-n', '-w', s, '--', ...CODIGO).split('\n').filter(Boolean)
  const fuera = hits.filter(h => !h.startsWith(f + ':'))
  return { s, f, total: hits.length, fuera: fuera.slice(0, 12), resto: Math.max(0, fuera.length - 12) }
})

// 2) Candidatos de fuente canónica: exports existentes con palabras del nombre del símbolo nuevo.
const palabras = s => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_$]/g, ' ').toLowerCase().split(/\s+/).filter(w => w.length >= 5)
const candidatos = []
for (const { s, f } of usos) {
  const ws = palabras(s); if (!ws.length) continue
  const hits = gitOk('grep', '-n', '-i', '-E', `^export .*(${ws.join('|')})`, '--', 'src/golf', 'src/lib', ':!**/__tests__/**', ':!**/*.test.ts')
    .split('\n').filter(Boolean).filter(h => !h.startsWith(f + ':') && !new RegExp(`\\b${s.replace(/\$/g, '\\$')}\\b`).test(h))
  if (hits.length) candidatos.push({ s, hits: hits.slice(0, 6), resto: Math.max(0, hits.length - 6) })
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
const imagenes = (args.imagenes ?? '').split(',').map(s => s.trim()).filter(Boolean)
const F = '````'
const md = [
  `# Expediente de revisión — ${git('rev-parse', '--abbrev-ref', 'HEAD').trim()} (${rango}${args.solo ? ` · solo ${args.solo}` : ''})`,
  args.desde ? '\n**Segunda vuelta:** SOLO el delta desde la revisión anterior.' : '',
  `\n## Intención del autor (qué quiso hacer; no dice dónde mirar)\n${intencion}`,
  `\n## Zona crítica\n${zonas.length ? lista(zonas, z => `- ${z}`) : '- (ninguna detectada por ruta)'}`,
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
