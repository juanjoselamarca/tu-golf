#!/usr/bin/env node
/**
 * scripts/setup-worktree.mjs
 *
 * Crea un worktree aislado para una sesión nueva de Claude (o cualquier agente paralelo).
 * Pensado para evitar los 2 problemas del incidente del 12-may-2026:
 *
 *   1. .env.local no se duplica automáticamente al worktree nuevo → pre-push hook
 *      falla durante `npm run build` por NEXT_PUBLIC_VAPID_PUBLIC_KEY ausente.
 *
 *   2. Choques con agentes paralelos editando la misma rama compartida — el
 *      agente paralelo termina moviendo el commit a otra rama silenciosamente.
 *
 * Uso:
 *   node scripts/setup-worktree.mjs <slug> [chore|feat|fix]
 *
 * Ejemplos:
 *   node scripts/setup-worktree.mjs safety-protocols
 *     → worktree en .claude/worktrees/safety-protocols
 *     → branch chore/safety-protocols-claude desde origin/main
 *
 *   node scripts/setup-worktree.mjs login-bug fix
 *     → branch fix/login-bug-claude
 */

import { execSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , slug, prefix = 'chore'] = process.argv;

if (!slug || !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(slug)) {
  console.error('Uso: node scripts/setup-worktree.mjs <slug> [chore|feat|fix]');
  console.error('El slug debe ser kebab-case (ej: "safety-protocols", "login-bug").');
  process.exit(1);
}

if (!['chore', 'feat', 'fix'].includes(prefix)) {
  console.error(`Prefijo inválido: "${prefix}". Usá: chore | feat | fix`);
  process.exit(1);
}

const branch = `${prefix}/${slug}-claude`;
const wtPath = `.claude/worktrees/${slug}`;
const repoRoot = process.cwd();

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const shOut = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const gitDir = shOut('git rev-parse --git-dir');
const gitCommonDir = shOut('git rev-parse --git-common-dir');
if (resolve(gitDir) !== resolve(gitCommonDir)) {
  console.error('✘ Este script debe correr desde el repo principal, no desde un worktree.');
  console.error(`  cd a: ${resolve(gitCommonDir, '..')}`);
  process.exit(1);
}

const remote = shOut('git remote get-url origin');
if (!remote.includes('juanjoselamarca/tu-golf')) {
  console.error(`✘ Repo incorrecto: ${remote}`);
  console.error('  Este script solo corre en github.com/juanjoselamarca/tu-golf');
  process.exit(1);
}

if (existsSync(wtPath)) {
  console.error(`✘ Worktree ya existe en ${wtPath}`);
  console.error(`  Borralo primero: git worktree remove "${wtPath}"`);
  process.exit(1);
}

try {
  execSync(`git rev-parse --verify refs/heads/${branch}`, { stdio: 'pipe' });
  console.error(`✘ Branch ${branch} ya existe local.`);
  console.error(`  Usá otro slug o borrá la rama: git branch -D ${branch}`);
  process.exit(1);
} catch {
  // Branch no existe — esperado.
}

console.log('→ git fetch origin main');
sh('git fetch origin main');

console.log(`→ git worktree add ${wtPath} desde origin/main`);
sh(`git worktree add "${wtPath}" -b ${branch} origin/main`);

const envSrc = resolve(repoRoot, '.env.local');
const envDst = resolve(repoRoot, wtPath, '.env.local');
if (existsSync(envSrc)) {
  copyFileSync(envSrc, envDst);
  console.log('→ .env.local copiado al worktree');
} else {
  console.warn('⚠ .env.local no existe en la raíz. Pre-push del worktree va a fallar hasta que lo crees.');
}

const mainSha = shOut('git rev-parse --short origin/main');

console.log('');
console.log('✅ Worktree listo:');
console.log(`   path:   ${wtPath}`);
console.log(`   branch: ${branch}`);
console.log(`   base:   origin/main (${mainSha})`);
console.log('');
console.log('Próximos pasos:');
console.log(`   cd "${wtPath}"`);
console.log('   npm install   # si node_modules no existe');
console.log('   # trabajar normal');
console.log('');
console.log('Al final (mergeado o descartado):');
console.log(`   git worktree remove "${wtPath}"`);
console.log(`   git branch -D ${branch}   # si la rama ya no se necesita`);
