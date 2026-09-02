#!/usr/bin/env node
/**
 * scripts/ceo-autonomo.mjs
 *
 * CEO Autónomo — scheduler local que lanza 5 sesiones de Claude Code al día.
 *
 * ARQUITECTURA: el scheduler NO es long-lived. Cada corrida es un proceso
 * independiente lanzado por Task Scheduler de Windows. Esto resuelve:
 *   1. Script viejo en memoria (siempre lee la versión actual del disco)
 *   2. Procesos duplicados (cada corrida termina al final)
 *   3. OOM por procesos acumulados
 *   4. Relanzamiento post-reinicio (Task Scheduler maneja eso)
 *
 * Task Scheduler ejecuta 5 tareas programadas, una por agente:
 *   node scripts/ceo-autonomo.mjs --now 1   (9:00)
 *   node scripts/ceo-autonomo.mjs --now 2   (11:30)
 *   node scripts/ceo-autonomo.mjs --now 3   (14:00)
 *   node scripts/ceo-autonomo.mjs --now 4   (16:30)
 *   node scripts/ceo-autonomo.mjs --now 5   (18:00)
 *
 * Uso manual:
 *   node scripts/ceo-autonomo.mjs --now 1     # corre agente 1 inmediatamente
 *   node scripts/ceo-autonomo.mjs --now all   # corre todos secuencialmente
 *   node scripts/ceo-autonomo.mjs --dry-run   # muestra schedule sin ejecutar
 *   node scripts/ceo-autonomo.mjs --status    # muestra qué corrió hoy
 *   node scripts/ceo-autonomo.mjs --kill      # mata procesos ceo-autonomo huérfanos
 */

import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// Cargar .env.local
const envPath = resolve(REPO_ROOT, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

// ─── Configuración ─────────────────────────────────────────────────────────────

const AGENTS = [
  { id: 1, name: 'flow-e2e',               hour: 9,  min: 0,  prefix: 'feat', timeout: 45 },
  { id: 2, name: 'dead-end-hunter',        hour: 11, min: 30, prefix: 'feat', timeout: 45 },
  { id: 3, name: 'refactor-security-data', hour: 14, min: 0,  prefix: 'fix',  timeout: 45 },
  { id: 4, name: 'qa-design',              hour: 16, min: 30, prefix: 'fix',  timeout: 45 },
  { id: 5, name: 'resumen-ceo',            hour: 18, min: 0,  prefix: null,   timeout: 10 },
];

const LOGS_DIR = resolve(REPO_ROOT, '.claude/ceo-logs');
const PROMPTS_DIR = resolve(REPO_ROOT, 'scripts/ceo-prompts');
const LOCK_DIR = resolve(REPO_ROOT, '.claude/ceo-locks');
const PARTIAL_FILE = () => resolve(LOGS_DIR, `${todayStr()}-resumen-parcial.json`);

// ─── Utilidades ─────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowStr() {
  return new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function log(msg) {
  const line = `[${nowStr()}] ${msg}`;
  console.log(line);
  mkdirSync(LOGS_DIR, { recursive: true });
  appendFileSync(resolve(LOGS_DIR, `${todayStr()}-scheduler.log`), line + '\n');
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function loadPartials() {
  const f = PARTIAL_FILE();
  if (!existsSync(f)) return [];
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return []; }
}

function savePartial(entry) {
  const partials = loadPartials();
  partials.push(entry);
  writeFileSync(PARTIAL_FILE(), JSON.stringify(partials, null, 2));
}

function getDayOfWeek() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}

// ─── Lock (previene que 2 corridas del mismo agente corran en paralelo) ────────

function acquireLock(agentName) {
  mkdirSync(LOCK_DIR, { recursive: true });
  const lockFile = resolve(LOCK_DIR, `${agentName}.lock`);
  if (existsSync(lockFile)) {
    // Verificar si el PID del lock sigue vivo
    try {
      const pid = readFileSync(lockFile, 'utf8').trim();
      sh(`kill -0 ${pid}`); // throws si el proceso no existe
      return false; // proceso vivo — no adquirir lock
    } catch {
      // Proceso muerto — lock stale, limpiar
      unlinkSync(lockFile);
    }
  }
  writeFileSync(lockFile, String(process.pid));
  return true;
}

function releaseLock(agentName) {
  const lockFile = resolve(LOCK_DIR, `${agentName}.lock`);
  try { unlinkSync(lockFile); } catch {}
}

