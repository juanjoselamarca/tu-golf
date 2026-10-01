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
 *
 * CEO_CLAUDE_BIN permite reemplazar el binario por un CLI falso en pruebas.
 */

import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { killTree } from './windows.mjs';
import { lineViolation } from './failure.mjs';

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
 * → Promise<{ code, killed, violation, output }>
 */
export function runClaude({ prompt, cwd, env, maxTurns, timeoutMs, logFile, repoRoot, log = () => {} }) {
  return new Promise((resolve) => {
    const out = createWriteStream(logFile, { flags: 'a' });
    let output = '';
    let pending = '';
    let killed = false;
    let violation = null;
    let settled = false;

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
      '--dangerously-skip-permissions',
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
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const timer = setTimeout(() => stop('timeout'), timeoutMs);

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      out.end();
      resolve({ code, killed: killed === 'timeout', violation, output, pid: child.pid });
    };
    child.on('close', finish);
    child.on('error', (err) => {
      out.write(`\nSPAWN ERROR: ${err.message}\n`);
      output += `\nSPAWN ERROR: ${err.message}\n`;
      finish(-1);
    });
  });
}
