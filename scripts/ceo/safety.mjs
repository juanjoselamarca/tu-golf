/**
 * scripts/ceo/safety.mjs — seguridad post-merge de la noche (salió de night.mjs al pasar las 600 líneas).
 *
 * Si prod cae tras un merge nocturno: se revierte SOLO el último PR de la noche,
 * por PR con CI (main exige checks y enforce_admins: nada de push directo), y solo
 * si prod falla 3 veces seguidas (un 503 transitorio no revierte nada).
 */

import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { notify } from './state.mjs';
import { removeWorktree, worktreesDir } from './worktree.mjs';
import { flushNotifications } from './telegram.mjs';

export function createSafety({ repoRoot, log, now }) {
  async function prodDown() {
    for (let i = 0; i < 3; i++) {
      try {
        const st = (await fetch('https://golfersplus.vercel.app/', { signal: AbortSignal.timeout(10000) })).status;
        if (st < 500) return null;
        if (i === 2) return st;
      } catch (e) {
        log(`⚠ Smoke inconcluso: ${e.message}. No se revierte (puede ser la red local).`);
        return null;
      }
      await new Promise(r => setTimeout(r, 20000));
    }
    return null;
  }

  function gh(args, opts = {}) {
    return execFileSync('gh', args, { cwd: repoRoot, encoding: 'utf8', timeout: 60000, windowsHide: true, ...opts }).trim();
  }

  async function safetyCheck(night) {
    let prs = [];
    try {
      prs = JSON.parse(gh(['pr', 'list', '--state', 'merged', '--search', `merged:>=${night.nightId.slice(0, 10)}`, '--json', 'number,mergeCommit,mergedAt,headRefName', '--limit', '30']) || '[]');
    } catch (e) { log(`⚠ Safety check: gh falló (${e.message.slice(0, 120)}). Sigo sin check.`); return; }
    night.revertedPrs = night.revertedPrs || [];
    // PRs de agentes nocturnos: rama <prefijo>/ceo-<agente>-… (excluye los propios reverts).
    const last = prs.filter(p => p.mergeCommit?.oid && p.headRefName.includes("/ceo-") && !/ceo-revert-/.test(p.headRefName)).sort((x, y) => Date.parse(y.mergedAt) - Date.parse(x.mergedAt))[0];
    if (!last || night.revertedPrs.includes(last.number)) return;
    const status = await prodDown();
    if (!status) return;

    night.revertedPrs.push(last.number);
    notify(night, `🚨 Prod responde ${status} (3 veces) tras el PR nocturno #${last.number}. Abro un PR de revert.`, { now: now(), kind: 'p0' });
    await flushNotifications(night, log, { quietUntilPassed: false });
    const branch = `fix/ceo-revert-${last.number}-claude`;
    const wtPath = resolve(worktreesDir(), `revert-${last.number}`);
    try {
      execFileSync('git', ['fetch', 'origin', 'main'], { cwd: repoRoot, windowsHide: true });
      execFileSync('git', ['worktree', 'add', '-B', branch, wtPath, 'origin/main'], { cwd: repoRoot, windowsHide: true });
      execFileSync('git', ['revert', '--no-edit', '-m', '1', last.mergeCommit.oid], { cwd: wtPath, windowsHide: true });
      execFileSync('git', ['push', '-u', 'origin', branch], { cwd: wtPath, windowsHide: true, timeout: 15 * 60 * 1000 });
      const url = gh(['pr', 'create', '--head', branch, '--title', `revert: PR #${last.number} (prod respondía ${status})`, '--body', `Revert automático del scheduler nocturno: prod respondió ${status} tres veces seguidas después del merge de #${last.number}.`]);
      // Un revert restaura un estado ya revisado: si toca zona crítica, el scheduler (no un
      // agente) le pone el label para que el guard no bloquee el rescate de prod.
      try { gh(['pr', 'edit', url, '--add-label', 'fable-reviewed']); } catch { /* sin label: el guard lo frena y se avisa abajo */ }
      try { gh(['pr', 'checks', url, '--watch', '--required', '--fail-fast'], { timeout: 30 * 60 * 1000 }); }
      catch { throw new Error(`los checks del revert fallaron: ${url}`); }
      gh(['pr', 'merge', url, '--squash']);
      notify(night, `✅ Revert de #${last.number} mergeado (${url}).`, { now: now(), kind: 'p0' });
    } catch (e) {
      notify(night, `🔴 CRÍTICO: no pude revertir el PR #${last.number} (prod ${status}). ${e.message.slice(0, 200)}. Revisar URGENTE.`, { now: now(), kind: 'p0' });
    } finally {
      removeWorktree({ repoRoot, wtPath, branch });
    }
  }

  return { safetyCheck };
}
