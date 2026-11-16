/**
 * Archivos del inbox: bajar de Telegram una foto/audio y subirla al bucket `inbox-photos`.
 * Separado de la ruta del webhook (src/app/api/inbox/webhook/route.ts), que decide qué hacer
 * con el resultado (álbum, reporte nuevo, archivo pendiente).
 */

import { randomUUID } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import {
  sendMessage,
  getFile,
  downloadFile,
  extFromMime,
  TelegramHttpError,
} from '@/lib/telegram-inbox';
import { log } from '@/lib/inbox-logger';

const STORAGE_BUCKET = 'inbox-photos';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

type AdminClient = ReturnType<typeof createAdminClient>;

export type DownloadResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'too_large' | 'mime_blocked' | 'error' }
  | { ok: false; reason: 'telegram_unavailable'; detail: string };

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function storagePathForUpload(ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `reports/${yyyy}/${mm}/${randomUUID()}.${ext}`;
}

async function uploadToBucket(
  supabase: AdminClient,
  storagePath: string,
  buffer: ArrayBuffer,
  mime: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Baja el archivo de Telegram y lo sube al bucket. Los rechazos (muy grande, tipo no
 * soportado, 4xx de Telegram) ya avisan al chat; `telegram_unavailable` NO avisa: el caller
 * deja el archivo anotado como pendiente y avisa él.
 *
 * getFile/downloadFile ya reintentan; si igual fallan, la falla vuelve como dato. Antes la
 * excepción subía al catch general y el archivo se perdía sin aviso (16-nov-2026: 6 fotos).
 */
export async function downloadAndStore(
  supabase: AdminClient,
  fileId: string,
  chatId: number,
  fallbackMime: string,
): Promise<DownloadResult> {
  // Un 4xx de Telegram (archivo >20 MB, file_id inválido) es definitivo: reintentar después
  // no lo arregla, así que no se anota como pendiente; se avisa y se registra como error.
  const fallaDeTelegram = async (err: unknown): Promise<DownloadResult> => {
    if (err instanceof TelegramHttpError) {
      log('error', 'inbox telegram rejected file', { detail: errMessage(err) });
      await sendMessage(
        chatId,
        '❌ Telegram no me entrega este archivo (muy grande o inválido). Mándalo de nuevo como foto.',
      );
      return { ok: false, reason: 'error' };
    }
    return { ok: false, reason: 'telegram_unavailable', detail: errMessage(err) };
  };

  let meta: Awaited<ReturnType<typeof getFile>>;
  try {
    meta = await getFile(fileId);
  } catch (err) {
    return fallaDeTelegram(err);
  }
  if (meta.fileSize > MAX_FILE_SIZE_BYTES) {
    await sendMessage(chatId, '❌ archivo muy grande (máx 10MB)');
    return { ok: false, reason: 'too_large' };
  }
  // Telegram NO retorna mime_type en getFile para fotos (las normaliza a JPEG).
  // Solo retorna mime para documents/audio. Usamos fallback explícito del caller.
  const effectiveMime = meta.mimeType ?? fallbackMime;
  const ext = extFromMime(effectiveMime);
  if (!ext) {
    await sendMessage(chatId, '❌ tipo de archivo no soportado');
    return { ok: false, reason: 'mime_blocked' };
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await downloadFile(meta.filePath);
  } catch (err) {
    return fallaDeTelegram(err);
  }
  const path = storagePathForUpload(ext);
  const up = await uploadToBucket(supabase, path, buffer, effectiveMime);
  if (!up.ok) {
    log('error', 'inbox upload failed', { error: up.error, path });
    return { ok: false, reason: 'error' };
  }
  return { ok: true, path };
}
