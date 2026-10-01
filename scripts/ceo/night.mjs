/**
 * scripts/ceo/night.mjs — orquestación de la noche (v4).
 *
 * "Trabaja hasta que se acabe el cupo y después retoma" (Juanjo, 30-sep-2026):
 *   - Una cola persistente por noche (state.mjs). Cada proceso hace lo que puede y sale.
 *   - Límite de 5 h → el trabajo queda en pausa, se registra una tarea de Windows
 *     con WakeToRun para el reset y el proceso termina. La tarea relanza `--night`.
 *   - Límite semanal / techo dinámico → la cola se congela; la noche siguiente retoma
 *     lo pausado antes de empezar trabajo nuevo.
 *   - Error real o timeout → nunca se reintenta.
 *   - Sin corte a las 08:00. El briefing no sale antes de las 07:30 (QUIET_UNTIL).
 *
 * Plan: docs/superpowers/plans/2026-10-01-scheduler-nocturno-v4.md
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import {
  probeQuota, decideStart, weeklyBlock, canStartExtraRound, mergeQuota, measuredDailyUse,
  DEFAULT_DAILY_USE, WAIT_MARGIN_MS, pct,
} from './quota.mjs';
import { classifyAttempt, scanViolations } from './failure.mjs';
import {
  createNight, carryOver, nextJob, addRound, applyAttempt, freezeWeekly,
  notify, summarizeJobs, loadJson, saveJson, TERMINAL, MAX_WAITS_PER_NIGHT,
} from './state.mjs';
import {
  scheduleResume, clearResume, resumeScheduledAt, listClaudeCli, killTree,
  acquirePidLock, releasePidLock, lockHolder,
} from './windows.mjs';
import { ensureWorktree, headFingerprint, removeWorktree, STRIPPED_ENV_KEYS, worktreesDir } from './worktree.mjs';
import { runClaude, claudeBin, claudeVersion, versionLt } from './runner.mjs';
import { sendNew, editIfChanged, flushNotifications } from './telegram.mjs';
import { startSqlProxy } from './sql-proxy.mjs';
import { createCoverage } from './coverage.mjs';

const NIGHT_MAX_AGE_MS = 22 * 60 * 60 * 1000;
const QUIET_UNTIL = { h: 7, m: 30 };
// Primera versión del CLI con `unifiedWindows` (cupo exacto). Más vieja = cupo estimado.
const MIN_CLI = '2.1.286';
const MAX_ATTEMPTS_PER_JOB = 8;
const START_MS = Date.now();

export function makeClock() {
  const base = process.env.CEO_NOW ? Number(process.env.CEO_NOW) : null;
  return () => (base ? base + (Date.now() - START_MS) : Date.now());
}

export function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ¿Ya pasó la hora desde la que se puede notificar sin despertar a Juanjo? */
export function quietPassed(ms) {
  const d = new Date(ms);
  return d.getHours() > QUIET_UNTIL.h || (d.getHours() === QUIET_UNTIL.h && d.getMinutes() >= QUIET_UNTIL.m)
    || d.getHours() >= 20; // de 20:00 a 23:59 Juanjo está despierto
}

/** Próximo instante con quietPassed (para programar el briefing). */
export function nextQuietEnd(ms) {
  if (quietPassed(ms)) return ms;
  const d = new Date(ms);
  d.setHours(QUIET_UNTIL.h, QUIET_UNTIL.m, 0, 0);
  return d.getTime();
}

