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

import { timingSafeEqual } from 'node:crypto';
import { log } from './inbox-logger';

const TG_BASE = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 8000;

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
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual lanza con longitudes distintas — early return.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
 * Consulta metadata de un archivo. Throws si Telegram retorna error.
 */
export async function getFile(fileId: string): Promise<GetFileResult> {
  const resp = await fetchWithTimeout(
    tgApiUrl(`/getFile?file_id=${encodeURIComponent(fileId)}`),
    { method: 'GET' },
  );
  if (!resp.ok) {
    throw new Error(`telegram getFile HTTP ${resp.status}`);
  }
  const body = (await resp.json()) as TelegramApiResponse<{
    file_path: string;
    file_size?: number;
    mime_type?: string;
  }>;
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
 * Descarga el contenido del archivo. Throws si HTTP no-OK.
 */
export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
  const resp = await fetchWithTimeout(tgFileUrl(filePath), { method: 'GET' });
  if (!resp.ok) {
    throw new Error(`telegram downloadFile HTTP ${resp.status}`);
  }
  return await resp.arrayBuffer();
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
