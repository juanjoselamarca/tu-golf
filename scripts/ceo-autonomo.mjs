#!/usr/bin/env node
/**
 * scripts/ceo-autonomo.mjs
 *
 * CEO Autónomo v2 — scheduler local que lanza 3 sesiones de Claude Code por noche.
 *
 * ARQUITECTURA: el scheduler NO es long-lived. Cada corrida es un proceso
 * independiente lanzado por Task Scheduler de Windows. Esto resuelve:
 *   1. Script viejo en memoria (siempre lee la versión actual del disco)
 *   2. Procesos duplicados (cada corrida termina al final)
 *   3. OOM por procesos acumulados
 *   4. Relanzamiento post-reinicio (Task Scheduler maneja eso)
 *
 * Task Scheduler ejecuta 3 tareas programadas (el resumen se auto-dispara):
 *   node scripts/ceo-autonomo.mjs --now 1   (00:00)  dead-end-hunter
 *   node scripts/ceo-autonomo.mjs --now 2   (02:30)  data-quality
 *   node scripts/ceo-autonomo.mjs --now 3   (05:00)  e2e-writer
 *   → resumen-ceo se auto-dispara tras agente 3 (~07:30, listo a las 8am)
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

// Global safety net: nunca morir silenciosamente.
// Bug real 16-sep-2026: e2e-writer murió sin log por TypeError no capturado.
process.on('unhandledRejection', (err) => {
  const msg = `🔴 CEO unhandledRejection: ${err?.message || err}`;
  console.error(msg);
  try {
    mkdirSync(resolve(REPO_ROOT, '.claude/ceo-logs'), { recursive: true });
    appendFileSync(
      resolve(REPO_ROOT, `.claude/ceo-logs/${new Date().toISOString().slice(0, 10)}-scheduler.log`),
      `[${new Date().toLocaleTimeString('es-CL')}] ${msg}\n`
    );
  } catch {}
});
process.on('uncaughtException', (err) => {
  const msg = `🔴 CEO uncaughtException: ${err?.message || err}\n${err?.stack || ''}`;
  console.error(msg);
  try {
    mkdirSync(resolve(REPO_ROOT, '.claude/ceo-logs'), { recursive: true });
    appendFileSync(
      resolve(REPO_ROOT, `.claude/ceo-logs/${new Date().toISOString().slice(0, 10)}-scheduler.log`),
      `[${new Date().toLocaleTimeString('es-CL')}] ${msg}\n`
    );
  } catch {}
  process.exit(1);
});

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
  // Horarios nocturnos espaciados 2.5h. Timeout = hard kill, maxTurns/maxBudget = soft stop.
  // El prompt incluye time-budget de 90min para que el agente cierre solo.
  // El timeout de 100min es red de seguridad si ignora el time-budget.
  // maxTurns: benchmark real = 31min/~25 turns. 80 turns cubre sesiones productivas
  // largas sin dejar al agente en loop infinito. data-quality no necesita Playwright
  // y termina en <20min, así que 60 turns basta.
  // maxBudget: cap de $4 USD por agente. El benchmark de 31min costó ~$2.
  // Un agente que gasta $4 sin terminar tiene un problema de scope, no de tiempo.
  { id: 1, name: 'dead-end-hunter',  hour: 0,  min: 0,  prefix: 'feat', timeout: 100, maxTurns: 80,  maxBudget: 4 },
  { id: 2, name: 'data-quality',     hour: 2,  min: 30, prefix: 'fix',  timeout: 100, maxTurns: 60,  maxBudget: 4 },
  { id: 3, name: 'e2e-writer',       hour: 5,  min: 0,  prefix: 'feat', timeout: 100, maxTurns: 80,  maxBudget: 4 },
  { id: 4, name: 'resumen-ceo',      hour: 7,  min: 30, prefix: null,   timeout: 10,  maxTurns: 20,  maxBudget: 1 },
];

const LAST_WORK_AGENT_ID = 3; // resumen-ceo se dispara tras este agente

const LOGS_DIR = resolve(REPO_ROOT, '.claude/ceo-logs');
const PROMPTS_DIR = resolve(REPO_ROOT, 'scripts/ceo-prompts');
const LOCK_DIR = resolve(REPO_ROOT, '.claude/ceo-locks');
// Nombre deliberadamente opaco para que Claude (con --dangerously-skip-permissions)
// no lo sobreescriba "helpfully". Bug real 16-sep-2026: el agente data-quality
// escribió un objeto {} al archivo "resumen-parcial.json" por iniciativa propia,
// corrompiendo el formato array que el orquestador espera.
const PARTIAL_FILE = () => resolve(LOGS_DIR, `${todayStr()}--orch-state.json`);

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
  try {
    const data = JSON.parse(readFileSync(f, 'utf8'));
    // Defensa: si un agente Claude sobreescribió el archivo con un objeto
    // en vez de array (bug 16-sep-2026), no explotar en .push()
    return Array.isArray(data) ? data : [];
  } catch { return []; }
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

function nukeWorktreeDir(wtPath, wtSlug) {
  // Paso 1: intentar git worktree remove
  try { sh(`git worktree remove "${wtPath}" --force`); } catch {}

  // Paso 2: si el directorio sigue (OneDrive lock), borrar por filesystem
  if (existsSync(wtPath)) {
    // En Windows, rmdir /s /q a veces funciona donde rm -rf no
    try { sh(`cmd /c "rmdir /s /q "${wtPath.replace(/\//g, '\\')}""`); } catch {}
  }
  if (existsSync(wtPath)) {
    try { sh(`rm -rf "${wtPath}"`); } catch {}
  }

  // Paso 3: limpiar entradas huérfanas en .git/worktrees/ (el verdadero bug)
  const gitWtBase = resolve(REPO_ROOT, '.git/worktrees');
  if (existsSync(gitWtBase)) {
    try {
      const entries = sh(`ls -1 "${gitWtBase}"`).split('\n').filter(Boolean);
      for (const entry of entries) {
        if (entry === wtSlug || entry.match(new RegExp(`^${wtSlug}(\\d+|-\\d+)$`))) {
          const entryPath = resolve(gitWtBase, entry);
          try { sh(`rm -rf "${entryPath}"`); } catch {}
        }
      }
    } catch {}
  }
  try { sh('git worktree prune'); } catch {}
}

function createWorktree(slug, prefix) {
  const wtSlug = `ceo-${slug}`;
  const wtPath = resolve(REPO_ROOT, `.claude/worktrees/${wtSlug}`);

  // Cleanup agresivo si quedó de corrida anterior
  if (existsSync(wtPath)) {
    log(`⚠ Worktree huérfano detectado: ${wtSlug}. Limpiando...`);
    nukeWorktreeDir(wtPath, wtSlug);
  }

  // Si TODAVÍA existe después de todo el esfuerzo, usar path alternativo con timestamp
  // en vez de abortar. OneDrive puede bloquear el dir pero no impide crear uno nuevo.
  let actualSlug = wtSlug;
  let actualPath = wtPath;
  if (existsSync(wtPath)) {
    const suffix = Date.now();
    actualSlug = `${wtSlug}-${suffix}`;
    actualPath = resolve(REPO_ROOT, `.claude/worktrees/${actualSlug}`);
    log(`⚠ Worktree huérfano ${wtSlug} bloqueado por OneDrive. Usando alternativo: ${actualSlug}`);
  }

  // Limpiar branch huérfana
  try { sh(`git branch -D ${prefix}/${actualSlug}-claude`, { stdio: 'pipe' }); } catch {}

  // Limpiar entradas .git/worktrees/ huérfanas aunque el dir físico ya no exista
  nukeWorktreeDir(actualPath, actualSlug);

  sh('git fetch origin main');

  if (actualSlug === wtSlug) {
    // Path normal — usar setup-worktree.mjs
    sh(`node scripts/setup-worktree.mjs ${actualSlug} ${prefix}`);
  } else {
    // Path alternativo — crear worktree directo (setup-worktree.mjs usa el slug como dir name)
    sh(`git worktree add "${actualPath}" -b ${prefix}/${actualSlug}-claude origin/main`);
    // Copiar .env.local
    const envSrc = resolve(REPO_ROOT, '.env.local');
    if (existsSync(envSrc)) {
      writeFileSync(resolve(actualPath, '.env.local'), readFileSync(envSrc));
    }
  }

  // Junction de node_modules
  const nmTarget = resolve(REPO_ROOT, 'node_modules');
  const nmLink = resolve(actualPath, 'node_modules');
  if (!existsSync(nmLink)) {
    try {
      symlinkSync(nmTarget, nmLink, 'junction');
    } catch (e) {
      log(`⚠ Junction de node_modules falló: ${e.message}`);
    }
  }

  return { wtPath: actualPath, wtSlug: actualSlug, branch: `${prefix}/${actualSlug}-claude` };
}

function cleanupWorktree(wtSlug, branch) {
  const wtPath = resolve(REPO_ROOT, `.claude/worktrees/${wtSlug}`);
  const nmLink = resolve(wtPath, 'node_modules');

  // Borrar junction de node_modules primero (bloquea rmdir del padre)
  try { sh(`cmd /c "rmdir "${nmLink.replace(/\//g, '\\')}""`); } catch {}

  // Usar la misma limpieza nuclear que createWorktree
  nukeWorktreeDir(wtPath, wtSlug);

  try { sh(`git branch -D ${branch}`); } catch {}
}

// ─── Safety: verificar PRs mergeadas sin smoke + auto-revert ────────────────────

async function safetyCheckMergedPRs() {
  // Retry: la red puede no estar lista (TLS handshake timeout al despertar del sleep).
  // Bug real 16-sep-2026: gh pr list falló por TLS timeout a las 5am.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const today = todayStr();
      const prsRaw = sh(`gh pr list --state merged --search "created:>=${today} ceo" --json number,title,mergeCommit,headRefName --limit 20`);
      const prs = JSON.parse(prsRaw || '[]');
      if (prs.length === 0) return;

      for (const pr of prs) {
        if (!pr.mergeCommit?.oid) continue;
        const sha = pr.mergeCommit.oid;

        try {
          const res = await fetch('https://golfersplus.vercel.app/', {
            method: 'GET',
            signal: AbortSignal.timeout(10000),
          });
          // Solo revertir si prod devuelve 5xx (error de servidor real).
          if (res.status < 500) {
            log(`✓ Smoke OK para PR #${pr.number} (HTTP ${res.status})`);
            continue;
          }

          log(`✘ Smoke FALLÓ para PR #${pr.number} (HTTP ${res.status}). Revirtiendo.`);
          await revertMerge(pr.number, sha);
        } catch (e) {
          // fetch falló (DNS, timeout, red caída). No asumir que prod está
          // rota — puede ser un problema local. Loguear y NO revertir.
          log(`⚠ Smoke inconcluso para PR #${pr.number}: ${e.message}. NO se revierte (puede ser red local).`);
        }
      }
      return; // éxito — salir del retry loop
    } catch (e) {
      if (attempt < 3) {
        log(`⚠ Safety check intento ${attempt}/3 falló: ${e.message}. Reintentando en 15s...`);
        await new Promise(r => setTimeout(r, 15000));
      } else {
        log(`⚠ Safety check falló tras 3 intentos: ${e.message}. Continuando sin check.`);
      }
    }
  }
}

async function revertMerge(prNumber, sha) {
  try {
    sh(`git pull origin main`);
    sh(`git revert --no-edit -m 1 ${sha}`);
    sh(`git push origin main`);
    const msg = `🚨 AUTO-REVERT: PR #${prNumber} revertida.\nSmoke post-deploy falló. Prod restaurado al estado anterior.`;
    log(msg);
    await sendTelegramAlert(msg);
  } catch (e) {
    const msg = `🔴 CRÍTICO: No pude revertir PR #${prNumber}.\nError: ${e.message}\nRevisar manualmente URGENTE.`;
    log(msg);
    await sendTelegramAlert(msg);
  }
}

// ─── Telegram ───────────────────────────────────────────────────────────────────
//
// Diseño v2: UN solo mensaje por noche, editado en vivo conforme termina cada agente.
// Excepción: alertas P0 (auto-revert, 5xx en prod) van como mensaje separado.
//
// El message_id del mensaje consolidado se guarda en el parcial del día.

const TELEGRAM_MSG_FILE = () => resolve(LOGS_DIR, `${todayStr()}-telegram-msg-id.txt`);

function getTelegramToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function getTelegramChatId() {
  return process.env.TELEGRAM_ADMIN_CHAT_ID;
}

async function sendTelegramNew(text) {
  try {
    const token = getTelegramToken();
    const chatId = getTelegramChatId();
    if (!token || !chatId) { log('⚠ Telegram vars no configuradas'); return null; }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const json = await res.json();
    if (!json.ok) { log(`⚠ Telegram error: ${JSON.stringify(json)}`); return null; }
    return json.result.message_id;
  } catch (e) {
    log(`⚠ Telegram fetch falló: ${e.message}`);
    return null;
  }
}

async function editTelegramMsg(messageId, text) {
  try {
    const token = getTelegramToken();
    const chatId = getTelegramChatId();
    if (!token || !chatId || !messageId) return;
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
    });
    const json = await res.json();
    if (!json.ok) log(`⚠ Telegram edit error: ${JSON.stringify(json)}`);
  } catch (e) {
    log(`⚠ Telegram edit falló: ${e.message}`);
  }
}

/** Alerta P0 separada — auto-reverts y caídas de prod */
async function sendTelegramAlert(msg) {
  await sendTelegramNew(msg);
}