export function createNightRunner(ctx) {
  const { repoRoot, logsDir, locksDir, promptsDir, scriptPath, agents, refreshAuth } = ctx;
  const now = ctx.now || makeClock();
  const nightsDir = resolve(logsDir, 'nights');
  const activeFile = resolve(locksDir, 'active-night.json');
  const nightLock = resolve(locksDir, 'night.lock');
  const pauseFile = resolve(locksDir, 'PAUSE');
  const historyFile = resolve(logsDir, 'quota-history.jsonl');
  const nightFile = id => resolve(nightsDir, `${id}.json`);
  const workAgents = agents.filter(a => a.prefix);
  const coverage = createCoverage({ promptsDir, logsDir, log });

  function log(msg) {
    const line = `[${new Date(now()).toLocaleTimeString('es-CL')}] ${msg}`;
    console.log(line);
    mkdirSync(logsDir, { recursive: true });
    appendFileSync(resolve(logsDir, `${localDate(now())}-scheduler.log`), line + '\n');
  }

  const save = night => saveJson(nightFile(night.nightId), night);

  function recordQuota(q, source) {
    if (!q?.seen) return;
    appendFileSync(historyFile, JSON.stringify({ at: new Date(now()).toISOString(), source, five: q.five, seven: q.seven, estimated: q.estimated }) + '\n');
  }

  function dailyUse() {
    try {
      const hist = readFileSync(historyFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
      return measuredDailyUse(hist) ?? DEFAULT_DAILY_USE;
    } catch { return DEFAULT_DAILY_USE; }
  }

  // ─── Apertura de la noche ──────────────────────────────────────────────────

  function openNight() {
    const active = loadJson(activeFile);
    const prev = active ? loadJson(nightFile(active.nightId)) : null;
    if (prev && prev.status !== 'done' && now() - Date.parse(prev.startedAt) < NIGHT_MAX_AGE_MS) {
      prev.status = 'running';
      log(`Retomando la noche ${prev.nightId}.`);
      return prev;
    }

    let carried = [];
    if (prev && !prev.carriedInto) {
      const co = carryOver(prev);
      carried = co.carried;
      for (const j of co.expired) {
        removeWorktree({ repoRoot, wtPath: j.wtPath, branch: j.branch });
        log(`Trabajo ${j.key} descartado: ${j.carriedNights} noches en pausa.`);
      }
      if (co.expired.length) notify(prev, `Se descartaron ${co.expired.length} trabajo(s) pausados por más de 3 noches: ${co.expired.map(j => j.agent).join(', ')}.`, { now: now() });
    }

    let nightId = localDate(now());
    for (let i = 2; existsSync(nightFile(nightId)); i++) nightId = `${localDate(now())}-${i}`;
    if (prev) {
      prev.carriedInto = nightId;
      prev.status = 'done';
      save(prev);
    }
    const night = createNight({ nightId, agents: workAgents.map(a => a.name), now: now(), carried });
    // Avisos de la noche anterior que no alcanzaron a salir
    if (prev) night.notifications.push(...prev.notifications.filter(n => !n.sent));
    save(night);
    saveJson(activeFile, { nightId });
    log(`Noche ${nightId} abierta: ${night.jobs.length} trabajo(s)${carried.length ? `, ${carried.length} retomado(s) de ${prev.nightId}` : ''}.`);
    return night;
  }

  // ─── Mensaje de estado (uno por noche, editado en silencio) ────────────────

  function statusText(night) {
    const icon = { ok: '✅', running: '🔄', pending: '⏳', paused_limit: '⏸️', paused_weekly: '🧊', failed_real: '❌', timeout: '⏱️', stuck: '🪨', expired: '🗑️' };
    const lines = [`🤖 CEO Autónomo — noche ${night.nightId}`];
    for (const j of night.jobs) {
      const n = j.attempts.length;
      lines.push(`${icon[j.status] || '•'} r${j.round} ${j.agent} — ${j.status}${n > 1 ? ` (${n} intentos)` : ''}${j.carriedFrom ? ` [retomado de ${j.carriedFrom}]` : ''}`);
    }
    if (night.status === 'waiting' && night.resumeAt) lines.push(`\n⏸️ En pausa por cupo. Retoma ${new Date(night.resumeAt).toLocaleString('es-CL')}.`);
    if (night.status === 'frozen_weekly') lines.push('\n🧊 Cola congelada por el límite semanal.');
    const q = night.lastQuota;
    if (q) lines.push(`\nCupo: 5 h ${pct(q.five.utilization)} · semanal ${pct(q.seven.utilization)}${q.estimated ? ' (estimado)' : ''}`);
    return lines.join('\n');
  }

  async function updateStatus(night) {
    const text = statusText(night);
    if (!night.statusMsgId) {
      night.statusMsgId = await sendNew(text, log, { silent: true });
      night.lastTelegramText = text;
    } else {
      night.lastTelegramText = await editIfChanged(night.statusMsgId, text, night.lastTelegramText, log);
    }
    save(night);
  }

  // ─── Seguridad post-merge (auto-revert en worktree propio, nunca en el checkout de Juanjo) ──

  async function safetyCheck(night) {
    let prs = [];
    try {
      const raw = execFileSync('gh', ['pr', 'list', '--state', 'merged', '--search', `created:>=${night.nightId.slice(0, 10)} ceo`, '--json', 'number,mergeCommit', '--limit', '20'], { cwd: repoRoot, encoding: 'utf8', timeout: 60000, windowsHide: true });
      prs = JSON.parse(raw || '[]');
    } catch (e) { log(`⚠ Safety check: gh falló (${e.message.slice(0, 120)}). Sigo sin check.`); return; }
    night.revertedPrs = night.revertedPrs || [];
    for (const pr of prs) {
      const sha = pr.mergeCommit?.oid;
      if (!sha || night.revertedPrs.includes(pr.number)) continue;
      let status;
      try { status = (await fetch('https://golfersplus.vercel.app/', { signal: AbortSignal.timeout(10000) })).status; }
      catch (e) { log(`⚠ Smoke inconcluso #${pr.number}: ${e.message}. No se revierte.`); continue; }
      if (status < 500) continue;
      log(`✘ Prod responde ${status} tras PR #${pr.number}. Revirtiendo en worktree propio.`);
      const wtPath = resolve(worktreesDir(), `revert-${pr.number}`);
      try {
        execFileSync('git', ['fetch', 'origin', 'main'], { cwd: repoRoot, windowsHide: true });
        execFileSync('git', ['worktree', 'add', '--detach', wtPath, 'origin/main'], { cwd: repoRoot, windowsHide: true });
        execFileSync('git', ['revert', '--no-edit', '-m', '1', sha], { cwd: wtPath, windowsHide: true });
        execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: wtPath, windowsHide: true, timeout: 120000 });
        night.revertedPrs.push(pr.number);
        notify(night, `🚨 AUTO-REVERT: PR #${pr.number} revertido. Prod respondía ${status}.`, { now: now(), kind: 'p0' });
      } catch (e) {
        notify(night, `🔴 CRÍTICO: no pude revertir PR #${pr.number} (prod ${status}). ${e.message.slice(0, 200)}. Revisar URGENTE.`, { now: now(), kind: 'p0' });
      } finally {
        removeWorktree({ repoRoot, wtPath });
      }
    }
  }

  // ─── Un intento de un trabajo ──────────────────────────────────────────────

  function buildPrompt(job, wt, night) {
    let prompt = readFileSync(resolve(promptsDir, `${job.agent}.md`), 'utf8');
    const dow = new Date(now()).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    prompt = prompt
      .replace(/\{\{DATE\}\}/g, night.nightId)
      .replace(/\{\{DAY_OF_WEEK\}\}/g, dow)
      .replace(/\{\{REPO_ROOT\}\}/g, wt.wtPath)
      .replace(/\{\{WORKTREE_PATH\}\}/g, wt.wtPath)
      .replace(/\{\{BRANCH\}\}/g, wt.branch)
      .replace(/\{\{LOGS_DIR\}\}/g, logsDir);
    const cov = coverage.promptBlock({ agent: job.agent, round: job.round, nightId: night.nightId });
    prompt = prompt.includes('{{COVERAGE_BLOCK}}') ? prompt.replace(/\{\{COVERAGE_BLOCK\}\}/g, cov) : `${prompt}\n${cov}`;
    prompt += `\n${readFileSync(resolve(promptsDir, 'merge-rule.md'), 'utf8')}`;
    prompt += `\n${readFileSync(resolve(promptsDir, 'night-rules.md'), 'utf8')}`;
    if (job.attempts.length > 0 || job.carriedFrom) {
      prompt += [
        '',
        '## RETOMA — este trabajo quedó en pausa por límite de cupo y lo estás continuando',
        `Intento ${job.attempts.length + 1}${job.carriedFrom ? ` (empezó la noche ${job.carriedFrom})` : ''}. Tu worktree y tu rama ya tienen lo avanzado:`,
        '```bash',
        'git log --oneline origin/main..HEAD',
        'git status --short',
        `gh pr list --head ${wt.branch} --state all --json number,title,state,url`,
        'ls -t "$CEO_LOGS"/*-pendientes-*.md 2>/dev/null | head -5',
        '```',
        'No repitas lo que ya está hecho. Primero termina lo que quedó a medio camino (PR abierto, checks pendientes),',
        'después sigue con lo nuevo. Si ya no queda nada útil, documenta y termina.',
      ].join('\n');
    }
    return prompt;
  }

  function childEnv(sqlProxyUrl) {
    const env = { ...process.env };
    // Sin ANTHROPIC_API_KEY: usa la sesión del plan Max, no la API con cupo aparte.
    delete env.ANTHROPIC_API_KEY;
    for (const k of STRIPPED_ENV_KEYS) delete env[k];
    env.CEO_LOGS = logsDir;
    env.CEO_NIGHT = '1';
    if (sqlProxyUrl) env.CEO_SQL_PROXY = sqlProxyUrl;
    return env;
  }

  async function runJob(night, job, sqlProxyUrl) {
    const cfg = agents.find(a => a.name === job.agent);
    if (!cfg || !existsSync(resolve(promptsDir, `${job.agent}.md`))) {
      job.status = 'failed_real';
      notify(night, `Trabajo ${job.key}: no hay configuración o prompt para ${job.agent}.`, { now: now() });
      return {};
    }
    if (job.attempts.length >= MAX_ATTEMPTS_PER_JOB) {
      job.status = 'stuck';
      notify(night, `${job.agent} (r${job.round}) llegó a ${MAX_ATTEMPTS_PER_JOB} intentos; se deja.`, { now: now() });
      return {};
    }

    try { await safetyCheck(night); } catch (e) { log(`⚠ Safety check: ${e.message}`); }

    let wt;
    try {
      wt = ensureWorktree({ repoRoot, nightId: job.carriedFrom || night.nightId, agent: job.agent, round: job.round, prefix: cfg.prefix, existing: job });
    } catch (e) {
      job.status = 'failed_real';
      job.attempts.push({ n: job.attempts.length + 1, kind: 'real', error: `worktree: ${e.message.slice(0, 200)}`, at: new Date(now()).toISOString() });
      log(`✘ Worktree de ${job.agent}: ${e.message}`);
      return {};
    }
    job.wtPath = wt.wtPath;
    job.branch = wt.branch;
    job.status = 'running';
    save(night);
    await updateStatus(night);

    const n = job.attempts.length + 1;
    const logFile = resolve(logsDir, `${night.nightId}-r${job.round}-${job.agent}-a${n}.log`);
    const before = headFingerprint(wt.wtPath);
    const startedAt = now();
    log(`═══ ${job.agent} (r${job.round}) intento ${n}${wt.reused ? ' — retomando' : ''} ═══`);

    const res = await runClaude({
      prompt: buildPrompt(job, wt, night), cwd: wt.wtPath, env: childEnv(sqlProxyUrl),
      maxTurns: cfg.maxTurns, timeoutMs: cfg.timeout * 60 * 1000, logFile, repoRoot, log,
    });

    const cls = classifyAttempt(res);
    night.lastQuota = mergeQuota(night.lastQuota, cls.quota);
    recordQuota(cls.quota, `${job.agent}-a${n}`);
    const progress = before !== headFingerprint(wt.wtPath);
    const kind = res.violation ? 'real' : cls.kind;

    for (const v of scanViolations(res.output, { repoRoot })) {
      notify(night, `${v.severity === 'p0' ? '🚨' : '⚠️'} ${job.agent}: regla "${v.rule}" — ${v.detail}`, { now: now(), kind: v.severity === 'p0' ? 'p0' : 'info' });
    }

    job.attempts.push({
      n, kind, logFile, numTurns: cls.numTurns, progress,
      minutes: Math.round((now() - startedAt) / 60000),
      resultText: cls.resultText, violation: res.violation?.rule || null,
      at: new Date(startedAt).toISOString(),
    });
    const status = applyAttempt(job, { kind, progress, numTurns: cls.numTurns });
    coverage.updateAfterRun({ agent: job.agent, nightId: night.nightId });
    log(`═══ ${job.agent}: ${kind} → ${status} (${job.attempts.at(-1).minutes} min, ${cls.numTurns} turnos, avance: ${progress ? 'sí' : 'no'}) ═══`);

    if (status === 'stuck') notify(night, `🪨 ${job.agent} (r${job.round}) se pausó 2 veces sin avanzar; se deja. Log: ${logFile}`, { now: now() });
    if (TERMINAL.has(status)) removeWorktree({ repoRoot, wtPath: wt.wtPath, branch: wt.branch });
    save(night);

    if (status === 'paused_limit') return { pauseUntil: (cls.resetsAt ?? now() + 60 * 60 * 1000) + WAIT_MARGIN_MS };
    if (status === 'paused_weekly') return { frozen: true };
    return {};
  }

  // ─── Pausa, cierre y briefing ──────────────────────────────────────────────

  async function pause(night, until, reason) {
    night.waits = (night.waits || 0) + 1;
    if (night.waits > MAX_WAITS_PER_NIGHT) {
      notify(night, `La noche ${night.nightId} ya esperó ${MAX_WAITS_PER_NIGHT} renovaciones de cupo; se cierra para no quedar en bucle.`, { now: now() });
      return finish(night);
    }
    night.status = 'waiting';
    night.resumeAt = new Date(until).toISOString();
    scheduleResume({ at: until, scriptPath, repoRoot });
    log(`⏸️ Pausa: ${reason}. Retoma ${new Date(until).toLocaleString('es-CL')} (tarea de Windows con WakeToRun).`);
    save(night);
    await updateStatus(night);
  }

  function fallbackSummary(night) {
    const s = summarizeJobs(night);
    let prs = '';
    try {
      const raw = execFileSync('gh', ['pr', 'list', '--state', 'all', '--search', `created:>=${night.nightId.slice(0, 10)}`, '--json', 'number,title,state', '--limit', '20'], { cwd: repoRoot, encoding: 'utf8', timeout: 60000, windowsHide: true });
      prs = JSON.parse(raw || '[]').map(p => `• #${p.number} [${p.state}] ${p.title}`).join('\n');
    } catch { prs = '(no pude listar PRs)'; }
    return [
      `📋 Resumen CEO — noche ${night.nightId} (sin IA: no quedaba cupo)`,
      `OK ${s.ok} · fallidos ${s.failed} · timeout ${s.timeout} · atascados ${s.stuck} · en pausa ${s.pausedWeekly + s.pausedLimit} · sin empezar ${s.pending}`,
      night.status === 'frozen_weekly' || night.frozen ? 'La cola se congeló por el límite semanal; lo pausado se retoma la próxima noche.' : '',
      prs ? `\nPRs:\n${prs}` : '\nSin PRs.',
    ].filter(Boolean).join('\n');
  }

  async function runSummary(night, sqlProxyUrl) {
    const resumen = agents.find(a => a.name === 'resumen-ceo');
    const q = night.lastQuota;
    const blocked = !q || weeklyBlock(q, { now: now(), dailyUse: dailyUse() }) || q.five.status === 'rejected';
    if (resumen && !blocked && existsSync(resolve(promptsDir, 'resumen-ceo.md'))) {
      const jobsJson = JSON.stringify(night.jobs.map(j => ({ agent: j.agent, round: j.round, status: j.status, carriedFrom: j.carriedFrom || null, attempts: j.attempts })), null, 2);
      const prompt = readFileSync(resolve(promptsDir, 'resumen-ceo.md'), 'utf8')
        .replace(/\{\{DATE\}\}/g, night.nightId.slice(0, 10))
        .replace(/\{\{NIGHT_ID\}\}/g, night.nightId)
        .replace(/\{\{DAY_OF_WEEK\}\}/g, new Date(now()).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase())
        .replace(/\{\{REPO_ROOT\}\}/g, repoRoot)
        .replace(/\{\{LOGS_DIR\}\}/g, logsDir)
        .replace('{{PARTIALS_JSON}}', jobsJson)
        + `\n\nAvisos de la noche (inclúyelos en el briefing):\n${night.notifications.filter(x => !x.sent).map(x => `- ${x.text}`).join('\n') || '- (ninguno)'}\n`;
      const logFile = resolve(logsDir, `${night.nightId}-resumen-ceo-a1.log`);
      const res = await runClaude({ prompt, cwd: repoRoot, env: childEnv(sqlProxyUrl), maxTurns: resumen.maxTurns, timeoutMs: resumen.timeout * 60 * 1000, logFile, repoRoot, log });
      const cls = classifyAttempt(res);
      log(`resumen-ceo: ${cls.kind}`);
      if (cls.kind === 'ok') {
        for (const x of night.notifications) if (x.kind !== 'p0') x.sent = true; // ya van dentro del briefing
        return true;
      }
    }
    const id = await sendNew(fallbackSummary(night), log);
    return Boolean(id);
  }

  async function finish(night, sqlProxyUrl) {
    if (night.status === 'frozen_weekly') night.frozen = true;
    if (!night.summarySent) {
      const at = nextQuietEnd(now());
      if (at > now()) {
        // Cola terminada de madrugada: el briefing sale a las 07:30, no a las 3 am.
        night.status = 'waiting';
        night.resumeAt = new Date(at).toISOString();
        night.summaryOnly = true;
        scheduleResume({ at, scriptPath, repoRoot });
        log(`Cola terminada. Briefing programado para ${new Date(at).toLocaleTimeString('es-CL')}.`);
        save(night);
        await updateStatus(night);
        return;
      }
      night.summarySent = await runSummary(night, sqlProxyUrl);
    }
    await flushNotifications(night, log, { quietUntilPassed: true });
    night.status = 'done';
    night.resumeAt = null;
    save(night);
    await updateStatus(night);
    log(`Noche ${night.nightId} cerrada.`);
  }

  // ─── Entrada: --night ──────────────────────────────────────────────────────

  async function runNight() {
    if (existsSync(pauseFile)) {
      log('PAUSE presente: la noche no corre.');
      return;
    }
    const lock = acquirePidLock(nightLock);
    if (!lock.ok) {
      log(`Otra noche ya está corriendo (PID ${lock.holder ?? '?'}). Salgo.`);
      return;
    }
    let proxy = null;
    let night = null;
    try {
      clearResume();
      night = openNight();

      if (night.summaryOnly) {
        night.summaryOnly = false;
        await finish(night);
        return;
      }

      const authOk = refreshAuth ? await refreshAuth() : true;
      if (!authOk) {
        notify(night, '🚨 CEO Autónomo: la sesión de Claude Code no está autenticada. Abre Claude Code y corre /login.', { now: now(), kind: 'p0' });
        await flushNotifications(night, log, { quietUntilPassed: false });
        save(night);
        return;
      }

      const version = claudeVersion();
      log(`CLI de los agentes: ${claudeBin()} (versión ${version ?? '?'}).`);
      if (version && version !== 'fake' && versionLt(version, MIN_CLI)) {
        notify(night, `⚠️ Los agentes usan Claude Code ${version}, más viejo que ${MIN_CLI}: el cupo se estima en vez de medirse. Actualiza con: npm i -g @anthropic-ai/claude-code`, { now: now() });
      }

      const interactive = listClaudeCli().filter(p => p.kind === 'interactive');
      if (interactive.length) {
        notify(night, `Había ${interactive.length} sesión(es) interactiva(s) de Claude Code abiertas al partir la noche (consumen el mismo cupo). No las toqué.`, { now: now() });
      }

      const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
      const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
      if (accessToken && ref) proxy = await startSqlProxy({ accessToken, projectRef: ref, log });

      const probe = probeQuota({ bin: claudeBin(), env: childEnv(null), cwd: repoRoot });
      recordQuota(probe, 'probe');
      night.lastQuota = mergeQuota(night.lastQuota, probe);
      log(`Cupo: 5 h ${pct(probe.five.utilization)} (${probe.five.status ?? '?'}), semanal ${pct(probe.seven.utilization)}${probe.estimated ? ' (estimado)' : ''}.`);

      for (;;) {
        if (existsSync(pauseFile)) { log('PAUSE apareció: detengo la cola.'); break; }
        const d = decideStart(night.lastQuota, { now: now(), dailyUse: dailyUse() });
        if (d.action === 'skip_weekly') {
          freezeWeekly(night);
          const when = d.resetsAt ? new Date(d.resetsAt).toLocaleString('es-CL') : '?';
          notify(night, `🧊 Esta noche los agentes se detienen: ${d.reason}. El semanal se renueva ${when}. Lo pausado se retoma la próxima noche.`, { now: now() });
          break;
        }
        if (d.action === 'wait') { await pause(night, d.until, d.reason); return; }

        let job = nextJob(night);
        if (!job && night.roundsPlanned < 2 && canStartExtraRound(night.lastQuota, { now: now(), dailyUse: dailyUse() })) {
          addRound(night, workAgents.map(a => a.name), 2);
          log('Hay cupo para una segunda ronda: la agrego.');
          job = nextJob(night);
        }
        if (!job) break;

        const r = await runJob(night, job, proxy?.url);
        if (r.pauseUntil) { await pause(night, r.pauseUntil, `cupo de 5 h agotado durante ${job.agent}`); return; }
        if (r.frozen) {
          freezeWeekly(night);
          notify(night, `🧊 Se acabó el cupo semanal durante ${job.agent}. Lo pausado se retoma la próxima noche.`, { now: now() });
          break;
        }
        await updateStatus(night);
      }
      await finish(night, proxy?.url);
    } catch (e) {
      log(`🔴 Error del scheduler: ${e.message}\n${e.stack}`);
      if (night) {
        notify(night, `🔴 CEO Autónomo: error del scheduler — ${e.message.slice(0, 300)}`, { now: now(), kind: 'p0' });
        try { await flushNotifications(night, log, { quietUntilPassed: false }); } catch { /* el watchdog reintenta */ }
        save(night);
      }
    } finally {
      if (proxy) await proxy.close();
      if (night) {
        try { await flushNotifications(night, log, { quietUntilPassed: quietPassed(now()) }); save(night); } catch { /* idem */ }
      }
      releasePidLock(nightLock);
    }
  }

  // ─── Entrada: --watchdog (08:00 y 12:00) ───────────────────────────────────

  async function runWatchdog() {
    if (existsSync(pauseFile)) { log('Watchdog: PAUSE presente.'); return; }
    const active = loadJson(activeFile);
    const night = active ? loadJson(nightFile(active.nightId)) : null;
    if (!night) { log('Watchdog: no hay noche activa.'); return; }

    await flushNotifications(night, log, { quietUntilPassed: quietPassed(now()) });
    save(night);

    const holder = lockHolder(nightLock);
    if (holder) { log(`Watchdog OK: la noche ${night.nightId} sigue corriendo (PID ${holder}).`); return; }

    // Sin scheduler vivo: cualquier `claude -p` del scheduler es huérfano.
    const orphans = listClaudeCli().filter(p => p.kind === 'headless' && /--dangerously-skip-permissions/.test(p.cmd) && /stream-json/.test(p.cmd));
    for (const o of orphans) killTree(o.pid);
    if (orphans.length) notify(night, `Watchdog: maté ${orphans.length} sesión(es) de agente huérfanas (sin scheduler vivo).`, { now: now(), kind: 'p0' });

    if (night.status === 'done') { log(`Watchdog OK: noche ${night.nightId} cerrada.`); save(night); return; }
    if (night.status === 'waiting' && resumeScheduledAt()) { log(`Watchdog OK: noche en pausa, retoma ${night.resumeAt}.`); save(night); return; }

    if ((night.watchdogRelaunches || 0) >= 1) {
      notify(night, `🔴 El scheduler de la noche ${night.nightId} murió otra vez y no lo relanzo (ya lo relancé una vez). Revisar ${resolve(logsDir, `${localDate(now())}-scheduler.log`)}.`, { now: now(), kind: 'p0' });
    } else {
      night.watchdogRelaunches = (night.watchdogRelaunches || 0) + 1;
      notify(night, `⚠️ El scheduler de la noche ${night.nightId} estaba detenido (${night.status}) con trabajo pendiente. Lo relancé.`, { now: now(), kind: 'p0' });
      save(night);
      const child = spawn(process.execPath, [scriptPath, '--night'], { cwd: repoRoot, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    }
    await flushNotifications(night, log, { quietUntilPassed: quietPassed(now()) });
    save(night);
  }

  function status() {
    const active = loadJson(activeFile);
    const night = active ? loadJson(nightFile(active.nightId)) : null;
    if (!night) return 'No hay noche activa.';
    return `${statusText(night)}\n\nEstado: ${night.status}${night.resumeAt ? ` · retoma ${night.resumeAt}` : ''} · scheduler vivo: ${lockHolder(nightLock) ? 'sí' : 'no'} · PAUSE: ${existsSync(pauseFile) ? 'sí' : 'no'}`;
  }

  return { runNight, runWatchdog, status, log };
}
