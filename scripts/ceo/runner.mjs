/**
 * scripts/ceo/runner.mjs — lanza una sesión `claude -p` y la vigila.
 *
 * - El log se escribe EN VIVO a un archivo por intento (nunca se sobrescribe:
 *   el 30-sep la corrida manual pisó la evidencia de las fallas de las 00:00).
 * - Timeout por intento: el tiempo esperando un reset no cuenta.
 * - Al matar, mata el árbol completo (taskkill /T): en Windows matar node no
 *   mata al hijo claude, que seguiría consumiendo cupo y mergeando sin registro.
 * - Detección en caliente de violaciones P0 (--no-verify, --admin, leer el
 *   .env.local principal, SQL directo a prod): mata la sesión al verlas.
 * - Presupuesto (opcional, `budget`): mide el gasto en vivo (budget.mjs), detecta vueltas en
 *   círculo (loops.mjs) y deja el estado en `budget.statusFile` para el hook que se lo cuenta
 *   al agente. Corta la sesión en el tope duro o si el bucle sigue tras el aviso.
 *
 * CEO_CLAUDE_BIN permite reemplazar el binario por un CLI falso en pruebas.
 */

import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { killTree } from './windows.mjs';
import { lineViolation } from './failure.mjs';
import { createMeter } from './budget.mjs';
import { createLoopDetector } from './loops.mjs';

/**
 * Binario del CLI. NUNCA el `claude` que encuentra el PATH sin shell: en este PC
 * node resuelve a una copia de WinGet congelada en 2.1.86 (mar-2026), mientras la
 * terminal usa la de npm (2.1.287). Los agentes corrieron meses con el CLI viejo
 * (descubierto 01-oct-2026: sin `unifiedWindows`, el cupo no se podía medir).
 */
export function claudeBin() {
  if (process.env.CEO_CLAUDE_BIN) return process.env.CEO_CLAUDE_BIN;
  const npmBin = process.env.APPDATA && resolve(process.env.APPDATA, 'npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe');
  return npmBin && existsSync(npmBin) ? npmBin : 'claude';
}

/** Versión del CLI que van a usar los agentes, ej. "2.1.287". null si no se pudo leer. */
export function claudeVersion(bin = claudeBin()) {
  if (bin.endsWith('.mjs')) return 'fake';
  try {
    const out = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    return out.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
  } catch { return null; }
}

/** a < b en versión semántica simple (x.y.z). */
export function versionLt(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  }
  return false;
}

/**
 * → Promise<{ code, killed, cut, violation, output, meter }>
 *   cut: 'presupuesto' | 'bucle' | null · meter: estado final del medidor (null sin `budget`).
 *
 * `permisos`: argumentos de permisos/herramientas del CLI. Por defecto los de los agentes nocturnos
 * (`--dangerously-skip-permissions`). El diagnóstico de caídas (scripts/monitor/incidente.mjs) pasa una sesión
 * de solo lectura: `--tools Read Grep Glob --strict-mcp-config`.
 * `budget`: { budgetUsd, correction, statusFile, settingsFile } — settingsFile registra el hook budget-hook.mjs.
 */
export function runClaude({ prompt, cwd, env, maxTurns, timeoutMs, logFile, repoRoot, log = () => {}, permisos = ['--dangerously-skip-permissions'], budget = null }) {
  return new Promise((resolve) => {
    const out = createWriteStream(logFile, { flags: 'a' });
    let output = '';
    let pending = '';
    let killed = false;
    let violation = null;
    let settled = false;
    const meter = budget ? createMeter(budget) : null;
    const loops = budget ? createLoopDetector() : null;
    let alert = null;

    const bin = claudeBin();
    const args = bin.endsWith('.mjs')
      ? [bin]
      : [];
    const cmd = bin.endsWith('.mjs') ? process.execPath : bin;
    args.push(
      // El prompt va por stdin: por argv choca con el límite de 32 767 caracteres de
      // la línea de comandos de Windows (el del resumen crece con cada intento).
      '-p',
      // stream-json + --verbose: el log se llena en tiempo real (con "text" queda
      // en 0 bytes si se mata por timeout — bug 17-sep). Sin --verbose el CLI sale con 1.
      '--output-format', 'stream-json', '--verbose',
      '--max-turns', String(maxTurns),
      ...permisos,
      ...(budget?.settingsFile ? ['--settings', budget.settingsFile] : []),
    );

    const child = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    child.stdin.on('error', () => { /* el proceso murió antes de leer: lo reporta 'close' */ });
    child.stdin.end(prompt);

    const stop = (why) => {
      if (killed) return;
      killed = why;
      log(`⚠ Deteniendo sesión (${why}).`);
      killTree(child.pid);
      try { child.kill(); } catch { /* ya terminó */ }
    };

    const onData = (chunk) => {
      const s = chunk.toString();
      output += s;
      out.write(s);
      pending += s;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (violation) break;
        const v = lineViolation(line, { repoRoot });
        if (v) {
          violation = v;
          stop(`violación ${v.rule}`);
        }
        if (meter && !killed) watchBudget(line);
      }
    };

    function watchBudget(line) {
      if (!line.startsWith('{')) return;
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      meter.ingest(ev);
      const st = meter.state();
      const hit = loops.ingest(ev, { fraction: st.fraction });
      if (hit) {
        alert = { seq: (alert?.seq ?? 0) + 1, ...hit };
        log(`${hit.level === 'corte' ? '⛔' : '⚠'} Bucle (${hit.rule}): ${hit.detail}.`);
      }
      if (ev.type === 'assistant' || ev.type === 'user') {
        try { writeFileSync(budget.statusFile, JSON.stringify({ ...st, alert })); } catch { /* el hook calla */ }
      }
      if (hit?.level === 'corte') stop('bucle');
      else if (st.overCap) stop('presupuesto');
    }

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const timer = setTimeout(() => stop('timeout'), timeoutMs);

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      out.end();
      const cut = killed === 'bucle' || killed === 'presupuesto' ? killed : null;
      resolve({ code, killed: killed === 'timeout', cut, violation, output, pid: child.pid, meter: meter?.state() ?? null });
    };
    child.on('close', finish);
    child.on('error', (err) => {
      out.write(`\nSPAWN ERROR: ${err.message}\n`);
      output += `\nSPAWN ERROR: ${err.message}\n`;
      finish(-1);
    });
  });
}
