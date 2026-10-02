/**
 * scripts/ceo/windows.mjs — integración con Windows: tarea de reanudación,
 * procesos y candados por PID.
 *
 * La reanudación tras un límite NO duerme dentro del proceso (un setTimeout de
 * horas se congela si el PC se suspende — hallazgo P0 de Fable 30-sep). Se
 * registra una tarea de un solo uso con WakeToRun y el proceso termina.
 *
 * Pruebas: CEO_FAKE_WINDOWS=<archivo.json> reemplaza Task Scheduler y la lista
 * de procesos por un archivo (ver __tests__/night.test.mjs).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const RESUME_TASK = 'GolfersPlus-CEO-Resume';

const fakeFile = () => process.env.CEO_FAKE_WINDOWS || null;
function fakeLoad() {
  try { return JSON.parse(readFileSync(fakeFile(), 'utf8')); } catch { return { tasks: {}, processes: [], killed: [] }; }
}
function fakeSave(d) { writeFileSync(fakeFile(), JSON.stringify(d, null, 2)); }

function ps(script, timeout = 30000) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, windowsHide: true,
  }).trim();
}

const psQuote = s => `'${String(s).replace(/'/g, "''")}'`;

/** Registra (o reemplaza) la tarea de un solo uso que retoma la noche. */
export function scheduleResume({ at, scriptPath, repoRoot }) {
  // Task Scheduler trabaja en minutos: se redondea HACIA ARRIBA para no disparar antes del reset.
  const when = new Date(Math.ceil(at / 60000) * 60000);
  if (fakeFile()) {
    const d = fakeLoad();
    d.tasks[RESUME_TASK] = { at: when.toISOString(), args: '--night' };
    fakeSave(d);
    return;
  }
  // Fecha local sin zona: Task Scheduler interpreta hora local (sobrevive al cambio de hora).
  const pad = n => String(n).padStart(2, '0');
  const local = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}:00`;
  ps([
    `$a = New-ScheduledTaskAction -Execute 'node' -Argument ('"' + ${psQuote(scriptPath)} + '" --night') -WorkingDirectory ${psQuote(repoRoot)};`,
    `$t = New-ScheduledTaskTrigger -Once -At ([datetime]::Parse(${psQuote(local)}));`,
    `$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 16);`,
    `Register-ScheduledTask -TaskName ${psQuote(RESUME_TASK)} -Action $a -Trigger $t -Settings $s -Force | Out-Null;`,
    `(Get-ScheduledTask -TaskName ${psQuote(RESUME_TASK)}).Triggers[0].StartBoundary`,
  ].join(' '));
}

export function clearResume() {
  if (fakeFile()) {
    const d = fakeLoad();
    delete d.tasks[RESUME_TASK];
    fakeSave(d);
    return;
  }
  try { ps(`Unregister-ScheduledTask -TaskName ${psQuote(RESUME_TASK)} -Confirm:$false -ErrorAction Stop`); } catch { /* no existía */ }
}

export function resumeScheduledAt() {
  if (fakeFile()) return fakeLoad().tasks[RESUME_TASK]?.at ?? null;
  try {
    const out = ps(`(Get-ScheduledTask -TaskName ${psQuote(RESUME_TASK)} -ErrorAction Stop).Triggers[0].StartBoundary`);
    return out || null;
  } catch { return null; }
}

/**
 * Procesos de Claude Code CLI (no la app de escritorio).
 * → [{ pid, ppid, cmd, kind: 'headless'|'sdk'|'interactive' }]
 */
export function listClaudeCli() {
  if (fakeFile()) return fakeLoad().processes || [];
  let raw;
  try {
    raw = ps(`Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress`);
  } catch { return []; }
  if (!raw) return [];
  let arr = JSON.parse(raw);
  if (!Array.isArray(arr)) arr = [arr];
  return arr
    .filter(p => p.CommandLine && /claude-code[\\/]bin[\\/]claude\.exe/i.test(p.CommandLine))
    .map(p => ({
      pid: p.ProcessId, ppid: p.ParentProcessId, cmd: p.CommandLine,
      // headless = `claude -p` (agentes); sdk = procesos de plugins como el observador de
      // claude-mem (--input-format stream-json); interactive = una sesión abierta por una persona.
      kind: /(^|\s)(-p|--print)(\s|$)/.test(p.CommandLine) ? 'headless'
        : /--input-format\s+stream-json/.test(p.CommandLine) ? 'sdk' : 'interactive',
    }));
}

export function pidAlive(pid) {
  if (!pid) return false;
  if (fakeFile()) return (fakeLoad().alive || []).includes(Number(pid));
  try {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    return new RegExp(`\\b${pid}\\b`).test(out);
  } catch { return false; }
}

/** Mata un proceso y todo su árbol (en Windows, matar node no mata al hijo claude). */
export function killTree(pid) {
  if (!pid) return;
  if (fakeFile()) { const d = fakeLoad(); d.killed = [...(d.killed || []), pid]; fakeSave(d); return; }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', timeout: 15000, windowsHide: true }); } catch { /* ya muerto */ }
}

// ─── Candado con PID ──────────────────────────────────────────────────────────

/**
 * ¿El PID está vivo Y es nuestro proceso? Windows recicla PIDs rápido: un candado
 * huérfano con un PID reasignado a otro programa haría creer que la noche sigue
 * viva para siempre (hallazgo Fable 01-oct). Se verifica la línea de comandos.
 */
export function pidAliveAs(pid, cmdContains) {
  if (!pid) return false;
  if (fakeFile() || !cmdContains) return pidAlive(pid);
  try {
    const cmd = ps(`(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`, 15000);
    return cmd.toLowerCase().includes(cmdContains.toLowerCase());
  } catch { return false; }
}

/** Toma el candado si está libre o si el dueño murió (o el PID ya es de otro programa). */
export function acquirePidLock(file, { cmdContains } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, 'utf8').trim());
    if (pid && pid !== process.pid && pidAliveAs(pid, cmdContains)) return { ok: false, holder: pid };
    try { unlinkSync(file); } catch { /* otro lo limpió */ }
  }
  try {
    writeFileSync(file, String(process.pid), { flag: 'wx' });
  } catch {
    return { ok: false, holder: null }; // otro proceso lo tomó entre medio
  }
  return { ok: true };
}

export function lockHolder(file, { cmdContains } = {}) {
  try {
    const pid = Number(readFileSync(file, 'utf8').trim());
    return pid && pidAliveAs(pid, cmdContains) ? pid : null;
  } catch { return null; }
}

export function releasePidLock(file) {
  try {
    if (Number(readFileSync(file, 'utf8').trim()) === process.pid) unlinkSync(file);
  } catch { /* no era nuestro */ }
}