function saveMsgId(id) {
  writeFileSync(TELEGRAM_MSG_FILE(), String(id));
}

function loadMsgId() {
  try { return parseInt(readFileSync(TELEGRAM_MSG_FILE(), 'utf8').trim(), 10) || null; } catch { return null; }
}

/** Construye el texto consolidado del mensaje único de la noche.
 *  Telegram tiene un límite duro de 4096 UTF-8 chars. Truncamos si excede. */
function buildConsolidatedMsg() {
  const MAX_CHARS = 4000; // margen de seguridad vs 4096
  const partials = loadPartials();
  const workAgents = AGENTS.filter(a => a.id <= LAST_WORK_AGENT_ID);

  let lines = [`🤖 CEO Autónomo — ${todayStr()}\n`];

  for (const agent of workAgents) {
    const partial = partials.find(p => p.agent === agent.name);
    if (!partial) {
      lines.push(`${agent.id}. ${agent.name.padEnd(20)} ⏳ pendiente`);
    } else {
      const emoji = partial.status === 'ok' ? '✅' : partial.status === 'timeout' ? '⏱️' : '❌';
      const dur = partial.duration != null ? `${partial.duration}min` : '';
      const prs = partial.prsMerged ? `${partial.prsMerged} PRs` : '';
      const extra = [dur, prs].filter(Boolean).join('  ');
      lines.push(`${agent.id}. ${agent.name.padEnd(20)} ${emoji} ${partial.status}  ${extra}`);
    }
  }

  // Resumen si ya corrió
  const resumenPartial = partials.find(p => p.agent === 'resumen-ceo');
  if (resumenPartial) {
    lines.push(`─────────────────────────`);
    if (resumenPartial.summary) {
      lines.push(resumenPartial.summary);
    } else {
      lines.push(`📊 Resumen: completado`);
    }
  }

  // Errores destacados
  const failed = partials.filter(p => p.status === 'error' || p.status === 'timeout');
  if (failed.length > 0) {
    lines.push(`\n⚠️ Fallidos: ${failed.map(f => f.agent).join(', ')}`);
  }

  let text = lines.join('\n');
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS - 20) + '\n\n[…truncado]';
  }
  return text;
}

