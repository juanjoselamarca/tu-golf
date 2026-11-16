/**
 * scripts/inbox-recuperar-archivos.mjs
 *
 * Recupera los archivos (fotos/audio) que el webhook del inbox no pudo bajar de Telegram
 * por una falla transitoria. El webhook guarda ese archivo en un reporte propio con status
 * `error` y la línea `archivo pendiente: file_id=<id>` en `notas`
 * (INBOX_PENDING_FILE_PREFIX en src/lib/telegram-inbox.ts; un test ata ambos literales).
 * Este script baja cada uno, lo sube al bucket, lo agrega al reporte, borra la línea y, si
 * no le quedan pendientes y estaba en `error`, lo pasa a `nuevo` para que /inbox lo procese.
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

/** Nada que se imprime puede llevar el token del bot (undici mete la URL en sus errores). */
export const redact = (text) => String(text).replace(/bot\d+:[\w-]+/g, 'bot[REDACTED]');
const out = (line) => process.stdout.write(`${redact(line)}\n`);
const err = (line) => process.stderr.write(`${redact(line)}\n`);

/**
 * Extensión del file_path de Telegram → [mime, ext, tipo]. Fotos llegan como .jpg. Cada mime
 * tiene que existir en MIME_TO_EXT (src/lib/telegram-inbox.ts); un test lo verifica.
 */
export const BY_EXT = {
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

/**
 * Status del reporte tras recuperar: un `error` sin pendientes pasa a `nuevo` para que /inbox
 * lo procese; cualquier otro status (ya triado, en progreso…) no se toca.
 */
export function nextStatus(status, quedan) {
  return status === 'error' && quedan === 0 ? 'nuevo' : status;
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
  const {
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: key,
    TELEGRAM_BOT_TOKEN: bot,
  } = process.env;
  if (!url || !key || !bot) {
    err('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TELEGRAM_BOT_TOKEN');
    process.exit(1);
  }
  const s = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await s
    .from('inbox_reports')
    .select('id, status, notas, fotos_paths, audio_path')
    .like('notas', `%${PENDING_PREFIX}%`);
  if (error) {
    err(error.message);
    process.exit(1);
  }
  if (!data?.length) {
    out('Sin archivos pendientes de recuperar.');
    return;
  }

  let recuperados = 0;
  let fallidos = 0;
  for (const row of data) {
    let notas = row.notas;
    let audio = row.audio_path;
    const fotos = [...(row.fotos_paths ?? [])];
    const subidos = [];
    for (const fileId of pendingFileIds(notas)) {
      try {
        const meta = await (
          await tg(`https://api.telegram.org/bot${bot}/getFile?file_id=${encodeURIComponent(fileId)}`)
        ).json();
        if (!meta.ok || !meta.result?.file_path) {
          throw new Error(meta.description ?? 'getFile sin file_path');
        }
        const ext = meta.result.file_path.split('.').pop().toLowerCase();
        const tipo = BY_EXT[ext];
        if (!tipo) throw new Error(`extensión no soportada: ${ext}`);
        const buf = await (
          await tg(`https://api.telegram.org/file/bot${bot}/${meta.result.file_path}`)
        ).arrayBuffer();
        const now = new Date();
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
        const path = `reports/${now.getUTCFullYear()}/${mm}/${randomUUID()}.${tipo[1]}`;
        const up = await s.storage
          .from(BUCKET)
          .upload(path, buf, { contentType: tipo[0], upsert: false });
        if (up.error) throw new Error(`upload: ${up.error.message}`);
        subidos.push(path);
        if (tipo[2] === 'foto') fotos.push(path);
        else audio = path;
        notas = removePending(notas, fileId);
        out(`✓ ${row.id}: ${tipo[2]} bajado → ${path}`);
      } catch (e) {
        fallidos++;
        err(`✗ ${row.id}: ${fileId.slice(0, 12)}… sigue pendiente (${e instanceof Error ? e.message : e})`);
      }
    }
    if (subidos.length === 0) continue;

    // Escritura condicionada a que la fila siga como se leyó: si entre medio /inbox la triageó
    // o cambió algo, no se pisa; se deshace la subida y la próxima corrida lo reintenta.
    const status = nextStatus(row.status, pendingFileIds(notas).length);
    const { data: upd, error: upErr } = await s
      .from('inbox_reports')
      .update({ notas, fotos_paths: fotos, audio_path: audio, status })
      .eq('id', row.id)
      .eq('status', row.status)
      .eq('notas', row.notas)
      .select('id');
    if (upErr || !upd?.length) {
      await s.storage.from(BUCKET).remove(subidos);
      fallidos += subidos.length;
      err(`✗ ${row.id}: no actualicé el reporte (${upErr?.message ?? 'cambió mientras corría'}); queda pendiente`);
      continue;
    }
    recuperados += subidos.length;
  }
  out(`Recuperados: ${recuperados} · siguen pendientes: ${fallidos}`);
  if (fallidos) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('inbox-recuperar-archivos.mjs')) {
  main().catch((e) => {
    err(e instanceof Error ? (e.stack ?? e.message) : e);
    process.exit(1);
  });
}
