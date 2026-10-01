/**
 * scripts/ceo/failure.mjs — clasifica cómo terminó un intento de agente
 * y detecta violaciones de reglas en su stream (defensa mecánica).
 *
 * Forma real de una falla por límite (log 2026-09-29-0530-e2e-writer.log):
 *   {"type":"result","subtype":"success","is_error":true,
 *    "result":"You've hit your limit · resets 10am (America/Santiago)", "num_turns":1, ...}
 * OJO: subtype es "success" aunque falló. Nunca clasificar por subtype.
 */

import { parseQuota } from './quota.mjs';

const LIMIT_TEXT = /hit your limit|usage limit|rate limit reached|limit reached/i;

function parseLines(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { out.push(JSON.parse(t)); } catch { /* línea parcial */ }
  }
  return out;
}

/**
 * → { kind: 'ok'|'limit_five'|'limit_seven'|'timeout'|'real', resetsAt, numTurns, sessionId, resultText }
 */
export function classifyAttempt({ output, code, killed }) {
  const events = parseLines(output);
  const result = [...events].reverse().find(e => e.type === 'result');
  const init = events.find(e => e.type === 'system' && e.subtype === 'init');
  const quota = parseQuota(output);
  const numTurns = result?.num_turns ?? 0;
  const resultText = typeof result?.result === 'string' ? result.result : '';
  const base = { numTurns, sessionId: init?.session_id ?? result?.session_id ?? null, resultText: resultText.slice(0, 300), quota };

  if (killed) return { ...base, kind: 'timeout', resetsAt: null };

  const limitByText = result?.is_error === true && LIMIT_TEXT.test(resultText);
  const sevenOut = quota.seven.status === 'rejected' || (quota.seven.utilization != null && quota.seven.utilization >= 1);
  const fiveOut = quota.five.status === 'rejected' || (quota.five.utilization != null && quota.five.utilization >= 1);

  if (limitByText || ((sevenOut || fiveOut) && code !== 0)) {
    if (sevenOut) return { ...base, kind: 'limit_seven', resetsAt: quota.seven.resetsAt };
    return { ...base, kind: 'limit_five', resetsAt: quota.five.resetsAt };
  }

  if (code === 0 && result && result.is_error !== true) return { ...base, kind: 'ok', resetsAt: null };
  return { ...base, kind: 'real', resetsAt: null };
}

/** Comandos Bash que el agente ejecutó (de los tool_use del stream). */
export function bashCommands(output) {
  const cmds = [];
  for (const ev of parseLines(output)) {
    const content = ev?.message?.content;
    if (ev.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type === 'tool_use' && typeof c.input?.command === 'string') cmds.push(c.input.command);
    }
  }
  return cmds;
}

/** Archivos que el agente leyó/escribió con herramientas de archivo. */
function filePaths(output) {
  const paths = [];
  for (const ev of parseLines(output)) {
    const content = ev?.message?.content;
    if (ev.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const c of content) {
      const p = c?.input?.file_path || c?.input?.path;
      if (c?.type === 'tool_use' && typeof p === 'string') paths.push(p);
    }
  }
  return paths;
}

const norm = s => String(s).replace(/\\/g, '/').toLowerCase();

/**
 * Violaciones de reglas nocturnas. Puro: recibe el texto y la raíz del repo.
 * → [{ rule, severity: 'p0'|'warn', detail }]
 */
export function scanViolations(output, { repoRoot }) {
  const v = [];
  const cmds = bashCommands(output);
  const root = norm(repoRoot);
  const mainEnv = `${root}/.env.local`;

  for (const cmd of cmds) {
    const n = norm(cmd);
    if (/\bgit\b[^\n]*\bpush\b[^\n]*--no-verify|\bgit\b[^\n]*\bcommit\b[^\n]*--no-verify/.test(n)) {
      v.push({ rule: 'no-verify', severity: 'p0', detail: cmd.slice(0, 200) });
    }
    if (/gh\s+pr\s+merge[^\n]*--admin/.test(n)) {
      v.push({ rule: 'merge-admin', severity: 'p0', detail: cmd.slice(0, 200) });
    }
    // El label lo pone un humano tras el review de Fable; un agente que se lo pone solo anula el guard.
    if (n.includes('fable-reviewed') && /(add-label|\/labels|gh\s+label)/.test(n)) {
      v.push({ rule: 'auto-label-fable', severity: 'p0', detail: cmd.slice(0, 200) });
    }
    // Cambiar la protección de main o los checks obligatorios.
    if (/branches\/main\/protection|required_status_checks/.test(n) && /(-x\s*(put|patch|delete|post)|--method\s*(put|patch|delete|post)|-f\s|--field|--input)/.test(n)) {
      v.push({ rule: 'branch-protection', severity: 'p0', detail: cmd.slice(0, 200) });
    }
    // Leer el .env.local del checkout principal = buscar el token que se le quitó.
    if (n.includes(mainEnv) || (n.includes(root) && n.includes('.env.local') && !n.includes('/ceo-worktrees/'))) {
      v.push({ rule: 'env-principal', severity: 'p0', detail: cmd.slice(0, 200) });
    }
    if (/supabase\s+(db\s+push|migration\s+up)|api\.supabase\.com\/v1\/projects\/[^\s]+\/database\/query/.test(n)) {
      v.push({ rule: 'sql-directo', severity: 'p0', detail: cmd.slice(0, 200) });
    }
  }
  for (const p of filePaths(output)) {
    if (norm(p) === mainEnv) v.push({ rule: 'env-principal', severity: 'p0', detail: p });
  }

  const pushes = cmds.filter(c => /\bgit\b[^\n]*\bpush\b/.test(c)).length;
  if (pushes > 9) v.push({ rule: 'bucle-push', severity: 'warn', detail: `${pushes} git push en una sesión` });
  return v;
}

/** Detección incremental: ¿esta línea del stream es una violación P0? (para matar en caliente) */
export function lineViolation(line, { repoRoot }) {
  if (!line.includes('"tool_use"')) return null;
  const found = scanViolations(line, { repoRoot }).filter(x => x.severity === 'p0');
  return found[0] || null;
}