/** Envía o edita el mensaje consolidado de la noche */
async function updateConsolidatedMsg() {
  const text = buildConsolidatedMsg();
  let msgId = loadMsgId();
  if (msgId) {
    await editTelegramMsg(msgId, text);
  } else {
    msgId = await sendTelegramNew(text);
    if (msgId) saveMsgId(msgId);
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
    return 'skipped';
  }

  try {
    // Safety check: verificar que no hay PRs mergeadas sin smoke
    await safetyCheckMergedPRs();

    // Auth check
    if (!checkAuth()) {
      const msg = `🚨 CEO Autónomo — Auth caída.\nNo puedo correr ${agent.name}.\nAbre una terminal y corre: claude`;
      log('✘ Auth check falló.');
      await sendTelegramAlert(msg);
      savePartial({ agent: agent.name, status: 'auth-failed', duration: 0, timestamp: new Date().toISOString() });
      await updateConsolidatedMsg();
      return 'error';
    }

    // Actualizar mensaje consolidado: agente arrancando
    savePartial({ agent: agent.name, status: 'running', duration: 0, timestamp: new Date().toISOString() });
    await updateConsolidatedMsg();
    // Quitar el partial "running" para que el final lo sobreescriba
    const partials = loadPartials();
    const withoutRunning = partials.filter(p => !(p.agent === agent.name && p.status === 'running'));
    writeFileSync(PARTIAL_FILE(), JSON.stringify(withoutRunning, null, 2));

    // Pull main
    try { sh('git pull origin main'); } catch (e) { log(`⚠ git pull falló: ${e.message}`); }

    // Leer prompt (SIEMPRE desde disco — nunca cacheado)
    const promptFile = resolve(PROMPTS_DIR, `${agent.name}.md`);
    if (!existsSync(promptFile)) {
      log(`✘ Prompt no encontrado: ${promptFile}`);
      savePartial({ agent: agent.name, status: 'error', error: 'prompt not found', duration: 0, timestamp: new Date().toISOString() });
      await updateConsolidatedMsg();
      return 'error';
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
        savePartial({ agent: agent.name, status: 'error', error: `worktree: ${e.message}`, duration: 0, timestamp: new Date().toISOString() });
        await updateConsolidatedMsg();
        return 'error';
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

      // Excluir ANTHROPIC_API_KEY del env para que claude use la sesión
      // logueada (plan Max) en vez de la API key (cupo separado con límite).
      const childEnv = { ...process.env };
      delete childEnv.ANTHROPIC_API_KEY;

      const cliArgs = [
        '-p', prompt,
        // stream-json en vez de text: con text, Claude no escribe a stdout
        // hasta terminar TODAS las turns. Si matamos el proceso por timeout,
        // el log queda en 0 bytes. Con stream-json cada chunk se emite en
        // tiempo real y podemos capturar output parcial.
        // Bug real 17-sep-2026: dead-end-hunter y e2e-writer = 0 bytes.
        // IMPORTANTE: stream-json requiere --verbose, sin él Claude CLI
        // crashea con exit 1 y 0 output. Descubierto en dry-test 17-sep.
        '--output-format', 'stream-json',
        '--verbose',
        '--max-turns', String(agent.maxTurns || 80),
        '--dangerously-skip-permissions',
      ];
      if (agent.maxBudget) {
        cliArgs.push('--max-budget-usd', String(agent.maxBudget));
      }

      const child = spawn('claude', cliArgs, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: childEnv,
      });

      // Capturar stream-json y extraer solo el texto de assistant para el log.
      // Cada línea es un JSON con type "assistant", "tool_use", "result", etc.
      // Guardamos todo raw para diagnóstico.
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

    // Actualizar mensaje consolidado
    await updateConsolidatedMsg();

    log(`═══ Agente ${agent.name}: ${status} (${durationMin} min) ═══`);

    // Si este es el último agente de trabajo, disparar resumen-ceo
    if (agent.id === LAST_WORK_AGENT_ID) {
      const resumen = AGENTS.find(a => a.name === 'resumen-ceo');
      if (resumen) {
        log('Disparando resumen-ceo automáticamente tras último agente...');
        await runAgent(resumen);
      }
    }

    return status;

  } catch (e) {
    // Catch: si algo explota (ej. parcial corrupto → push() falla),
    // registrar el error en partial + Telegram ANTES de propagar.
    // Bug real 16-sep-2026: e2e-writer murió sin log ni partial.
    const durationMin = Math.round((Date.now() - startTime) / 60000);
    log(`✘ Error no capturado en ${agent.name}: ${e.message}`);
    try {
      savePartial({
        agent: agent.name,
        status: 'error',
        error: e.message,
        duration: durationMin,
        timestamp: new Date().toISOString(),
      });
      await updateConsolidatedMsg();
    } catch (e2) {
      log(`✘ Ni siquiera pude guardar el error: ${e2.message}`);
    }

    // Si este era el último agente de trabajo, disparar resumen-ceo
    // aunque haya fallado — el resumen debe reflejar lo que pasó.
    if (agent.id === LAST_WORK_AGENT_ID) {
      const resumen = AGENTS.find(a => a.name === 'resumen-ceo');
      if (resumen) {
        log('Disparando resumen-ceo tras fallo del último agente...');
        try { await runAgent(resumen); } catch {}
      }
    }

    throw e; // propagar para que runWithRetry pueda reintentar
  } finally {
    releaseLock(agent.name);
  }
}

