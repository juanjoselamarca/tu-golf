/**
 * scripts/inbox-recuperar-archivos.mjs
 *
 * Recupera los archivos (fotos/audio) que el webhook del inbox no pudo bajar de Telegram
 * por una falla transitoria. El webhook guarda ese archivo en un reporte propio con status
 * `error` y la línea `archivo pendiente: file_id=<id>` en `notas`
 * (INBOX_PENDING_FILE_PREFIX en src/lib/telegram-inbox.ts; un test ata ambos literales).
 *
 * Por cada reporte pendiente: baja los archivos y los sube al bucket. Después:
 *   - Si es una foto de un álbum (telegram_media_group_id) y el álbum tiene su reporte
 *     (fila hermana que no está en error), la foto y el caption se suman a ese reporte y la
 *     fila de error queda `descartado` con la nota "fusionado en <id>" (nunca se borra).
 *   - Si no, el archivo queda en su propio reporte, que pasa de `error` a `nuevo`.
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

/**
 * Qué se le suma al reporte del álbum con lo recuperado. El caption del álbum lo pone
 * Telegram solo en la 1ª foto: si esa fue la que falló, el reporte del álbum no lo tiene.
 */
export function fusionConAlbum(hermana, recuperado) {
  return {
    fotos_paths: [...(hermana.fotos_paths ?? []), ...recuperado.fotos],
    caption: hermana.caption ?? recuperado.caption ?? null,
    texto: hermana.texto ?? recuperado.texto ?? null,
    audio_path: hermana.audio_path ?? recuperado.audio ?? null,
  };
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

/** Baja un archivo de Telegram y lo sube al bucket. Devuelve { path, tipo }. */
async function recuperarArchivo(s, bot, fileId) {
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
  const up = await s.storage.from(BUCKET).upload(path, buf, { contentType: tipo[0], upsert: false });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  return { path, tipo: tipo[2] };
}

async function borrarSubidos(s, rowId, subidos) {
  const { error } = await s.storage.from(BUCKET).remove(subidos);
  if (error) err(`⚠ ${rowId}: quedaron archivos huérfanos en el bucket (${subidos.join(', ')}): ${error.message}`);
}

/**
 * Deshace las subidas solo si es SEGURO que el reporte no las referencia: si el UPDATE dio
 * error de red puede haberse aplicado igual, así que se relee la fila y se borra solo si sus
 * notas siguen como se leyeron (la línea pendiente sigue ahí = el UPDATE no se aplicó).
 */
async function deshacerSiNoSeAplico(s, row, subidos, upErr) {
  if (upErr) {
    const { data, error } = await s.from('inbox_reports').select('notas').eq('id', row.id).maybeSingle();
    if (error || !data || data.notas !== row.notas) {
      err(`⚠ ${row.id}: no sé si el reporte quedó actualizado; NO borro ${subidos.join(', ')} (revisar a mano)`);
      return;
    }
  }
  await borrarSubidos(s, row.id, subidos);
}

/**
 * Status de un reporte de álbum al que se le pueden sumar fotos recuperadas. Ni `error`
 * (otra foto pendiente), ni `descartado` (una fila ya fusionada: tiene el mismo grupo y es
 * la más antigua), ni `resuelto` (la foto se perdería en algo cerrado: va a su propio reporte).
 */
export const STATUS_ALBUM_ABIERTO = ['nuevo', 'triaged', 'en_progreso'];

/** Reporte del álbum de esta fila: mismo grupo y chat, abierto. */
async function buscarHermana(s, row) {
  if (!row.telegram_media_group_id) return null;
  const { data, error } = await s
    .from('inbox_reports')
    .select('id, status, fotos_paths, caption, texto, audio_path')
    .eq('telegram_media_group_id', row.telegram_media_group_id)
    .eq('telegram_chat_id', row.telegram_chat_id)
    .in('status', STATUS_ALBUM_ABIERTO)
    .neq('id', row.id)
    .order('recibido_en', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`buscar álbum: ${error.message}`);
  return data;
}

/** UPDATE condicionado a que la fila de error siga como se leyó (si /inbox la tocó, no se pisa). */
function updateFilaError(s, row, payload) {
  return s
    .from('inbox_reports')
    .update(payload)
    .eq('id', row.id)
    .eq('status', row.status)
    .eq('notas', row.notas)
    .select('id');
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
  const { recuperados, fallidos, vacio } = await recuperarPendientes(s, bot);
  if (vacio) {
    out('Sin archivos pendientes de recuperar.');
    return;
  }
  out(`Recuperados: ${recuperados} · siguen pendientes: ${fallidos}`);
  if (fallidos) process.exitCode = 1;
}

/**
 * Recorre los reportes con archivos pendientes (más antiguo primero) y los recupera.
 * Exportada para testear el flujo completo con un cliente falso.
 */
export async function recuperarPendientes(s, bot) {
  const { data, error } = await s
    .from('inbox_reports')
    .select('id, status, notas, fotos_paths, audio_path, caption, texto, telegram_media_group_id, telegram_chat_id')
    .like('notas', `%${PENDING_PREFIX}%`)
    .order('recibido_en', { ascending: true });
  if (error) throw new Error(error.message);
  if (!data?.length) return { recuperados: 0, fallidos: 0, vacio: true };

  let recuperados = 0;
  let fallidos = 0;
  for (const row of data) {
    let notas = row.notas;
    let audio = null;
    const nuevas = [];
    const subidos = [];
    for (const fileId of pendingFileIds(notas)) {
      try {
        const { path, tipo } = await recuperarArchivo(s, bot, fileId);
        subidos.push(path);
        if (tipo === 'foto') nuevas.push(path);
        else audio = path;
        notas = removePending(notas, fileId);
        out(`✓ ${row.id}: ${tipo} bajado → ${path}`);
      } catch (e) {
        fallidos++;
        err(`✗ ${row.id}: ${fileId.slice(0, 12)}… sigue pendiente (${e instanceof Error ? e.message : e})`);
      }
    }
    if (subidos.length === 0) continue;

    const quedan = pendingFileIds(notas).length;
    let hermana = null;
    try {
      hermana = quedan === 0 ? await buscarHermana(s, row) : null;
    } catch (e) {
      err(`✗ ${row.id}: ${e instanceof Error ? e.message : e}; queda pendiente`);
      await borrarSubidos(s, row.id, subidos);
      fallidos += subidos.length;
      continue;
    }

    if (hermana) {
      // 1) Se "toma" la fila de error (UPDATE condicionado = candado): queda descartada y
      //    apuntando al álbum. 2) Se suma lo recuperado al álbum. Si 2 falla, se revierte 1.
      const nota = [notas, `fusionado en ${hermana.id}`].filter(Boolean).join('\n');
      const { data: tomada, error: e1 } = await updateFilaError(s, row, {
        notas: nota,
        status: 'descartado',
      });
      if (e1 || !tomada?.length) {
        await deshacerSiNoSeAplico(s, row, subidos, e1);
        fallidos += subidos.length;
        err(`✗ ${row.id}: no actualicé el reporte (${e1?.message ?? 'cambió mientras corría'}); queda pendiente`);
        continue;
      }
      const fusion = fusionConAlbum(hermana, { fotos: nuevas, audio, caption: row.caption, texto: row.texto });
      const { data: sumada, error: e2 } = await s
        .from('inbox_reports')
        .update(fusion)
        .eq('id', hermana.id)
        .eq('status', hermana.status)
        .contains('fotos_paths', hermana.fotos_paths ?? [])
        .containedBy('fotos_paths', hermana.fotos_paths ?? [])
        .select('id');
      let aplicada = !e2 && !!sumada?.length;
      if (e2) {
        // Error de red: el UPDATE pudo aplicarse igual. Si el álbum ya tiene las fotos, listo.
        const { data: rel, error: eRel } = await s.from('inbox_reports').select('fotos_paths').eq('id', hermana.id).maybeSingle();
        if (eRel || !rel) {
          err(`⚠ ${row.id}: no sé si las fotos entraron al álbum ${hermana.id}; NO revierto ni borro ${subidos.join(', ')} (revisar a mano)`);
          fallidos += subidos.length;
          continue;
        }
        aplicada = nuevas.length > 0 && nuevas.every((p) => (rel?.fotos_paths ?? []).includes(p));
      }
      if (!aplicada) {
        const { data: revertida, error: e3 } = await s
          .from('inbox_reports')
          .update({ notas: row.notas, status: row.status })
          .eq('id', row.id)
          .eq('notas', nota)
          .select('id');
        if (e3 || revertida?.length !== 1) {
          err(`⚠ ${row.id}: quedó descartado pero sus archivos no entraron al álbum ${hermana.id} (${subidos.join(', ')}); revisar a mano`);
        } else {
          await borrarSubidos(s, row.id, subidos);
        }
        fallidos += subidos.length;
        err(`✗ ${row.id}: el álbum ${hermana.id} cambió mientras corría (${e2?.message ?? 'reintentar'}); queda pendiente`);
        continue;
      }
      recuperados += subidos.length;
      out(`✓ ${row.id}: sumado al reporte del álbum ${hermana.id}`);
      continue;
    }

    const { data: upd, error: upErr } = await updateFilaError(s, row, {
      notas,
      fotos_paths: [...(row.fotos_paths ?? []), ...nuevas],
      audio_path: audio ?? row.audio_path,
      status: nextStatus(row.status, quedan),
    });
    if (upErr || !upd?.length) {
      await deshacerSiNoSeAplico(s, row, subidos, upErr);
      fallidos += subidos.length;
      err(`✗ ${row.id}: no actualicé el reporte (${upErr?.message ?? 'cambió mientras corría'}); queda pendiente`);
      continue;
    }
    recuperados += subidos.length;
  }
  return { recuperados, fallidos, vacio: false };
}

if (process.argv[1]?.endsWith('inbox-recuperar-archivos.mjs')) {
  main().catch((e) => {
    err(e instanceof Error ? (e.stack ?? e.message) : e);
    process.exit(1);
  });
}
