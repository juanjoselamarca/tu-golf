/**
 * scripts/inbox-recuperar-archivos.mjs
 *
 * Recupera los archivos (fotos/audio) que el webhook del inbox no pudo bajar de Telegram
 * por una falla transitoria. El webhook deja en `inbox_reports.notas` una línea
 * `archivo pendiente: file_id=<id>` (INBOX_PENDING_FILE_PREFIX en src/lib/telegram-inbox.ts;
 * un test ata ambos literales). Este script baja cada uno, lo sube al bucket, lo agrega al
 * reporte, borra la línea y, si al reporte no le quedan pendientes y estaba en `error`, lo
 * pasa a `nuevo` para que /inbox lo procese.
 *
 * Uso (PASO 1 de /inbox):
 *   node --env-file=.env.local scripts/inbox-recuperar-archivos.mjs
 *
 * Idempotente: sin pendientes no hace nada. Un archivo que vuelve a fallar queda anotado.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const PENDING_PREFIX = 'archivo pendiente: file_id=';
const BUCKET = 'inbox-photos';
const TIMEOUT_MS = 30_000;

const out = (line) => process.stdout.write(`${line}\n`);

/** Extensión del file_path de Telegram → [mime, ext, tipo]. Fotos llegan como .jpg. */
const BY_EXT = {
  jpg: ['image/jpeg', 'jpg', 'foto'],
  jpeg: ['image/jpeg', 'jpg', 'foto'],
  png: ['image/png', 'png', 'foto'],
  webp: ['image/webp', 'webp', 'foto'],
  oga: ['audio/ogg', 'ogg', 'audio'],
  ogg: ['audio/ogg', 'ogg', 'audio'],
  mp3: ['audio/mpeg', 'mp3', 'audio'],
};

/** Líneas pendientes de un `notas` → file_ids. */
export function pendingFileIds(notas) {
  if (!notas) return [];
  return notas
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(PENDING_PREFIX))
    .map((l) => l.slice(PENDING_PREFIX.length).trim())
    .filter(Boolean);
}

/** `notas` sin la línea de ese file_id (null si queda vacío). */
export function removePending(notas, fileId) {
  const rest = (notas ?? '')
    .split('\n')
    .filter((l) => l.trim() !== `${PENDING_PREFIX}${fileId}`);
  const joined = rest.join('\n').trim();
  return joined === '' ? null : joined;
}

async function tg(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, TELEGRAM_BOT_TOKEN: bot } =
    process.env;
  if (!url || !key || !bot) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TELEGRAM_BOT_TOKEN');
    process.exit(1);
  }
  const s = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await s
    .from('inbox_reports')
    .select('id, status, notas, fotos_paths, audio_path')
    .like('notas', `%${PENDING_PREFIX}%`);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data?.length) {
    out('Sin archivos pendientes de recuperar.');
    return;
  }

  let recuperados = 0;
  let fallidos = 0;
  for (const row of data) {
    let { notas, fotos_paths: fotos, audio_path: audio } = row;
    fotos = [...(fotos ?? [])];
    for (const fileId of pendingFileIds(notas)) {
      try {
        const meta = await (await tg(`https://api.telegram.org/bot${bot}/getFile?file_id=${encodeURIComponent(fileId)}`)).json();
        if (!meta.ok || !meta.result?.file_path) throw new Error(meta.description ?? 'getFile sin file_path');
        const ext = meta.result.file_path.split('.').pop().toLowerCase();
        const tipo = BY_EXT[ext];
        if (!tipo) throw new Error(`extensión no soportada: ${ext}`);
        const buf = await (await tg(`https://api.telegram.org/file/bot${bot}/${meta.result.file_path}`)).arrayBuffer();
        const now = new Date();
        const path = `reports/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${tipo[1]}`;
        const up = await s.storage.from(BUCKET).upload(path, buf, { contentType: tipo[0], upsert: false });
        if (up.error) throw new Error(`upload: ${up.error.message}`);
        if (tipo[2] === 'foto') fotos.push(path);
        else audio = path;
        notas = removePending(notas, fileId);
        recuperados++;
        out(`✓ ${row.id}: ${tipo[2]} recuperado → ${path}`);
      } catch (err) {
        fallidos++;
        console.error(`✗ ${row.id}: ${fileId.slice(0, 12)}… sigue pendiente (${err instanceof Error ? err.message : err})`);
      }
    }
    const quedan = pendingFileIds(notas).length;
    const status = row.status === 'error' && quedan === 0 ? 'nuevo' : row.status;
    const { error: upErr } = await s
      .from('inbox_reports')
      .update({ notas, fotos_paths: fotos, audio_path: audio, status })
      .eq('id', row.id);
    if (upErr) {
      console.error(`✗ ${row.id}: no pude actualizar el reporte (${upErr.message})`);
      process.exitCode = 1;
    }
  }
  out(`Recuperados: ${recuperados} · siguen pendientes: ${fallidos}`);
  if (fallidos) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('inbox-recuperar-archivos.mjs')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