// ─── Retry wrapper ──────────────────────────────────────────────────────────────

const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutos

async function runWithRetry(agent) {
  let status;
  try {
    status = await runAgent(agent);
  } catch (e) {
    // runAgent ya guardó partial + actualizó Telegram en su catch.
    // Aquí solo decidimos si reintentar.
    log(`⟳ ${agent.name} lanzó excepción: ${e.message}. Reintentando en 5 minutos...`);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    try {
      await runAgent(agent);
    } catch (e2) {
      log(`✘ ${agent.name} falló en el retry también: ${e2.message}. Abandono.`);
    }
    return;
  }

  if (status === 'error' && agent.name !== 'resumen-ceo') {
    log(`⟳ ${agent.name} falló (exit code). Reintentando en 5 minutos...`);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    const retryStatus = await runAgent(agent);
    if (retryStatus === 'error') {
      log(`✘ ${agent.name} falló en el retry también. Abandono.`);
    }
  }
}

// ─── Catch-up: correr agentes anteriores que no corrieron ────────────────────

/** Devuelve IDs de agentes de trabajo que ya corrieron hoy (con partial guardado) */
function agentsRanToday() {
  const partials = loadPartials();
  const ranNames = new Set(partials.map(p => p.agent));
  return AGENTS.filter(a => a.id <= LAST_WORK_AGENT_ID && ranNames.has(a.name)).map(a => a.id);
}

