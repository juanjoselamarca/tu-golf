#!/usr/bin/env node
/**
 * Gasto de cupo por modelo y calidad de las revisiones (sección MODELOS de CLAUDE.md, v2 02-oct-2026).
 *
 * Lee los transcripts locales de Claude Code (~/.claude/projects/**.jsonl) y calcula el gasto en
 * USD-equivalente a precio API, que es proporcional al cupo del plan Max. Evalúa los criterios de
 * éxito de la v2: costo Y calidad (medir solo costo se auto-engaña: revisiones baratas que encuentran
 * menos parecen éxito).
 *
 * Uso: node scripts/uso-modelos.mjs [--desde 2026-10-02] [--hasta 2026-10-09]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const DESDE = new Date(`${arg('desde', new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10))}T00:00:00Z`)
const HASTA = new Date(`${arg('hasta', new Date(Date.now() + 864e5).toISOString().slice(0, 10))}T00:00:00Z`)
const ROOT = path.join(os.homedir(), '.claude', 'projects')

// USD por millón de tokens (input, output). Escritura de cache 1,25× input; relectura 0,1×.
const PRECIO = { fable: [10, 50], opus: [4, 20], sonnet: [2, 10], haiku: [1, 5] }
const familia = m => (/fable/i.test(m) ? 'fable' : /opus/i.test(m) ? 'opus' : /sonnet/i.test(m) ? 'sonnet' : /haiku/i.test(m) ? 'haiku' : null)
const costo = (fm, u) => {
  const [pi, po] = PRECIO[fm]
  return ((u.input_tokens ?? 0) * pi + (u.cache_creation_input_tokens ?? 0) * pi * 1.25 + (u.cache_read_input_tokens ?? 0) * pi * 0.1 + (u.output_tokens ?? 0) * po) / 1e6
}
const contexto = u => (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
const mediana = xs => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

function archivos(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n); const st = fs.statSync(p)
    if (st.isDirectory()) archivos(p, out)
    else if (n.endsWith('.jsonl') && st.mtime >= DESDE) out.push(p)
  }
  return out
}

const porDia = {}, porOrigen = {}, agentes = []
const vistos = new Set()
if (!fs.existsSync(ROOT)) { console.error(`No existe ${ROOT}: no hay transcripts de Claude Code en esta máquina.`); process.exit(1) }
for (const f of archivos(ROOT)) {
  const proyecto = path.relative(ROOT, f).split(path.sep)[0]
  const esSub = f.includes(`${path.sep}subagents${path.sep}`)
  const origen = /ceo/i.test(proyecto) ? 'nocturno' : /observer|claude-mem/i.test(proyecto) ? 'claude-mem' : esSub ? 'subagente' : 'hilo principal'
  const ag = { f, usd: 0, turnos: 0, arranque: null, fm: null, cierres: 0, texto: '', tools: 0 }
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!l) continue
    let o; try { o = JSON.parse(l) } catch { continue }
    const m = o.message
    if (!m?.usage || !m.model) continue
    const fm = familia(m.model); if (!fm) continue
    const ts = new Date(o.timestamp); if (ts < DESDE || ts >= HASTA) continue
    // Una respuesta del modelo llega partida en varios registros (uno por bloque) con el mismo id y
    // el mismo usage: el costo se cuenta UNA vez por respuesta, pero el contenido se lee siempre.
    const clave = `${m.id}:${o.requestId ?? ''}`
    if (!vistos.has(clave)) {
      vistos.add(clave)
      const usd = costo(fm, m.usage)
      const dia = ts.toISOString().slice(0, 10)
      porDia[dia] ??= {}; porDia[dia][fm] = (porDia[dia][fm] ?? 0) + usd
      porOrigen[`${origen} · ${fm}`] = (porOrigen[`${origen} · ${fm}`] ?? 0) + usd
      if (esSub) {
        ag.usd += usd; ag.turnos++; ag.fm = fm
        if (ag.arranque === null) ag.arranque = contexto(m.usage)
      }
    }
    if (esSub) {
      const txt = (m.content ?? []).filter(x => x.type === 'text').map(x => x.text).join(' ')
      if (txt) ag.texto += '\n' + txt
      // Cada end_turn es un cierre; más de uno = el agente se reanudó (SendMessage) y releyó todo.
      // Respuesta final = todo el texto desde el último tool_use (puede venir en varios registros).
      const usaTool = (m.content ?? []).some(x => x.type === 'tool_use')
      if (usaTool) ag.tramo = ''
      else if (txt) ag.tramo = (ag.tramo ?? '') + '\n' + txt
      if (m.stop_reason === 'end_turn') { ag.cierres++; ag.ultimo = ag.tramo }
      ag.tools += (m.content ?? []).filter(x => x.type === 'tool_use').length
    }
  }
  if (esSub && ag.turnos) agentes.push(ag)
}

const dias = Object.keys(porDia).sort()
const totalDe = d => Object.values(porDia[d]).reduce((a, b) => a + b, 0)
const total = dias.reduce((a, d) => a + totalDe(d), 0)
const fableTot = dias.reduce((a, d) => a + (porDia[d].fable ?? 0), 0)
const nDias = Math.max(1, dias.length)
const f0 = n => n.toFixed(0).padStart(5)

console.log(`\nGasto en USD-equivalente (∝ cupo) · ${DESDE.toISOString().slice(0, 10)} → ${new Date(HASTA - 1).toISOString().slice(0, 10)}\n`)
console.log('día          total  fable  opus  sonnet haiku  %fable')
for (const d of dias) {
  const r = porDia[d], t = totalDe(d)
  console.log(`${d} ${f0(t)} ${f0(r.fable ?? 0)} ${f0(r.opus ?? 0)} ${f0(r.sonnet ?? 0)} ${f0(r.haiku ?? 0)}   ${(((r.fable ?? 0) / t) * 100).toFixed(0)}%`)
}
console.log('\nPor origen:')
for (const [k, v] of Object.entries(porOrigen).sort((a, b) => b[1] - a[1])) console.log(`${f0(v)}  ${k}`)

const fables = agentes.filter(a => a.fm === 'fable')
// Veredicto = la última aparición de APROBADO/CAMBIOS/PASS/FAIL en lo que escribió el agente.
const veredicto = a => { const m = [...a.texto.matchAll(/\b(APROBADO|CAMBIOS|PASS|FAIL)\b/g)]; return m.length ? m[m.length - 1][1] : null }
const revisiones = fables.filter(a => veredicto(a))
const conCambios = revisiones.filter(a => ['CAMBIOS', 'FAIL'].includes(veredicto(a)))
// Hallazgos ≈ referencias concretas archivo:línea distintas en la respuesta final (cada hallazgo
// real cita dónde está; un "todo bien" genérico no). Proxy objetivo, comparable entre semanas.
const hallazgos = revisiones.map(a => new Set((a.ultimo ?? '').match(/[\w./[\]-]+\.(?:tsx?|mjs|js|sql|css|md):\d+/g) ?? []).size)
const reanudados = fables.filter(a => a.cierres > 1).length

console.log(`\nSubagentes Fable: ${fables.length} · revisiones con veredicto: ${revisiones.length}`)
console.log(`  costo mediano: USD ${mediana(fables.map(a => a.usd)).toFixed(1)} · turnos medianos: ${mediana(fables.map(a => a.turnos))} · arranque mediano: ${Math.round(mediana(fables.map(a => a.arranque)) / 1000)}k tokens`)
console.log(`  revisiones con CAMBIOS: ${conCambios.length}/${revisiones.length} · referencias archivo:línea por revisión (mediana): ${mediana(hallazgos)} · agentes reanudados: ${reanudados}`)

// Criterios de la v2 (costo). La calidad se compara contra la línea base (25-sep → 1-oct):
// revisiones con CAMBIOS y hallazgos por revisión NO deben caer; ningún P0 escapado de un PR revisado.
const ok = (c, txt) => console.log(`${c ? '  ✔' : '  ✘'} ${txt}`)
console.log('\nCriterios v2 (costo):')
ok(fableTot / nDias <= 20, `Fable promedio ≤ USD 20/día (hoy ${(fableTot / nDias).toFixed(0)})`)
ok(total ? fableTot / total <= 0.15 : true, `Fable ≤ 15 % del total (hoy ${total ? ((fableTot / total) * 100).toFixed(0) : 0} %)`)
ok(total / nDias <= 145, `Total ≤ USD 145/día (hoy ${(total / nDias).toFixed(0)})`)
ok(mediana(revisiones.map(a => a.usd)) <= 4, `Revisión Fable mediana ≤ USD 4 (hoy ${mediana(revisiones.map(a => a.usd)).toFixed(1)})`)
ok(mediana(revisiones.map(a => a.turnos)) <= 20, `Revisión Fable ≤ 20 turnos (hoy ${mediana(revisiones.map(a => a.turnos))})`)
ok(reanudados === 0, `0 revisores reanudados (hoy ${reanudados})`)
console.log('\nCalidad (comparar con la línea base: node scripts/uso-modelos.mjs --desde 2026-09-25 --hasta 2026-10-02):')
console.log('  revisiones con CAMBIOS y hallazgos por revisión no deben caer; 0 P0 escapados de PR revisado.')