// ─── Worktree helpers ───────────────────────────────────────────────────────────

function createWorktree(slug, prefix) {
  const wtSlug = `ceo-${slug}`;
  const wtPath = resolve(REPO_ROOT, `.claude/worktrees/${wtSlug}`);

  // Cleanup agresivo si quedó de corrida anterior
  if (existsSync(wtPath)) {
    try { sh(`git worktree remove "${wtPath}" --force`); } catch {}
    if (existsSync(wtPath)) {
      try { sh(`rm -rf "${wtPath}"`); } catch {}
      try { sh('git worktree prune'); } catch {}
    }
  }
  // Limpiar branch huérfana
  try { sh(`git branch -D ${prefix}/${wtSlug}-claude`, { stdio: 'pipe' }); } catch {}

  sh('git fetch origin main');
  sh(`node scripts/setup-worktree.mjs ${wtSlug} ${prefix}`);

  // Junction de node_modules
  const nmTarget = resolve(REPO_ROOT, 'node_modules');
  const nmLink = resolve(wtPath, 'node_modules');
  if (!existsSync(nmLink)) {
    try {
      symlinkSync(nmTarget, nmLink, 'junction');
    } catch (e) {
      log(`⚠ Junction de node_modules falló: ${e.message}`);
    }
  }

  return { wtPath, wtSlug, branch: `${prefix}/${wtSlug}-claude` };
}

function cleanupWorktree(wtSlug, branch) {
  const wtPath = resolve(REPO_ROOT, `.claude/worktrees/${wtSlug}`);
  const nmLink = resolve(wtPath, 'node_modules');

  try { sh(`cmd /c "rmdir "${nmLink.replace(/\//g, '\\')}""`); } catch {}
  try { sh(`git worktree remove "${wtPath}" --force`); } catch {}
  if (existsSync(wtPath)) {
    try { sh(`rm -rf "${wtPath}"`); } catch {}
    try { sh('git worktree prune'); } catch {}
  }
  try { sh(`git branch -D ${branch}`); } catch {}
}

// ─── Safety: verificar PRs mergeadas sin smoke + auto-revert ────────────────────

async function safetyCheckMergedPRs() {
  // Buscar PRs mergeadas hoy por agentes CEO
  try {
    const today = todayStr();
    const prsRaw = sh(`gh pr list --state merged --search "created:>=${today} ceo" --json number,title,mergeCommit,headRefName --limit 20`);
    const prs = JSON.parse(prsRaw || '[]');
    if (prs.length === 0) return;

    for (const pr of prs) {
      if (!pr.mergeCommit?.oid) continue;
      const sha = pr.mergeCommit.oid;

      // Smoke test: verificar que prod responde OK
      try {
        const healthRaw = sh('curl -s -o /dev/null -w "%{http_code}" https://golfersplus.vercel.app/api/admin/health-check');
        const httpCode = parseInt(healthRaw, 10);
        if (httpCode >= 200 && httpCode < 500) {
          log(`✓ Smoke OK para PR #${pr.number} (HTTP ${httpCode})`);
          continue;
        }

        // Prod no responde bien — revertir
        log(`✘ Smoke FALLÓ para PR #${pr.number} (HTTP ${httpCode}). Revirtiendo.`);
        await revertMerge(pr.number, sha);
      } catch (e) {
        log(`✘ Smoke error para PR #${pr.number}: ${e.message}. Revirtiendo.`);
        await revertMerge(pr.number, sha);
      }
    }
  } catch (e) {
    log(`⚠ Safety check falló: ${e.message}`);
  }
}

async function revertMerge(prNumber, sha) {
  try {
    sh(`git pull origin main`);
    sh(`git revert --no-edit ${sha}`);
    sh(`git push origin main`);
    const msg = `🚨 AUTO-REVERT: PR #${prNumber} revertida.\nSmoke post-deploy falló. Prod restaurado al estado anterior.`;
    log(msg);
    await sendTelegram(msg);
  } catch (e) {
    const msg = `🔴 CRÍTICO: No pude revertir PR #${prNumber}.\nError: ${e.message}\nRevisar manualmente URGENTE.`;
    log(msg);
    await sendTelegram(msg);
  }
}

// ─── Telegram ───────────────────────────────────────────────────────────────────

