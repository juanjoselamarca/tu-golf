#!/usr/bin/env node
/**
 * Diagnóstico automático de una caída (03-oct-2026). Juanjo: "no me interesa la alerta si tú no te enteras… te
 * tiene que saltar a ti". El monitor (uptime.mjs) reinicia la base y lanza esto en segundo plano al confirmar la
 * caída. Pasos:
 *   1. Junta la evidencia sin modelos (evidencia.mjs) y la guarda.
 *   2. Lanza una sesión de Claude de SOLO LECTURA (Read/Grep/Glob, sin MCP, sin Bash, sin escribir): no puede
 *      tocar código ni la base; solo razona sobre la evidencia y el runbook y devuelve un diagnóstico.
 *   3. El diagnóstico va a Telegram (Juanjo se entera del QUÉ y del PORQUÉ, no solo de "se cayó") y a la memoria
 *      de Claude: la próxima sesión interactiva parte sabiendo qué pasó.
 * Un solo diagnóstico por caída (lock de 60 min).
 *
 * Uso: node --env-file=.env.local scripts/monitor/incidente.mjs [--prueba]
 *   --prueba: no envía Telegram ni escribe la memoria real (escribe todo en la carpeta del incidente).
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { juntarEvidencia } from './evidencia.mjs'
import { runClaude } from '../ceo/runner.mjs'
import { sendNew } from '../ceo/telegram.mjs'
import { envParaClaude } from '../ceo/worktree.mjs'

const PRUEBA = process.argv.includes('--prueba')
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = join(process.env.LOCALAPPDATA ?? join(homedir(), '.golfersplus'), 'GolfersPlus', 'incidentes')
const LOCK = join(BASE, 'ultimo.lock')
const VENTANA_LOCK_MS = 60 * 60_000
const VENTANA_EN_CURSO_MS = 20 * 60_000
// Memoria de Claude Code para este repo: ~/.claude/projects/<ruta del repo, todo lo no alfanumérico → '-'>/memory
const MEMORIA = join(homedir(), '.claude', 'projects', REPO.replace(/[^A-Za-z0-9]/g, '-'), 'memory')

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dir = join(BASE, stamp)

function log(m) {
  const l = `${new Date().toISOString()} ${m}`
  console.log(l)
  try { mkdirSync(BASE, { recursive: true }); appendFileSync(join(BASE, 'incidentes.log'), l + '\n') } catch { /* no bloquea */ }
}

export function promptDiagnostico(rutaEvidencia) {
  return `Eres el CTO de guardia de Golfers+ (app de golf en producción: Next.js en Vercel + Supabase plan FREE, instancia Nano de ~0,5 GB).
El monitor acaba de confirmar una CAÍDA (en la evidencia, "chequeo_del_monitor" dice qué falló y cómo) y decidió si reiniciar la base. Tu trabajo es SOLO diagnosticar: no puedes
ejecutar comandos ni modificar nada (y no debes intentarlo).

1. Lee la evidencia: ${rutaEvidencia}
2. Lee el runbook y los incidentes anteriores en la memoria del proyecto si existen:
   ${join(MEMORIA, 'project_incidente_caida_02oct.md')} y ${join(MEMORIA, 'project_incidente_caida_supabase_02oct.md')}
3. Si necesitas contexto del código (p. ej. qué hace una ruta con muchos errores), búscalo en el repo con Grep/Read.

Responde en español de Chile (tú, sin voseo), para Juanjo, que no es técnico, en este formato exacto y en máximo 15 líneas:
QUÉ PASÓ: <cuándo empezó según los logs y qué dejó de funcionar>
CAUSA MÁS PROBABLE: <una frase> — EVIDENCIA: <los números concretos que la respaldan: swap, lectura de disco, iowait, errores por ruta, origen de la carga, commits/CI>
DESCARTADO: <qué causas revisaste y descartaste, p. ej. deploy reciente, CI, usuarios>
QUÉ HIZO EL SISTEMA: <mira chequeo_del_monitor.reinicio: "pedido" es la decisión y "ejecutado" si la API de Supabase lo aceptó ("detalle" dice por qué no). Si falta, dilo>
QUÉ RECOMIENDO: <1-2 acciones concretas para que no se repita; si no hay nada nuevo, dilo>
CONFIANZA: <alta | media | baja> y por qué.
No inventes datos: si una fuente de la evidencia tiene "error", dilo y baja la confianza.`
}

/** Texto final de una sesión `--output-format stream-json`. */
export function resultadoDe(salida) {
  let txt = null
  for (const l of salida.split('\n')) {
    if (!l.startsWith('{')) continue
    try { const o = JSON.parse(l); if (o.type === 'result' && typeof o.result === 'string') txt = o.result } catch { /* línea parcial */ }
  }
  return txt
}

