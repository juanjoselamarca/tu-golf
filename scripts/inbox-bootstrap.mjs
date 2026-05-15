/**
 * scripts/inbox-bootstrap.mjs
 *
 * Hook SessionStart de Claude Code. Avisa al inicio de cada sesión cuántos
 * reportes del bot Telegram (`@Golfers_App_Bot`) están pendientes en el inbox.
 *
 * Diseño:
 * - Cache local (.claude/inbox-pending.json) con TTL 5 min para evitar query
 *   a Supabase en cada sesión.
 * - Timeout 2s en la query: si vence, output "(inbox check timed out)" y
 *   exit 0 (no bloquea sesión).
 * - Si inbox vacío → silencio total (output vacío).
 *
 * Uso:
 *   node --env-file=.env.local scripts/inbox-bootstrap.mjs
 *
 * Spec: docs/superpowers/specs/2026-05-15-inbox-5b-consumer-design.md §3.1
 */

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const CACHE_PATH = '.claude/inbox-pending.json';
const CACHE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 2000;
const TRUNC = 60;

export function buildSummary(rows) {
  if (!rows || rows.length === 0) return '';
  const n = rows.length;
  const lines = [`📥 ${n} pendiente${n === 1 ? '' : 's'} en inbox:`];
  for (const r of rows.slice(0, 10)) {
    const content = (r.texto ?? r.caption ?? '(sin texto)').replace(/\s+/g, ' ');
    const truncated = content.length > TRUNC ? content.slice(0, TRUNC) + '...' : content;
    lines.push(`  • ${truncated}`);
  }
  if (n > 10) lines.push(`  (... y ${n - 10} más)`);
  return lines.join('\n');
}

export function readCache() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (Date.now() - raw.ts > CACHE_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeCache(rows) {
  fs.mkdirSync('.claude', { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ ts: Date.now(), rows }, null, 2));
}

async function queryPending() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('inbox_reports')
    .select('id, recibido_en, texto, caption, status')
    .in('status', ['nuevo', 'triaged'])
    .order('recibido_en', { ascending: true })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

async function main() {
  // 1) Cache hit
  const cached = readCache();
  if (cached) {
    const summary = buildSummary(cached.rows);
    if (summary) process.stdout.write(summary + '\n');
    return;
  }
  // 2) Query con timeout
  try {
    const rows = await Promise.race([
      queryPending(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    writeCache(rows);
    const summary = buildSummary(rows);
    if (summary) process.stdout.write(summary + '\n');
  } catch (err) {
    if (err.message === 'timeout') {
      process.stdout.write('(inbox check timed out)\n');
    } else {
      process.stdout.write(`(inbox check error: ${err.message})\n`);
    }
    process.exit(0);
  }
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('inbox-bootstrap.mjs');
if (invokedDirectly) main();
