/**
 * scripts/ceo/failure.mjs — clasifica cómo terminó un intento de agente
 * y detecta violaciones de reglas en su stream (defensa mecánica).
 *
 * Forma real de una falla por límite (log 2026-09-29-0530-e2e-writer.log):
 *   {"type":"result","subtype":"success","is_error":true,
 *    "result":"You've hit your limit · resets 10am (America/Santiago)", "num_turns":1, ...}
 * OJO: subtype es "success" aunque falló. Nunca clasificar por subtype.
 */

import { parseQuota, windowExhausted } from './quota.mjs';

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
  const sevenOut = windowExhausted(quota.seven);
  const fiveOut = windowExhausted(quota.five);

  if (limitByText || ((sevenOut || fiveOut) && code !== 0)) {
    if (sevenOut) return { ...base, kind: 'limit_seven', resetsAt: quota.seven.resetsAt };
    return { ...base, kind: 'limit_five', resetsAt: quota.five.resetsAt };
  }

  if (code === 0 && result && result.is_error !== true) return { ...base, kind: 'ok', resetsAt: null };
  return { ...base, kind: 'real', resetsAt: null };
}

/** Uso de herramientas del agente (de los tool_use del stream) → [{ tool, input }]. */
function toolUses(output) {
  const out = [];
  for (const ev of parseLines(output)) {
    const content = ev?.message?.content;
    if (ev.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const c of content) if (c?.type === 'tool_use') out.push({ tool: c.name, input: c.input || {} });
  }
  return out;
}

export function bashCommands(output) {
  return toolUses(output).map(t => t.input.command).filter(c => typeof c === 'string');
}

const norm = s => String(s).replace(/\\/g, '/').toLowerCase();

const MASK = '\u0000';
const HEREDOC = /<<-?\s*['"]?\w+['"]?[\s\S]*$/;
const QUOTED = /'[^']*'|"(?:\\.|[^"\\])*"/g;
const SEPARATORS = /;|&&|\|\||\||\n/;
const PLACEHOLDER = new RegExp(`${MASK}(\\d+)${MASK}`, 'g');

/**
 * Divide un comando en segmentos (; && || | salto de línea), sin cuerpos de heredoc.
 * Cada segmento tiene dos vistas:
 *   bare — lo entrecomillado vaciado: para flags y estructura. Así
 *          `git commit -m "no usar --no-verify"` no dispara el candado (falso
 *          positivo que mataba agentes legítimos — hallazgo Fable 01-oct).
 *   full — con el contenido de las comillas: para valores (label, ruta, URL).
 */
export function commandSegments(cmd) {
  const quoted = [];
  const masked = String(cmd).replace(HEREDOC, '').replace(QUOTED, (m) => {
    quoted.push(m.slice(1, -1));
    return `${MASK}${quoted.length - 1}${MASK}`;
  });
  return masked.split(SEPARATORS).map(x => x.trim()).filter(Boolean).map(seg => ({
    bare: norm(seg.replace(PLACEHOLDER, '""')),
    full: norm(seg.replace(PLACEHOLDER, (_, i) => quoted[Number(i)])),
  }));
}

// Archivos que definen el guard de zona crítica: un agente que los edita se salta el guard.
const GUARD_FILES = ['.github/workflows/critical-zone-guard.yml', '.github/critical-zone-paths.txt'];
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const IS_GIT = /^(\S+=\S*\s+)*git\b/;

/**
 * Violaciones de reglas nocturnas. Puro: recibe el texto y la raíz del repo.
 * → [{ rule, severity: 'p0'|'warn', detail }]
 */
export function scanViolations(output, { repoRoot }) {
  const v = [];
  const add = (rule, detail) => v.push({ rule, severity: 'p0', detail: String(detail).slice(0, 200) });
  const mainEnv = `${norm(repoRoot)}/.env.local`;
  const uses = toolUses(output);
  let pushes = 0;

  for (const { input } of uses) {
    const cmd = input.command;
    if (typeof cmd !== 'string') continue;
    // La ruta exacta del .env.local principal (donde sigue el token que se le quitó).
    if (norm(cmd).includes(mainEnv)) add('env-principal', cmd);

    for (const { bare, full } of commandSegments(cmd)) {
      const git = IS_GIT.test(bare);
      const ghApi = /^gh\s+api\b/.test(bare);
      if (git && /\bpush\b/.test(bare)) pushes++;
      if (git && /\b(push|commit)\b/.test(bare) && /(^|\s)--no-verify(\s|$)/.test(bare)) add('no-verify', cmd);
      if (/^gh\s+pr\s+merge\b/.test(bare) && /(^|\s)--admin(\s|$)/.test(bare)) add('merge-admin', cmd);
      // Merge por API: se salta `gh pr merge` y sus flags.
      if (ghApi && /pulls\/\d+\/merge/.test(full)) add('merge-api', cmd);
      // El label lo pone un humano tras el review de Fable; si el agente se lo pone, anula el guard.
      if (full.includes('fable-reviewed')
        && ((/^gh\s+(pr|issue)\s+edit\b/.test(bare) && /--add-label/.test(bare)) || (ghApi && /\/labels/.test(full)))) add('auto-label-fable', cmd);
      if (ghApi && /branches\/main\/protection|\/rulesets/.test(full)
        && /(-x\s*(put|patch|delete|post)|--method\s*(put|patch|delete|post)|(^|\s)-f\s|--field|--input)/.test(bare)) add('branch-protection', cmd);
      if (/^(npx\s+)?supabase\s+(db\s+push|db\s+reset|migration\s+up)/.test(bare)
        || (/^(curl|wget|node|python)\b/.test(bare) && /api\.supabase\.com\/v1\/projects\/\S+\/database\/query/.test(full))) add('sql-directo', cmd);
      if (GUARD_FILES.some(g => full.includes(g))
        && /((^|\s)(sed\s+-i|tee|cp|mv|rm|git\s+(rm|mv|checkout)|node|python|perl)\b|>)/.test(bare)) add('guard-editado', cmd);
    }
  }

  for (const { tool, input } of uses) {
    const p = input.file_path || input.path || input.notebook_path;
    if (typeof p !== 'string') continue;
    const np = norm(p);
    if (np === mainEnv) add('env-principal', p);
    if (WRITE_TOOLS.has(tool) && GUARD_FILES.some(g => np.endsWith(g))) add('guard-editado', p);
  }

  // Aviso (no P0): la regla es 3 ciclos por PR; 9 push ≈ 3 PRs al límite en una sesión.
  if (pushes > 9) v.push({ rule: 'bucle-push', severity: 'warn', detail: `${pushes} git push en una sesión` });
  return v;
}

/** Detección incremental: ¿esta línea del stream es una violación P0? (para matar en caliente) */
export function lineViolation(line, { repoRoot }) {
  if (!line.includes('"tool_use"')) return null;
  const found = scanViolations(line, { repoRoot }).filter(x => x.severity === 'p0');
  return found[0] || null;
}