async function sendTelegram(msg) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!token || !chatId) { log('⚠ Telegram vars no configuradas'); return; }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg }),
    });
    const json = await res.json();
    if (!json.ok) log(`⚠ Telegram error: ${JSON.stringify(json)}`);
  } catch (e) {
    log(`⚠ Telegram fetch falló: ${e.message}`);
  }
}

// ─── Auth check ─────────────────────────────────────────────────────────────────

function checkAuth() {
  try {
    const out = sh('claude auth status --json');
    const status = JSON.parse(out);
    return status.loggedIn === true;
  } catch {
    return false;
  }
}

// ─── Ejecutar un agente ─────────────────────────────────────────────────────────

async function runAgent(agent) {
  const startTime = Date.now();
  log(`═══ Iniciando agente ${agent.id}: ${agent.name} ═══`);

  // Lock — prevenir corridas duplicadas
  if (!acquireLock(agent.name)) {
    log(`✘ ${agent.name} ya está corriendo (lock activo). Salteando.`);
    return;
  }

  try {
    // Safety check: verificar que no hay PRs mergeadas sin smoke
    await safetyCheckMergedPRs();

    // Auth check
    if (!checkAuth()) {
      const msg = `🚨 CEO Autónomo — Auth caída.\nNo puedo correr ${agent.name}.\nAbre una terminal y corre: claude`;
      log('✘ Auth check falló.');
      await sendTelegram(msg);
      savePartial({ agent: agent.name, status: 'auth-failed', duration: 0, timestamp: new Date().toISOString() });
      return;
    }

    // Notificar inicio
    await sendTelegram(`🟢 ${String(agent.hour).padStart(2,'0')}:${String(agent.min).padStart(2,'0')} — ${agent.name} arrancó`);

    // Pull main
    try { sh('git pull origin main'); } catch (e) { log(`⚠ git pull falló: ${e.message}`); }

    // Leer prompt (SIEMPRE desde disco — nunca cacheado)
    const promptFile = resolve(PROMPTS_DIR, `${agent.name}.md`);
    if (!existsSync(promptFile)) {
      log(`✘ Prompt no encontrado: ${promptFile}`);
      savePartial({ agent: agent.name, status: 'error', error: 'prompt not found', duration: 0 });
      return;
    }

    let prompt = readFileSync(promptFile, 'utf8');

    // Inyectar variables dinámicas
    prompt = prompt
      .replace(/\{\{DATE\}\}/g, todayStr())
      .replace(/\{\{DAY_OF_WEEK\}\}/g, getDayOfWeek())
      .replace(/\{\{REPO_ROOT\}\}/g, REPO_ROOT);

    // Inyectar parciales para resumen-ceo
    if (agent.name === 'resumen-ceo') {
      prompt = prompt.replace('{{PARTIALS_JSON}}', JSON.stringify(loadPartials(), null, 2));
    }

    // Crear worktree si el agente modifica código
    let worktree = null;
    if (agent.prefix) {
      try {
        worktree = createWorktree(agent.name, agent.prefix);
        prompt = prompt.replace(/\{\{WORKTREE_PATH\}\}/g, worktree.wtPath);
        prompt = prompt.replace(/\{\{BRANCH\}\}/g, worktree.branch);
      } catch (e) {
        log(`✘ Error creando worktree: ${e.message}`);
        savePartial({ agent: agent.name, status: 'error', error: `worktree: ${e.message}`, duration: 0 });
        return;
      }
    }

    // Log file
    const logFile = resolve(LOGS_DIR, `${todayStr()}-${String(agent.hour).padStart(2, '0')}${String(agent.min).padStart(2, '0')}-${agent.name}.log`);

    // Lanzar claude
    const result = await new Promise((resolvePromise) => {
      const timeoutMs = agent.timeout * 60 * 1000;
      let output = '';
      let killed = false;

      const cwd = worktree ? worktree.wtPath : REPO_ROOT;

      const child = spawn('claude', [
        '-p', prompt,
        '--output-format', 'text',
        '--max-turns', '100',
        '--dangerously-skip-permissions',
      ], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      const timer = setTimeout(() => {
        killed = true;
        log(`⚠ Timeout (${agent.timeout}min) para ${agent.name}. Matando.`);
        child.kill('SIGTERM');
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        writeFileSync(logFile, output);
        resolvePromise({ code, killed, output, logFile });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        writeFileSync(logFile, `SPAWN ERROR: ${err.message}\n${output}`);
        resolvePromise({ code: -1, killed: false, output: err.message, logFile });
      });
    });

    const durationMin = Math.round((Date.now() - startTime) / 60000);

    // Cleanup worktree
    if (worktree) {
      try { cleanupWorktree(worktree.wtSlug, worktree.branch); } catch {}
    }

    // Si fue timeout, verificar que no dejó algo roto en prod
    if (result.killed) {
      log('Post-timeout safety check...');
      await safetyCheckMergedPRs();
    }

    // Guardar resultado
    const status = result.killed ? 'timeout' : (result.code === 0 ? 'ok' : 'error');
    savePartial({
      agent: agent.name,
      status,
      exitCode: result.code,
      duration: durationMin,
      logFile: result.logFile,
      timestamp: new Date().toISOString(),
    });

    // Notificar fin
    const emoji = status === 'ok' ? '✅' : status === 'timeout' ? '⏱️' : '❌';
    await sendTelegram(`${emoji} ${agent.name} terminó (${status}, ${durationMin}min)`);

    log(`═══ Agente ${agent.name}: ${status} (${durationMin} min) ═══`);

  } finally {
    releaseLock(agent.name);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
mkdirSync(LOGS_DIR, { recursive: true });

if (args.includes('--dry-run')) {
  console.log('CEO Autónomo — Schedule:');
  console.log(`Fecha: ${todayStr()}, día: ${getDayOfWeek()}\n`);
  for (const agent of AGENTS) {
    const promptExists = existsSync(resolve(PROMPTS_DIR, `${agent.name}.md`));
    console.log(`  ${String(agent.hour).padStart(2, '0')}:${String(agent.min).padStart(2, '0')}  ${agent.name.padEnd(25)} timeout:${agent.timeout}m  ${promptExists ? '✓' : '✘ SIN PROMPT'}`);
  }
  process.exit(0);
}

if (args.includes('--status')) {
  console.log(`CEO Autónomo — Estado de hoy (${todayStr()}):\n`);
  const partials = loadPartials();
  if (partials.length === 0) {
    console.log('  Ningún agente ha corrido hoy.');
  } else {
    for (const p of partials) {
      const emoji = p.status === 'ok' ? '✅' : p.status === 'timeout' ? '⏱️' : '❌';
      console.log(`  ${emoji} ${p.agent.padEnd(25)} ${p.status.padEnd(12)} ${p.duration ?? 0}min`);
    }
  }
  // Mostrar qué falta
  const ran = new Set(partials.map(p => p.agent));
  const pending = AGENTS.filter(a => !ran.has(a.name));
  if (pending.length > 0) {
    console.log('\n  Pendientes:');
    for (const a of pending) {
      console.log(`  ⏳ ${a.name.padEnd(25)} ${String(a.hour).padStart(2,'0')}:${String(a.min).padStart(2,'0')}`);
    }
  }
  process.exit(0);
}

if (args.includes('--now')) {
  const target = args[args.indexOf('--now') + 1];

  if (target === 'all') {
    log('Modo --now all: corriendo todos los agentes secuencialmente');
    for (const agent of AGENTS) {
      await runAgent(agent);
    }
  } else {
    const id = parseInt(target, 10);
    const agent = AGENTS.find(a => a.id === id || a.name === target);
    if (!agent) {
      console.error(`Agente no encontrado: ${target}`);
      console.error('Disponibles:', AGENTS.map(a => `${a.id}=${a.name}`).join(', '));
      process.exit(1);
    }
    await runAgent(agent);
  }
  process.exit(0);
}

// Sin argumentos → mostrar ayuda (ya no es un daemon long-lived)
console.log(`CEO Autónomo — Uso:

  --now <id|name|all>   Correr un agente (o todos) ahora
  --dry-run             Mostrar schedule sin ejecutar
  --status              Mostrar qué corrió hoy

Task Scheduler ejecuta cada agente por separado:
  node scripts/ceo-autonomo.mjs --now 1   (9:00)
  node scripts/ceo-autonomo.mjs --now 2   (11:30)
  node scripts/ceo-autonomo.mjs --now 3   (14:00)
  node scripts/ceo-autonomo.mjs --now 4   (16:30)
  node scripts/ceo-autonomo.mjs --now 5   (18:00)

Registrar las tareas: node scripts/setup-ceo-task.bat
`);
