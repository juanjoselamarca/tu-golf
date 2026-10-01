/**
 * scripts/ceo/worktree.mjs — worktrees de los agentes nocturnos.
 *
 * Viven FUERA de OneDrive (C:\ceo-worktrees por defecto): dentro de OneDrive
 * cada corrida chocaba con "worktree huérfano bloqueado" (30-sep: 4 veces).
 * Se conservan mientras el trabajo está en pausa (para retomarlo) y se borran
 * cuando termina.
 *
 * El .env.local que recibe el agente va SIN los tokens de administración
 * (Supabase Management API y Vercel): las consultas SQL pasan por el proxy de
 * solo lectura (sql-proxy.mjs).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, symlinkSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const STRIPPED_ENV_KEYS = ['SUPABASE_ACCESS_TOKEN', 'VERCEL_ACCESS_TOKEN'];

export function worktreesDir() {
  return process.env.CEO_WORKTREES_DIR || 'C:\\ceo-worktrees';
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, windowsHide: true }).trim();
}

/** Copia .env.local quitando las claves de administración. Puro sobre el texto. */
export function filterEnvText(text) {
  return text
    .split(/\r?\n/)
    .filter(line => !STRIPPED_ENV_KEYS.some(k => line.startsWith(`${k}=`)))
    .join('\n');
}

export function ensureWorktree({ repoRoot, nightId, agent, round, prefix, existing }) {
  if (existing?.wtPath && existsSync(resolve(existing.wtPath, '.git'))) {
    return { wtPath: existing.wtPath, branch: existing.branch, reused: true };
  }
  const slug = `${nightId}-r${round}-${agent}`;
  const wtPath = resolve(worktreesDir(), slug);
  const branch = existing?.branch || `${prefix}/ceo-${agent}-${nightId}-r${round}-claude`;

  mkdirSync(worktreesDir(), { recursive: true });
  git(['fetch', 'origin', 'main'], repoRoot);
  try { git(['worktree', 'prune'], repoRoot); } catch { /* no crítico */ }

  // Retoma con el directorio perdido pero la rama viva: se recupera la rama, no se parte de cero.
  if (existing?.branch && branchExists(repoRoot, existing.branch)) {
    if (existsSync(wtPath)) removeDir(wtPath);
    git(['worktree', 'add', wtPath, existing.branch], repoRoot);
  } else {
    if (existsSync(wtPath)) removeWorktree({ repoRoot, wtPath, branch });
    try { git(['branch', '-D', branch], repoRoot); } catch { /* no existía */ }
    git(['worktree', 'add', wtPath, '-b', branch, 'origin/main'], repoRoot);
  }

  const envSrc = resolve(repoRoot, '.env.local');
  if (existsSync(envSrc)) writeFileSync(resolve(wtPath, '.env.local'), filterEnvText(readFileSync(envSrc, 'utf8')));

  const nm = resolve(wtPath, 'node_modules');
  if (!existsSync(nm)) symlinkSync(resolve(repoRoot, 'node_modules'), nm, 'junction');

  return { wtPath, branch, reused: Boolean(existing?.branch) };
}

function branchExists(repoRoot, branch) {
  try { git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot); return true; } catch { return false; }
}

/**
 * Huella del estado de la rama: cambia si hubo commits o cambios en archivos
 * versionados. Los archivos sin seguimiento (screenshots, logs) NO cuentan como
 * avance: un agente que solo deja capturas nunca llegaría a "atascado".
 */
export function headFingerprint(wtPath) {
  try {
    const head = git(['rev-parse', 'HEAD'], wtPath);
    const status = git(['status', '--porcelain', '--untracked-files=no'], wtPath);
    return `${head}:${createHash('sha1').update(status).digest('hex').slice(0, 12)}`;
  } catch { return null; }
}

/**
 * Antes de borrar un worktree terminado (timeout, error, atascado): si la rama tiene
 * commits que no están en origin, se suben a GitHub para no perder el trabajo.
 * → nombre de la rama subida, o null.
 */
export function rescueBranch({ repoRoot, wtPath, branch }) {
  if (!wtPath || !branch || !existsSync(wtPath)) return null;
  try {
    const ahead = Number(git(['rev-list', '--count', 'origin/main..HEAD'], wtPath));
    if (!ahead) return null;
    let onRemote = false;
    try { onRemote = git(['ls-remote', '--heads', 'origin', branch], repoRoot).includes(git(['rev-parse', 'HEAD'], wtPath)); } catch { /* sin remoto */ }
    if (onRemote) return null;
    // Rama de respaldo (no va a main ni abre PR): sin el pre-push de tsc/tests/build, que tarda
    // minutos y puede fallar justo por el trabajo a medias que se quiere salvar.
    git(['push', '--no-verify', 'origin', `HEAD:refs/heads/${branch}`], wtPath);
    return branch;
  } catch { return null; }
}

function removeDir(dir) {
  const nm = resolve(dir, 'node_modules');
  try { execFileSync('cmd', ['/c', 'rmdir', nm], { stdio: 'ignore', windowsHide: true }); } catch { /* no estaba */ }
  if (!existsSync(nm)) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* se reintenta */ } }
}

export function removeWorktree({ repoRoot, wtPath, branch }) {
  if (!wtPath) return;
  // La junction de node_modules primero: si no, rmdir recursivo borraría el node_modules real.
  const nm = resolve(wtPath, 'node_modules');
  try { execFileSync('cmd', ['/c', 'rmdir', nm], { stdio: 'ignore', windowsHide: true }); } catch { /* no estaba */ }
  try { git(['worktree', 'remove', '--force', wtPath], repoRoot); } catch { /* se borra a mano */ }
  if (existsSync(wtPath) && !existsSync(nm)) {
    try { rmSync(wtPath, { recursive: true, force: true }); } catch { /* lo intenta la próxima noche */ }
  }
  try { git(['worktree', 'prune'], repoRoot); } catch { /* no crítico */ }
  if (branch) { try { git(['branch', '-D', branch], repoRoot); } catch { /* ya no existe */ } }
}
