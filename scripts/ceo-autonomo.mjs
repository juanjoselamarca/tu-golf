#!/usr/bin/env node
/**
 * scripts/ceo-autonomo.mjs
 *
 * CEO Autónomo — scheduler local que lanza 5 sesiones de Claude Code al día.
 * Cada sesión tiene un rol especializado. Autonomía total: diagnostica, construye,
 * fixea, mergea, deploya, reporta.
 *
 * Uso:
 *   node scripts/ceo-autonomo.mjs            # corre en modo scheduler (espera horarios)
 *   node scripts/ceo-autonomo.mjs --now 1     # corre agente 1 (flow-e2e) inmediatamente
 *   node scripts/ceo-autonomo.mjs --now all   # corre todos los agentes secuencialmente
 *   node scripts/ceo-autonomo.mjs --dry-run   # muestra schedule sin ejecutar
 */

import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, symlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// ─── Configuración ─────────────────────────────────────────────────────────────

const AGENTS = [
  { id: 1, name: 'flow-e2e',              hour: 9,  min: 0,  prefix: 'feat', timeout: 60 },
  { id: 2, name: 'dead-end-hunter',       hour: 11, min: 30, prefix: 'feat', timeout: 60 },
  { id: 3, name: 'qa-design',             hour: 14, min: 0,  prefix: 'fix',  timeout: 60 },
  { id: 4, name: 'refactor-security-data', hour: 16, min: 30, prefix: 'fix',  timeout: 60 },
  { id: 5, name: 'resumen-ceo',           hour: 18, min: 0,  prefix: null,   timeout: 15 },
];

const LOGS_DIR = resolve(REPO_ROOT, '.claude/ceo-logs');
const PROMPTS_DIR = resolve(REPO_ROOT, 'scripts/ceo-prompts');
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

// ─── Worktree helpers ───────────────────────────────────────────────────────────

function createWorktree(slug, prefix) {
  const wtSlug = `ceo-${slug}`;
  const wtPath = resolve(REPO_ROOT, `.claude/worktrees/${wtSlug}`);

  // Cleanup si quedó de una corrida anterior
  if (existsSync(wtPath)) {
    try { sh(`git worktree remove "${wtPath}" --force`); } catch {}
    try { sh(`git branch -D ${prefix}/${wtSlug}-claude`); } catch {}
  }

  sh('git fetch origin main');
  sh(`node scripts/setup-worktree.mjs ${wtSlug} ${prefix}`);

  // Junction de node_modules
  const nmTarget = resolve(REPO_ROOT, 'node_modules');
  const nmLink = resolve(wtPath, 'node_modules');
  if (!existsSync(nmLink)) {
    try {
      symlinkSync(nmTarget, nmLink, 'junction');
    } catch (e) {
      log(`⚠ Junction de node_modules falló: ${e.message}. node_modules no disponible en worktree.`);
    }
  }

  return { wtPath, wtSlug, branch: `${prefix}/${wtSlug}-claude` };
}

function cleanupWorktree(wtSlug, branch) {
  const wtPath = resolve(REPO_ROOT, `.claude/worktrees/${wtSlug}`);
  const nmLink = resolve(wtPath, 'node_modules');

  try { sh(`cmd /c "rmdir "${nmLink.replace(/\//g, '\\')}""`); } catch {}
  try { sh(`git worktree remove "${wtPath}" --force`); } catch {}
  try { sh(`git branch -D ${branch}`); } catch {}
}

// ─── Ejecutar un agente ─────────────────────────────────────────────────────────

