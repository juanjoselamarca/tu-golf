/**
 * POST /api/inbox/webhook
 *
 * Webhook de Telegram para el Sistema de Inbox (Agente 5A).
 *
 * Seguridad (3 capas):
 *   1. Header X-Telegram-Bot-Api-Secret-Token (timing-safe compare).
 *   2. chat_id allowlist (excepto /start y /help).
 *   3. Supabase RLS (service_role bypasea, browser nunca toca esta tabla).
 *
 * Comportamiento:
 *   - 401 sin/incorrecto secret token.
 *   - 200 silencioso si el chat_id no está autorizado (no leakeamos
 *     existencia del bot a terceros).
 *   - 200 al final SIEMPRE — errors se loguean pero no se propagan,
 *     porque Telegram reintenta indefinidamente con 5xx.
 *
 * Soporta: texto, fotos (con álbumes via media_group_id), audio,
 * captions, edits (edited_message), replies (reply_to_message resuelto
 * a UUID interno).
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabaseAdmin';
import {
  sendMessage,
  getFile,
  downloadFile,
  extFromMime,
  safeEqualHeader,
} from '@/lib/telegram-inbox';
import { log } from '@/lib/inbox-logger';
import type {
  InboxReportInsert,
  InboxReportRow,
} from '@/types/inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STORAGE_BUCKET = 'inbox-photos';
const MEDIA_GROUP_WINDOW_SECONDS = 60;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// ──────────────────────────────────────────────
// Zod schemas (estricto sobre lo que usamos, permissive con resto)
// ──────────────────────────────────────────────
const TelegramPhotoSizeSchema = z.object({
  file_id: z.string(),
  file_size: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const TelegramAudioFileSchema = z.object({
  file_id: z.string(),
  mime_type: z.string().optional(),
  file_size: z.number().optional(),
});

const TelegramChatSchema = z.object({
  id: z.number(),
});

const TelegramUserSchema = z.object({
  id: z.number(),
}).partial();

const TelegramReplyToSchema = z.object({
  message_id: z.number(),
}).partial();

const TelegramMessageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: TelegramChatSchema,
  from: TelegramUserSchema.optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z.array(TelegramPhotoSizeSchema).optional(),
  audio: TelegramAudioFileSchema.optional(),
  voice: TelegramAudioFileSchema.optional(),
  media_group_id: z.string().optional(),
  reply_to_message: TelegramReplyToSchema.optional(),
});

const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: TelegramMessageSchema.optional(),
  edited_message: TelegramMessageSchema.optional(),
});

type TelegramMessage = z.infer<typeof TelegramMessageSchema>;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function getAllowedChatId(): number | null {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isAuthorizedChat(chatId: number): boolean {
  const allowed = getAllowedChatId();
  return allowed !== null && allowed === chatId;
}

function storagePathForUpload(ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `reports/${yyyy}/${mm}/${randomUUID()}.${ext}`;
}

function isoFromUnix(secs: number): string {
  return new Date(secs * 1000).toISOString();
}

async function uploadToBucket(
  supabase: ReturnType<typeof createAdminClient>,
  storagePath: string,
  buffer: ArrayBuffer,
  mime: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mime,
      upsert: false,
    });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function downloadAndStore(
  supabase: ReturnType<typeof createAdminClient>,
  fileId: string,
  chatId: number,
  fallbackMime: string,
): Promise<{ ok: true; path: string } | { ok: false; reason: 'too_large' | 'mime_blocked' | 'error' }> {
  const meta = await getFile(fileId);
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
  const buffer = await downloadFile(meta.filePath);
  const path = storagePathForUpload(ext);
  const up = await uploadToBucket(supabase, path, buffer, effectiveMime);
  if (!up.ok) {
    log('error', 'inbox upload failed', { error: up.error, path });
    return { ok: false, reason: 'error' };
  }
  return { ok: true, path };
}

// ──────────────────────────────────────────────
// Comandos
// ──────────────────────────────────────────────
async function handleStartHelp(msg: TelegramMessage, isStart: boolean): Promise<void> {
  const lines = isStart
    ? [
        '👋 Hola, soy el bot de Inbox de Golfers+.',
        '',
        `Tu chat_id es: ${msg.chat.id}`,
        '',
        'Agregalo a TELEGRAM_ALLOWED_CHAT_ID en Vercel y redeployea.',
        'Después podés mandarme texto, fotos o audio con bugs/ideas.',
      ]
    : [
        'Comandos disponibles:',
        '/start — info inicial y tu chat_id',
        '/help — esta ayuda',
        '/pendientes — cuántos reportes hay sin triage',
        '/historial — últimos 10 reportes',
        '/borrar_ultimo — borra el último reporte con status=nuevo',
        '',
        'Cualquier otro mensaje (texto, foto, audio) se guarda como reporte nuevo.',
      ];
  await sendMessage(msg.chat.id, lines.join('\n'));
}

async function handlePendientes(
  supabase: ReturnType<typeof createAdminClient>,
  chatId: number,
): Promise<void> {
  const { count, error } = await supabase
    .from('inbox_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'nuevo');
  if (error) {
    log('error', 'inbox /pendientes count failed', { error: error.message });
    await sendMessage(chatId, '❌ no pude leer la BD');
    return;
  }
  await sendMessage(chatId, `Tenés ${count ?? 0} pendiente${count === 1 ? '' : 's'}.`);
}

async function handleHistorial(
  supabase: ReturnType<typeof createAdminClient>,
  chatId: number,
): Promise<void> {
  const { data, error } = await supabase
    .from('inbox_reports')
    .select('id, texto, status, recibido_en')
    .order('recibido_en', { ascending: false })
    .limit(10);
  if (error) {
    log('error', 'inbox /historial failed', { error: error.message });
    await sendMessage(chatId, '❌ no pude leer la BD');
    return;
  }
  const rows = (data ?? []) as Pick<InboxReportRow, 'id' | 'texto' | 'status' | 'recibido_en'>[];
  if (rows.length === 0) {
    await sendMessage(chatId, 'Sin reportes todavía.');
    return;
  }
  const lines = rows.map((r, i) => {
    const txt = (r.texto ?? '(sin texto)').slice(0, 50);
    return `${i + 1}. [${r.status}] ${txt}`;
  });
  await sendMessage(chatId, lines.join('\n'));
}

async function handleBorrarUltimo(
  supabase: ReturnType<typeof createAdminClient>,
  chatId: number,
): Promise<void> {
  const { data: candidate, error: selErr } = await supabase
    .from('inbox_reports')
    .select('id')
    .eq('status', 'nuevo')
    .order('recibido_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selErr) {
    log('error', 'inbox /borrar_ultimo select failed', { error: selErr.message });
    await sendMessage(chatId, '❌ no pude leer la BD');
    return;
  }
  if (!candidate) {
    await sendMessage(chatId, 'no hay nada para borrar');
    return;
  }
  const { error: delErr } = await supabase
    .from('inbox_reports')
    .delete()
    .eq('id', candidate.id);
  if (delErr) {
    log('error', 'inbox /borrar_ultimo delete failed', { error: delErr.message });
    await sendMessage(chatId, '❌ no pude borrar');
    return;
  }
  await sendMessage(chatId, '✓ borrado');
}

// ──────────────────────────────────────────────
// Procesar mensaje (no-comando)
// ──────────────────────────────────────────────
async function resolveReplyTo(
  supabase: ReturnType<typeof createAdminClient>,
  msg: TelegramMessage,
): Promise<string | null> {
  const replyMsgId = msg.reply_to_message?.message_id;
  if (!replyMsgId) return null;
  const { data, error } = await supabase
    .from('inbox_reports')
    .select('id')
    .eq('telegram_message_id', replyMsgId)
    .eq('telegram_chat_id', msg.chat.id)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

async function findRecentMediaGroup(
  supabase: ReturnType<typeof createAdminClient>,
  msg: TelegramMessage,
): Promise<{ id: string; fotos_paths: string[]; caption: string | null } | null> {
  const groupId = msg.media_group_id;
  if (!groupId) return null;
  const cutoff = isoFromUnix(msg.date - MEDIA_GROUP_WINDOW_SECONDS);
  const { data, error } = await supabase
    .from('inbox_reports')
    .select('id, fotos_paths, caption')
    .eq('telegram_media_group_id', groupId)
    .eq('telegram_chat_id', msg.chat.id)
    .gte('telegram_msg_date', cutoff)
    .order('recibido_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    fotos_paths: (data.fotos_paths ?? []) as string[],
    caption: (data.caption ?? null) as string | null,
  };
}

async function processNonCommand(
  supabase: ReturnType<typeof createAdminClient>,
  msg: TelegramMessage,
  isEdit: boolean,
): Promise<void> {
  // Caso edited_message → UPDATE existente, NO re-procesar media
  if (isEdit) {
    const { error } = await supabase
      .from('inbox_reports')
      .update({
        texto: msg.text ?? null,
        caption: msg.caption ?? null,
        editado_en: new Date().toISOString(),
      })
      .eq('telegram_message_id', msg.message_id)
      .eq('telegram_chat_id', msg.chat.id);
    if (error) {
      log('error', 'inbox edit update failed', { error: error.message });
      return;
    }
    await sendMessage(msg.chat.id, '✓ editado');
    return;
  }

  // Procesar media (fotos y/o audio)
  const photosPaths: string[] = [];
  let audioPath: string | null = null;

  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    // Telegram comprime fotos a JPEG y no expone mime_type en getFile.
    const result = await downloadAndStore(
      supabase,
      largest.file_id,
      msg.chat.id,
      'image/jpeg',
    );
    if (!result.ok) {
      // El sendMessage de error ya se mandó dentro de downloadAndStore.
      // Marcamos status=error con un INSERT mínimo solo si no es álbum.
      if (!msg.media_group_id) {
        await insertOrUpdateReport(supabase, msg, [], null, 'error');
      }
      return;
    }
    photosPaths.push(result.path);
  }

  const audioObj = msg.audio ?? msg.voice;
  if (audioObj) {
    // Voice messages = audio/ogg, audio files = mime del payload o audio/mpeg.
    const fallback =
      audioObj.mime_type ?? (msg.voice ? 'audio/ogg' : 'audio/mpeg');
    const result = await downloadAndStore(
      supabase,
      audioObj.file_id,
      msg.chat.id,
      fallback,
    );
    if (!result.ok) {
      await insertOrUpdateReport(supabase, msg, photosPaths, null, 'error');
      return;
    }
    audioPath = result.path;
  }

  await insertOrUpdateReport(supabase, msg, photosPaths, audioPath, 'nuevo');
  await sendMessage(msg.chat.id, '✓ recibido');
}

async function insertOrUpdateReport(
  supabase: ReturnType<typeof createAdminClient>,
  msg: TelegramMessage,
  newPhotos: string[],
  audioPath: string | null,
  status: 'nuevo' | 'error',
): Promise<void> {
  // Caso álbum: si hay row reciente con mismo media_group_id, UPDATE.
  const existing = await findRecentMediaGroup(supabase, msg);
  if (existing) {
    const merged_photos = [...existing.fotos_paths, ...newPhotos];
    const merged_caption = existing.caption ?? msg.caption ?? null;
    const { error } = await supabase
      .from('inbox_reports')
      .update({
        fotos_paths: merged_photos,
        caption: merged_caption,
      })
      .eq('id', existing.id);
    if (error) {
      log('error', 'inbox media_group merge failed', { error: error.message });
    }
    return;
  }

  // INSERT nuevo
  const replyToId = await resolveReplyTo(supabase, msg);
  const insertPayload: InboxReportInsert = {
    telegram_message_id: msg.message_id,
    telegram_chat_id: msg.chat.id,
    telegram_user_id: msg.from?.id ?? null,
    telegram_media_group_id: msg.media_group_id ?? null,
    telegram_msg_date: isoFromUnix(msg.date),
    texto: msg.text ?? null,
    caption: msg.caption ?? null,
    fotos_paths: newPhotos,
    audio_path: audioPath,
    reply_to_report_id: replyToId,
    status,
  };
  const { error } = await supabase.from('inbox_reports').insert(insertPayload);
  if (error) {
    log('error', 'inbox insert failed', { error: error.message });
  }
}

// ──────────────────────────────────────────────
// POST handler
// ──────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth header timing-safe
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expectedSecret) {
      log('error', 'TELEGRAM_WEBHOOK_SECRET missing in runtime');
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    const received = req.headers.get('x-telegram-bot-api-secret-token');
    if (!safeEqualHeader(received, expectedSecret)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // 2. Parse body
    const rawBody = await req.json().catch(() => null);
    const parsed = TelegramUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      log('warn', 'inbox webhook unparseable update', {
        issues: parsed.error.issues.length,
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const update = parsed.data;
    const msg = update.message ?? update.edited_message;
    if (!msg) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const isEdit = !!update.edited_message;

    // 3. Routing
    const text = msg.text ?? '';
    const isCommand = text.startsWith('/');
    const command = isCommand ? text.split(/\s+/)[0].toLowerCase() : null;

    // 3a. Bootstrap commands (sin allowlist)
    if (command === '/start' || command === '/help') {
      await handleStartHelp(msg, command === '/start');
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 3b. Resto: validar allowlist (200 silencioso si no)
    if (!isAuthorizedChat(msg.chat.id)) {
      log('warn', 'inbox unauthorized chat', { chatId: msg.chat.id });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const supabase = createAdminClient();

    // 3c. Comandos autorizados
    if (isCommand) {
      if (command === '/pendientes') {
        await handlePendientes(supabase, msg.chat.id);
      } else if (command === '/historial') {
        await handleHistorial(supabase, msg.chat.id);
      } else if (command === '/borrar_ultimo') {
        await handleBorrarUltimo(supabase, msg.chat.id);
      } else {
        await sendMessage(msg.chat.id, `Comando desconocido: ${command}. Probá /help.`);
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 3d. Mensaje no-comando
    await processNonCommand(supabase, msg, isEdit);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    log('error', 'inbox webhook unhandled', {
      err: err instanceof Error ? err.message : String(err),
    });
    // SIEMPRE 200 — no propagar a Telegram para evitar retries infinitos.
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