async function main() {
  mkdirSync(BASE, { recursive: true })
  // Lock con estado. "en_curso" bloquea 20 min (evita dos diagnósticos simultáneos); "listo" bloquea 60 min (uno
  // por caída). Si el diagnóstico falla, el lock se borra: la próxima detección puede reintentar.
  // En --prueba no se toca el lock: si no, una caída real dentro de la hora siguiente quedaría sin diagnóstico.
  if (!PRUEBA) {
    let previo = null
    try { previo = JSON.parse(readFileSync(LOCK, 'utf8')) } catch { /* sin lock o corrupto */ }
    const edad = previo ? Date.now() - previo.at : Infinity
    if (previo?.estado === 'listo' && edad < VENTANA_LOCK_MS) { log('Ya hay un diagnóstico de esta caída (< 60 min): no lanzo otro.'); return }
    if (previo?.estado === 'en_curso' && edad < VENTANA_EN_CURSO_MS) { log('Hay un diagnóstico en curso (< 20 min): no lanzo otro.'); return }
    writeFileSync(LOCK, JSON.stringify({ estado: 'en_curso', at: Date.now() }))
  }
  mkdirSync(dir, { recursive: true })
  log(`Diagnóstico de caída → ${dir}`)

  const evidencia = await juntarEvidencia({ env: process.env, repoRoot: REPO })
  const rutaEv = join(dir, 'evidencia.json')
  // Qué chequeo del monitor falló y cómo (lo deja uptime.mjs al lanzar esto).
  try { evidencia.chequeo_del_monitor = JSON.parse(readFileSync(join(BASE, 'ultimo-chequeo.json'), 'utf8')) } catch { evidencia.chequeo_del_monitor = { error: 'sin datos del chequeo del monitor' } }
  writeFileSync(rutaEv, JSON.stringify(evidencia, null, 2))

  const res = await runClaude({
    prompt: (PRUEBA ? 'PRUEBA: esto NO es una caída real; diagnostica el estado actual con el mismo formato.\n\n' : '') + promptDiagnostico(rutaEv),
    // Sin ANTHROPIC_API_KEY (usa el plan Max) ni tokens de Supabase/Vercel: ver envParaClaude.
    cwd: REPO, env: envParaClaude(process.env), repoRoot: REPO,
    maxTurns: 25, timeoutMs: 12 * 60_000, logFile: join(dir, 'sesion.jsonl'), log,
    // SOLO LECTURA: sin Bash, sin Edit/Write, sin MCP (que podría escribir en la base), sin skills. La evidencia
    // y la memoria viven fuera del repo: --add-dir les da acceso y --allowedTools pre-aprueba las lecturas (en
    // modo no interactivo, una lectura que pide permiso deja la sesión colgada hasta el timeout: visto en la prueba).
    permisos: ['--tools', 'Read', 'Grep', 'Glob', '--allowedTools', 'Read', 'Grep', 'Glob', '--add-dir', dir, '--add-dir', MEMORIA,
      '--strict-mcp-config', '--disable-slash-commands', '--permission-mode', 'default'],
  })
  const informe = resultadoDe(res.output ?? '') ?? `(La sesión de diagnóstico no devolvió resultado: ${res.killed || res.code}. Evidencia en ${rutaEv})`
  writeFileSync(join(dir, 'informe.md'), informe)
  if (!PRUEBA) writeFileSync(LOCK, JSON.stringify({ estado: 'listo', at: Date.now() }))
  log('Informe escrito.')

  const titulo = `🩺 Golfers+ · diagnóstico automático de la caída (${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })})`
  if (PRUEBA) { log(`[PRUEBA] Telegram no enviado:\n${titulo}\n${informe}`); return }
  await sendNew(`${titulo}\n\n${informe}`.slice(0, 3900), log)

  // Memoria: la próxima sesión interactiva de Claude lo ve en su índice.
  try {
    const nombre = `project_incidente_auto_${stamp.slice(0, 16).replace(/-/g, '')}`
    writeFileSync(join(MEMORIA, `${nombre}.md`), `---\nname: ${nombre}\ndescription: Caída detectada y diagnosticada automáticamente el ${stamp}. Revisar si la causa se confirma.\nmetadata:\n  type: project\n---\n\n${informe}\n\nEvidencia completa: ${rutaEv}\nSesión: ${join(dir, 'sesion.jsonl')}\n**How to apply:** al iniciar, confirmar la causa con datos y cerrar o corregir este diagnóstico.\n`)
    appendFileSync(join(MEMORIA, 'MEMORY.md'), `\n- [🩺 Caída auto-diagnosticada ${stamp.slice(0, 16)}](${nombre}.md) — revisar al iniciar la próxima sesión.\n`)
    log('Memoria actualizada.')
  } catch (e) { log(`No pude escribir la memoria: ${e.message}`) }
}

if (process.argv[1]?.endsWith('incidente.mjs')) {
  main().catch(e => {
    log(`ERROR diagnóstico: ${e.stack || e.message}`)
    // Falló sin informe: se libera el lock para que la próxima detección pueda reintentar.
    if (!PRUEBA) { try { rmSync(LOCK, { force: true }) } catch { /* nada */ } }
  }).finally(() => setTimeout(() => process.exit(0), 200))
}
