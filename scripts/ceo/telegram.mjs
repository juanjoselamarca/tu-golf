/**
 * scripts/ceo/telegram.mjs — envío a Telegram sin perder avisos.
 *
 * Los avisos importantes (semanal agotado, violación de reglas, scheduler caído)
 * se guardan primero en `night.notifications` y después se intentan enviar. Si
 * Telegram está caído quedan `sent:false` y el watchdog los reenvía.
 *
 * Pruebas: CEO_FAKE_TELEGRAM=<archivo.jsonl> escribe los mensajes ahí en vez de enviarlos.
 */

import { appendFileSync } from 'node:fs';

const MAX_CHARS = 4000; // límite duro de Telegram: 4096

function creds() {
  return { token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_ADMIN_CHAT_ID };
}

function clip(text) {
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 20)}\n\n[…truncado]` : text;
}

async function call(method, payload) {
  const fake = process.env.CEO_FAKE_TELEGRAM;
  if (fake) {
    appendFileSync(fake, JSON.stringify({ method, ...payload }) + '\n');
    return { ok: true, result: { message_id: Date.now() % 100000 } };
  }
  const { token } = creds();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  return res.json();
}

/** Mensaje nuevo. Devuelve message_id o null. */
export async function sendNew(text, log = () => {}, { silent = false } = {}) {
  const { token, chatId } = creds();
  if (!process.env.CEO_FAKE_TELEGRAM && (!token || !chatId)) { log('⚠ Telegram sin credenciales'); return null; }
  try {
    const json = await call('sendMessage', { chat_id: chatId, text: clip(text), disable_notification: silent });
    if (!json.ok) { log(`⚠ Telegram: ${JSON.stringify(json).slice(0, 200)}`); return null; }
    return json.result.message_id;
  } catch (e) {
    log(`⚠ Telegram falló: ${e.message}`);
    return null;
  }
}

/** Edita el mensaje de estado de la noche. No llama a la API si el texto no cambió. */
export async function editIfChanged(messageId, text, lastText, log = () => {}) {
  if (!messageId || text === lastText) return lastText;
  const { chatId } = creds();
  try {
    const json = await call('editMessageText', { chat_id: chatId, message_id: messageId, text: clip(text) });
    if (!json.ok && !/not modified/i.test(json.description || '')) log(`⚠ Telegram edit: ${json.description}`);
    return text;
  } catch (e) {
    log(`⚠ Telegram edit falló: ${e.message}`);
    return lastText;
  }
}

/**
 * Intenta enviar los avisos pendientes de la noche. Muta `night`.
 * Los P0 salen siempre; el resto espera a `quietUntilPassed` (no despertar a
 * Juanjo a las 3 am por un aviso informativo).
 */
export async function flushNotifications(night, log = () => {}, { quietUntilPassed = true } = {}) {
  for (const n of night.notifications) {
    if (n.sent) continue;
    if (n.kind !== 'p0' && !quietUntilPassed) continue;
    const id = await sendNew(n.text, log);
    if (id) n.sent = true;
  }
}
