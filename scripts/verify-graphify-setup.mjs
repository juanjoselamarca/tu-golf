#!/usr/bin/env node
// Verifica que la integración de graphify esté sana y escalable.
//
// Cuándo correr:
// - Después de un clon fresco (post-setup).
// - Antes de mergear PRs que toquen graphify-out/, CLAUDE.md o .claude/settings.json.
// - Como parte de /pre-push si la integración drifteó.
//
// Salida: 0 si todo OK, 1 si algo falla. Imprime checklist con razón de fallo.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const checks = [];
const ok = (name, detail) => checks.push({ name, ok: true, detail });
const ko = (name, reason) => checks.push({ name, ok: false, reason });

const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const ignored = (path) => {
  try { execSync(`git check-ignore -q "${path}"`, { stdio: 'ignore' }); return true; } catch { return false; }
};
const committed = (path) => {
  try { execSync(`git ls-files --error-unmatch "${path}"`, { stdio: 'ignore' }); return true; } catch { return false; }
};

// 1. CLI instalada
try {
  ok('CLI instalada', sh('graphify --version'));
} catch {
  ko('CLI instalada', 'falta — correr `uv tool install graphifyy --with openai && graphify install --platform windows`');
}

// 2. CLAUDE.md tiene sección graphify
const claudeMd = readFileSync('CLAUDE.md', 'utf8');
if (claudeMd.includes('## graphify')) ok('CLAUDE.md: sección graphify');
else ko('CLAUDE.md: sección graphify', 'no se encuentra el heading `## graphify`');

if (claudeMd.includes('graphify update .')) ok('CLAUDE.md: instrucciones de mantenimiento');
else ko('CLAUDE.md: instrucciones de mantenimiento', 'no menciona `graphify update .`');

// 3. PreToolUse hook registrado
try {
  const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
  const hook = settings?.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command ?? '';
  if (hook.includes('graphify') && hook.includes('GRAPH_REPORT')) ok('.claude/settings.json: PreToolUse hook');
  else ko('.claude/settings.json: PreToolUse hook', 'hook ausente o no referencia GRAPH_REPORT.md');
} catch (e) {
  ko('.claude/settings.json: PreToolUse hook', `parse fail: ${e.message}`);
}

// 4. .graphifyignore presente
if (existsSync('.graphifyignore')) ok('.graphifyignore presente');
else ko('.graphifyignore presente', 'falta — graphify indexaría node_modules/.next y rompería todo');

// 5. Archivos pesados NO committeados (escalabilidad de repo size)
if (!committed('graphify-out/graph.json') && ignored('graphify-out/graph.json')) ok('graph.json gitignored');
else ko('graph.json gitignored', 'committearlo infla .git ~2MB/commit (100MB+/año)');

if (!committed('graphify-out/graph.html') && ignored('graphify-out/graph.html')) ok('graph.html gitignored');
else ko('graph.html gitignored', 'committearlo infla .git ~2MB/commit');

if (ignored('graphify-out/cache/x') && ignored('graphify-out/manifest.json')) ok('cache + manifest gitignored');
else ko('cache + manifest gitignored', 'manifest es mtime-based, rompe post-clone');

// 6. Archivos livianos sí committeados
for (const f of [
  'graphify-out/GRAPH_REPORT.md',
  'graphify-out/.graphify_analysis.json',
  'graphify-out/.graphify_labels.json',
]) {
  if (committed(f)) ok(`${f} committeado`);
  else ko(`${f} committeado`, 'falta en el repo — equipo nuevo no recibe el mapa');
}

// 7. Graph freshness — graph.json en HEAD del repo
if (existsSync('graphify-out/GRAPH_REPORT.md')) {
  const report = readFileSync('graphify-out/GRAPH_REPORT.md', 'utf8');
  const m = report.match(/Built from commit:\s*`([a-f0-9]+)`/);
  const head = sh('git rev-parse HEAD').slice(0, 8);
  if (m && (head.startsWith(m[1].slice(0, 8)) || m[1].slice(0, 8).startsWith(head))) {
    ok('Graph freshness', `al día con HEAD ${head}`);
  } else {
    ko('Graph freshness', `report @${m?.[1]?.slice(0, 8) ?? '?'} vs HEAD @${head} — correr \`graphify update .\``);
  }
}

// 8. graph.json regenerable localmente (sin LLM, AST only)
if (!existsSync('graphify-out/graph.json')) {
  ko('graph.json regenerable', 'no existe local — correr `graphify update .`');
} else {
  const sizeMb = (statSync('graphify-out/graph.json').size / 1024 / 1024).toFixed(2);
  ok('graph.json regenerable', `${sizeMb} MB local (gitignored, OK)`);
}

// 9. Query CLI funciona end-to-end
try {
  const out = sh('graphify query "Tournament" --budget 100');
  if (out.length > 0) ok('graphify query funciona', `${out.split('\n').length} líneas de respuesta`);
  else ko('graphify query funciona', 'output vacío');
} catch (e) {
  ko('graphify query funciona', e.message.split('\n')[0]);
}

// Resumen
const passed = checks.filter(c => c.ok).length;
const failed = checks.filter(c => !c.ok).length;
const sep = '═'.repeat(64);
console.log(`\n${sep}\nGraphify verification: ${passed} OK · ${failed} FAIL\n${sep}\n`);
for (const c of checks) {
  const icon = c.ok ? '✅' : '❌';
  const detail = c.detail ? ` — ${c.detail}` : '';
  const reason = c.reason ? ` — ${c.reason}` : '';
  console.log(`  ${icon}  ${c.name}${detail}${reason}`);
}
console.log();
process.exit(failed ? 1 : 0);
