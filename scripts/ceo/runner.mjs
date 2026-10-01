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

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { killTree } from './windows.mjs';
import { lineViolation } from './failure.mjs';

export function claudeBin() {
  return process.env.CEO_CLAUDE_BIN || 'claude';
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
      '-p', prompt,
      // stream-json + --verbose: el log se llena en tiempo real (con "text" queda
      // en 0 bytes si se mata por timeout — bug 17-sep). Sin --verbose el CLI sale con 1.
      '--output-format', 'stream-json', '--verbose',
      '--max-turns', String(maxTurns),
      '--dangerously-skip-permissions',
    );

    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

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