/** Corre agentes de trabajo anteriores a `beforeId` que no corrieron hoy.
 *  Caso real 15-sep-2026: PC durmió, agents 2+3 nunca arrancaron. */
async function catchUpMissedAgents(beforeId) {
  const ran = new Set(agentsRanToday());
  const missed = AGENTS.filter(a => a.id < beforeId && a.id <= LAST_WORK_AGENT_ID && !ran.has(a.id));
  if (missed.length === 0) return;

  log(`⟳ Catch-up: ${missed.length} agente(s) anterior(es) no corrieron hoy: ${missed.map(a => a.name).join(', ')}`);
  for (const agent of missed) {
    await runWithRetry(agent);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
mkdirSync(LOGS_DIR, { recursive: true });

if (args.includes('--dry-run')) {
  console.log('CEO Autónomo v2 — Schedule nocturno:');
  console.log(`Fecha: ${todayStr()}, día: ${getDayOfWeek()}\n`);
  for (const agent of AGENTS) {
    const promptExists = existsSync(resolve(PROMPTS_DIR, `${agent.name}.md`));
    console.log(`  ${String(agent.hour).padStart(2, '0')}:${String(agent.min).padStart(2, '0')}  ${agent.name.padEnd(25)} timeout:${agent.timeout}m  ${promptExists ? '✓' : '✘ SIN PROMPT'}`);
  }
  process.exit(0);
}

if (args.includes('--status')) {
  console.log(`CEO Autónomo v2 — Estado de hoy (${todayStr()}):\n`);
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

// Dead man's switch: a las 08:00, verificar y RECUPERAR agentes perdidos.
// Bug real 15-sep-2026: PC durmió y solo corrió 1 de 3 agentes.
// Antes solo reportaba. Ahora re-corre los que faltan.
if (args.includes('--deadman')) {
  const ran = agentsRanToday();
  const workAgents = AGENTS.filter(a => a.id <= LAST_WORK_AGENT_ID);
  const missed = workAgents.filter(a => !ran.includes(a.id));

  if (missed.length === 0) {
    log(`Dead man's switch OK: ${ran.length}/${workAgents.length} agentes corrieron.`);
  } else if (ran.length === 0) {
    const msg = `⚠️ CEO Autónomo — NINGÚN agente corrió anoche.\nEl PC probablemente estuvo suspendido.\nEjecutando catch-up de los ${missed.length} agentes...`;
    log(msg);
    await sendTelegramAlert(msg);
    for (const agent of missed) {
      await runWithRetry(agent);
    }
  } else {
    const msg = `⚠️ CEO Autónomo — Solo ${ran.length}/${workAgents.length} agentes corrieron. Recuperando: ${missed.map(a => a.name).join(', ')}`;
    log(msg);
    await sendTelegramAlert(msg);
    for (const agent of missed) {
      await runWithRetry(agent);
    }
  }
  process.exit(0);
}

if (args.includes('--now')) {
  const target = args[args.indexOf('--now') + 1];

  try {
    if (target === 'all') {
      log('Modo --now all: corriendo todos los agentes secuencialmente');
      for (const agent of AGENTS) {
        await runWithRetry(agent);
      }
    } else {
      const id = parseInt(target, 10);
      const agent = AGENTS.find(a => a.id === id || a.name === target);
      if (!agent) {
        console.error(`Agente no encontrado: ${target}`);
        console.error('Disponibles:', AGENTS.map(a => `${a.id}=${a.name}`).join(', '));
        process.exit(1);
      }

      // Catch-up: si este NO es el primer agente, verificar que los anteriores
      // corrieron. Si el PC despertó tarde (sleep/hibernate), los anteriores
      // pueden haberse perdido. Bug real: 15-sep-2026, solo corrió agente 1.
      if (agent.id > 1 && agent.id <= LAST_WORK_AGENT_ID) {
        await catchUpMissedAgents(agent.id);
      }

      await runWithRetry(agent);
    }
  } catch (e) {
    // Global catch: si algo escapa de todos los try/catch internos,
    // loguear en vez de morir silenciosamente. Bug real: 16-sep-2026,
    // e2e-writer murió sin log por parcial corrupto.
    log(`🔴 Error fatal no capturado: ${e.message}`);
    log(`Stack: ${e.stack}`);
    try { await sendTelegramAlert(`🔴 CEO Autónomo — error fatal: ${e.message}`); } catch {}
  }
  process.exit(0);
}

// Sin argumentos → mostrar ayuda
console.log(`CEO Autónomo v2 — Uso:

  --now <id|name|all>   Correr un agente (o todos) ahora
  --dry-run             Mostrar schedule sin ejecutar
  --status              Mostrar qué corrió hoy

Task Scheduler ejecuta 3 tareas nocturnas (resumen-ceo se auto-dispara):
  node scripts/ceo-autonomo.mjs --now 1   (00:00) dead-end-hunter
  node scripts/ceo-autonomo.mjs --now 2   (02:30) data-quality
  node scripts/ceo-autonomo.mjs --now 3   (05:00) e2e-writer → dispara resumen al terminar

Registrar las tareas: scripts/setup-ceo-task.bat (admin)
`);