async function runAgent(agent) {
  const startTime = Date.now();
  log(`═══ Iniciando agente ${agent.id}: ${agent.name} ═══`);

  // Pull main antes de cada corrida
  try { sh('git pull origin main'); } catch (e) { log(`⚠ git pull falló: ${e.message}`); }

  // Leer prompt
  const promptFile = resolve(PROMPTS_DIR, `${agent.name}.md`);
  if (!existsSync(promptFile)) {
    log(`✘ Prompt no encontrado: ${promptFile}`);
    savePartial({ agent: agent.name, status: 'error', error: 'prompt not found', duration: 0 });
    return;
  }

  let prompt = readFileSync(promptFile, 'utf8');

  // Inyectar variables dinámicas
  prompt = prompt
    .replace('{{DATE}}', todayStr())
    .replace('{{DAY_OF_WEEK}}', getDayOfWeek())
    .replace('{{REPO_ROOT}}', REPO_ROOT);

  // Si el agente es resumen-ceo, inyectar los parciales del día
  if (agent.name === 'resumen-ceo') {
    const partials = loadPartials();
    prompt = prompt.replace('{{PARTIALS_JSON}}', JSON.stringify(partials, null, 2));
  }

  // Crear worktree si el agente modifica código
  let worktree = null;
  if (agent.prefix) {
    try {
      worktree = createWorktree(agent.name, agent.prefix);
      prompt = prompt.replace('{{WORKTREE_PATH}}', worktree.wtPath);
      prompt = prompt.replace('{{BRANCH}}', worktree.branch);
    } catch (e) {
      log(`✘ Error creando worktree: ${e.message}`);
      savePartial({ agent: agent.name, status: 'error', error: `worktree: ${e.message}`, duration: 0 });
      return;
    }
  }

  // Log file para esta corrida
  const logFile = resolve(LOGS_DIR, `${todayStr()}-${String(agent.hour).padStart(2, '0')}${String(agent.min).padStart(2, '0')}-${agent.name}.log`);

  // Lanzar claude como child process
  const result = await new Promise((resolvePromise) => {
    const timeoutMs = agent.timeout * 60 * 1000;
    let output = '';
    let killed = false;

    const cwd = worktree ? worktree.wtPath : REPO_ROOT;

    const child = spawn('claude', [
      '-p', prompt,
      '--output-format', 'text',
      '--max-turns', '50',
      '--dangerously-skip-permissions',
      '--verbose',
    ], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });

    const timer = setTimeout(() => {
      killed = true;
      log(`⚠ Timeout (${agent.timeout}min) para ${agent.name}. Matando proceso.`);
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(logFile, output);
      resolvePromise({
        code,
        killed,
        output,
        logFile,
      });
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

  // Guardar parcial
  const status = result.killed ? 'timeout' : (result.code === 0 ? 'ok' : 'error');
  savePartial({
    agent: agent.name,
    status,
    exitCode: result.code,
    duration: durationMin,
    logFile: result.logFile,
    timestamp: new Date().toISOString(),
  });

  log(`═══ Agente ${agent.name}: ${status} (${durationMin} min) ═══`);
}

// ─── Scheduler principal ────────────────────────────────────────────────────────

function msUntil(hour, min) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, min, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

function formatMs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

async function runScheduler() {
  log('CEO Autónomo — Scheduler iniciado');
  log(`Fecha: ${todayStr()}, día: ${getDayOfWeek()}`);

  for (const agent of AGENTS) {
    log(`  Agente ${agent.id} (${agent.name}): ${String(agent.hour).padStart(2, '0')}:${String(agent.min).padStart(2, '0')}`);
  }

  // Encontrar el próximo agente a correr
  const scheduleNext = () => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const agent of AGENTS) {
      const agentMinutes = agent.hour * 60 + agent.min;
      if (agentMinutes > nowMinutes) {
        const ms = msUntil(agent.hour, agent.min);
        log(`Próximo: ${agent.name} en ${formatMs(ms)}`);
        setTimeout(async () => {
          await runAgent(agent);
          scheduleNext();
        }, ms);
        return;
      }
    }

    // Todos los agentes de hoy ya pasaron — programar el primero de mañana
    const first = AGENTS[0];
    const ms = msUntil(first.hour, first.min);
    log(`Todos los agentes de hoy terminaron. Próximo: ${first.name} mañana en ${formatMs(ms)}`);
    setTimeout(async () => {
      await runAgent(first);
      scheduleNext();
    }, ms);
  };

  scheduleNext();
}

// ─── CLI ────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--dry-run')) {
  console.log('CEO Autónomo — Schedule del día:');
  console.log(`Fecha: ${todayStr()}, día: ${getDayOfWeek()}\n`);
  for (const agent of AGENTS) {
    const promptExists = existsSync(resolve(PROMPTS_DIR, `${agent.name}.md`));
    console.log(`  ${String(agent.hour).padStart(2, '0')}:${String(agent.min).padStart(2, '0')}  ${agent.name.padEnd(25)} ${promptExists ? '✓ prompt' : '✘ SIN PROMPT'}`);
  }
  process.exit(0);
}

if (args.includes('--now')) {
  const target = args[args.indexOf('--now') + 1];
  mkdirSync(LOGS_DIR, { recursive: true });

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

// Modo scheduler (default)
mkdirSync(LOGS_DIR, { recursive: true });
await runScheduler();
