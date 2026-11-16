/**
 * Helper de Telegram para el Sistema de Inbox (Agente 5A).
 *
 * Diseño:
 * - Cero deps externas. fetch nativo + AbortController.
 * - Timeouts obligatorios en cada request (8s default).
 * - sendMessage: retry 1× en 429 leyendo retry_after, degrade graceful
 *   (la DB ya tiene el reporte; el ✓ recibido es nice-to-have).
 * - Token nunca sale en logs (el logger redactea + ningún throw lo incluye
 *   en el message).
 * - Cero `any`.
 */

import { secretsMatch } from '@/lib/secrets';
import { log } from './inbox-logger';

const TG_BASE = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 8000;
// Archivos (getFile + descarga): timeout propio y un reintento. El 16-nov-2026 las 6 fotos de
// un reporte murieron con el timeout de 8 s en una sola pasada y se perdieron. Peor caso:
// 2×10 s + 2×15 s = 50 s, bajo el maxDuration de 60 s de la ruta del webhook.
const FILE_META_TIMEOUT_MS = 10_000;
const FILE_DOWNLOAD_TIMEOUT_MS = 15_000;
const FILE_ATTEMPTS = 2;

/**
 * Marca en `inbox_reports.notas` de un archivo que no se pudo bajar de Telegram (falla
 * transitoria). Guarda el file_id para recuperarlo después con
 * `scripts/inbox-recuperar-archivos.mjs` (que repite este literal; un test los ata).
 */
export const INBOX_PENDING_FILE_PREFIX = 'archivo pendiente: file_id=';

// ──────────────────────────────────────────────
// MIME whitelist — fuente de verdad para extensión de archivos.
// NUNCA derivar extensión de filename (vector path traversal).
// ──────────────────────────────────────────────
export const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
} as const;

export type AllowedMime = keyof typeof MIME_TO_EXT;

export function extFromMime(mime: string | null | undefined): string | null {
  if (!mime) return null;
  const map = MIME_TO_EXT as Record<string, string>;
  return map[mime] ?? null;
}

// ──────────────────────────────────────────────
// Timing-safe header compare (para X-Telegram-Bot-Api-Secret-Token
// y query param de setup).
// ──────────────────────────────────────────────
export function safeEqualHeader(
  received: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  return secretsMatch(received, expected);
}

// ──────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────
function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // NO incluir el valor en el error (defensa contra logs accidentales).
    throw new Error('TELEGRAM_BOT_TOKEN missing in environment');
  }
  return token;
}

function tgApiUrl(path: string): string {
  return `${TG_BASE}/bot${getBotToken()}${path}`;
}

function tgFileUrl(filePath: string): string {
  return `${TG_BASE}/file/bot${getBotToken()}/${filePath}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Error HTTP definitivo (4xx): reintentar no lo arregla. */
class TelegramHttpError extends Error {}

/**
 * GET con timeout que cubre la petición COMPLETA (headers + lectura del cuerpo) y un
 * reintento ante falla transitoria (timeout, red, 5xx, 429). Un 4xx no se reintenta.
 */
async function getWithRetry<T>(
  url: string,
  timeoutMs: number,
  label: string,
  read: (resp: Response) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const isLast = attempt >= FILE_ATTEMPTS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { method: 'GET', signal: ctrl.signal });
      if (!resp.ok) {
        const transient = resp.status >= 500 || resp.status === 429;
        const err = new Error(`telegram ${label} HTTP ${resp.status}`);
        if (!transient) throw new TelegramHttpError(err.message);
        throw err;
      }
      return await read(resp);
    } catch (err) {
      if (isLast || err instanceof TelegramHttpError) throw err;
      log('warn', `telegram ${label} failed, retrying`, {
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

// ──────────────────────────────────────────────
// API surface
// ──────────────────────────────────────────────

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  parameters?: { retry_after?: number };
};

/**
 * Envía mensaje al chat. Retry 1× en 429.
 * NO throw: si falla, log warning y sigue (la DB ya tiene el reporte).
 */
export async function sendMessage(
  chatId: number,
  text: string,
): Promise<void> {
  const doSend = async (): Promise<Response> =>
    fetchWithTimeout(tgApiUrl('/sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

  try {
    let resp = await doSend();
    if (resp.status === 429) {
      const body = (await resp.json()) as TelegramApiResponse<unknown>;
      const retryAfter = body.parameters?.retry_after ?? 1;
      log('warn', 'telegram sendMessage 429, retrying', {
        chatId,
        retryAfter,
      });
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5) * 1000));
      resp = await doSend();
    }
    if (!resp.ok) {
      log('warn', 'telegram sendMessage non-OK', {
        chatId,
        status: resp.status,
      });
    }
  } catch (err) {
    log('warn', 'telegram sendMessage failed (non-fatal)', {
      chatId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export type GetFileResult = {
  filePath: string;
  fileSize: number;
  mimeType: string | null;
};

/**
 * Consulta metadata de un archivo. Reintenta 1× ante falla transitoria; throws si igual falla.
 */
export async function getFile(fileId: string): Promise<GetFileResult> {
  const body = await getWithRetry(
    tgApiUrl(`/getFile?file_id=${encodeURIComponent(fileId)}`),
    FILE_META_TIMEOUT_MS,
    'getFile',
    (resp) =>
      resp.json() as Promise<
        TelegramApiResponse<{ file_path: string; file_size?: number; mime_type?: string }>
      >,
  );
  if (!body.ok || !body.result) {
    throw new Error(`telegram getFile not ok: ${body.description ?? 'unknown'}`);
  }
  return {
    filePath: body.result.file_path,
    fileSize: body.result.file_size ?? 0,
    mimeType: body.result.mime_type ?? null,
  };
}

/**
 * Descarga el contenido del archivo. Reintenta 1× ante falla transitoria; throws si HTTP no-OK.
 */
export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
  return getWithRetry(tgFileUrl(filePath), FILE_DOWNLOAD_TIMEOUT_MS, 'downloadFile', (resp) =>
    resp.arrayBuffer(),
  );
}

/**
 * Configura el webhook (usado por /api/inbox/setup).
 */
export async function setWebhook(params: {
  url: string;
  secretToken: string;
  allowedUpdates?: string[];
  dropPendingUpdates?: boolean;
}): Promise<unknown> {
  const resp = await fetchWithTimeout(tgApiUrl('/setWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: params.url,
      secret_token: params.secretToken,
      allowed_updates: params.allowedUpdates ?? ['message', 'edited_message'],
      drop_pending_updates: params.dropPendingUpdates ?? true,
    }),
  });
  return await resp.json();
}

export async function getWebhookInfo(): Promise<unknown> {
  const resp = await fetchWithTimeout(tgApiUrl('/getWebhookInfo'), {
    method: 'GET',
  });
  return await resp.json();
}
