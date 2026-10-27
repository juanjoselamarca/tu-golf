// Cliente mínimo del bot de RRSS en Telegram (@golfersplus_rrss_bot).
//
// Es un bot APARTE del de bugs (@Golfers_App_Bot, `TELEGRAM_BOT_TOKEN`): mezclar
// "se cayó el scorer en un torneo" con "¿apruebas este reel?" en la misma
// conversación garantiza que un día se apruebe lo que había que arreglar. Si
// `RRSS_TELEGRAM_BOT_TOKEN` no está, el canal de aprobación cae a `chat` solo
// (ver aprobacion.mjs) en vez de pedirle prestado el bot al inbox.
//
// Sin webhook y sin ruta API a propósito: las decisiones se leen con getUpdates
// cuando el sistema corre. Un webhook obliga a exponer una ruta dentro del deploy
// que corre los torneos y a guardar un secreto más en Vercel, justo lo que el
// principio "aislado de la app de producción" quiere evitar. Telegram guarda las
// actualizaciones 24 h, que es de sobra para un ritmo semanal.
import { basename } from 'node:path'
import { openAsBlob } from 'node:fs'

const API = 'https://api.telegram.org'

/**
 * El token va DENTRO de la URL de la API de Telegram, así que cualquier error de
 * red que incluya la URL lo escribiría en un log o en la salida de un script. Todo
 * lo que sale de este módulo pasa por acá antes.
 */
function sinSecretos(texto, token) {
  const t = String(texto ?? '')
  return token ? t.replaceAll(token, '<RRSS_TELEGRAM_BOT_TOKEN>') : t
}

/**
 * Credenciales del bot, o null si no están. Devolver null en vez de tirar error es
 * lo que permite que el sistema completo se pueda probar sin Telegram.
 */
export function credenciales(env = process.env) {
  const token = env.RRSS_TELEGRAM_BOT_TOKEN?.trim()
  const chatId = env.RRSS_TELEGRAM_CHAT_ID?.trim()
  if (!token || !chatId) return null
  return { token, chatId }
}

async function llamar(metodo, cuerpo, { token }) {
  let res
  try {
    const esForm = cuerpo instanceof FormData
    res = await fetch(`${API}/bot${token}/${metodo}`, {
      method: 'POST',
      ...(esForm ? { body: cuerpo } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }),
    })
  } catch (e) {
    throw new Error(`Telegram ${metodo}: ${sinSecretos(e.message, token)}`)
  }
  const texto = await res.text()
  let datos
  try {
    datos = JSON.parse(texto)
  } catch {
    throw new Error(`Telegram ${metodo}: respuesta que no es JSON (HTTP ${res.status})`)
  }
  if (!datos.ok)
    throw new Error(`Telegram ${metodo}: ${sinSecretos(datos.description ?? `HTTP ${res.status}`, token)}`)
  return datos.result
}

export async function mandarTexto(texto, creds, { botones } = {}) {
  return llamar(
    'sendMessage',
    {
      chat_id: creds.chatId,
      text: texto,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(botones ? { reply_markup: { inline_keyboard: [botones.map(({ texto: t, dato }) => ({ text: t, callback_data: dato }))] } } : {}),
    },
    creds,
  )
}

/**
 * Manda un archivo. `tipo` decide el método: una hoja de contactos va como foto
 * (se ve en el chat) y un reel como video. Un PNG de 1080×1350 mandado como
 * documento llega sin vista previa y hay que descargarlo para revisarlo, que es
 * exactamente lo que hace que una aprobación se postergue.
 */
export async function mandarArchivo(tipo, ruta, creds, { pie = '' } = {}) {
  const campo = { foto: 'photo', video: 'video', documento: 'document' }[tipo]
  if (!campo) throw new Error(`Tipo de archivo "${tipo}" desconocido: foto, video o documento.`)
  const metodo = { foto: 'sendPhoto', video: 'sendVideo', documento: 'sendDocument' }[tipo]
  const form = new FormData()
  form.set('chat_id', creds.chatId)
  form.set(campo, await openAsBlob(ruta), basename(ruta))
  if (pie) {
    form.set('caption', pie)
    form.set('parse_mode', 'HTML')
  }
  return llamar(metodo, form, creds)
}

/**
 * Las decisiones que Juanjo tocó desde `offset`, en orden. Devuelve también el
 * offset siguiente para guardarlo: sin eso, la próxima corrida vuelve a leer la
 * misma decisión y una tanda ya aprobada se "aprobaría" de nuevo.
 */
export async function leerDecisiones(offset, creds, { esperaSegundos = 0 } = {}) {
  const updates = await llamar(
    'getUpdates',
    {
      ...(offset ? { offset } : {}),
      timeout: esperaSegundos,
      allowed_updates: ['callback_query', 'message'],
    },
    creds,
  )
  const decisiones = updates
    .filter((u) => u.callback_query)
    .map((u) => ({
      dato: u.callback_query.data,
      idCallback: u.callback_query.id,
      deChat: String(u.callback_query.message?.chat?.id ?? ''),
      updateId: u.update_id,
    }))
  // Mensajes de texto: es como llega una nota de "pedir cambios" y como llegan
  // las referencias que Juanjo reenvía (nivel 1 del sistema).
  const mensajes = updates
    .filter((u) => u.message?.text)
    .map((u) => ({
      texto: u.message.text,
      deChat: String(u.message.chat?.id ?? ''),
      updateId: u.update_id,
    }))
  const ultimo = updates.at(-1)?.update_id
  return { decisiones, mensajes, siguienteOffset: ultimo == null ? offset : ultimo + 1 }
}

/**
 * Solo el chat de Juanjo manda. Sin esto, cualquiera que encuentre el bot puede
 * apretar un botón y aprobar una publicación: los `callback_data` son adivinables
 * y el bot responde a quien le escriba.
 */
export function esDeJuanjo(evento, creds) {
  return evento.deChat === creds.chatId
}

/** Apaga el relojito del botón. Sin esto el botón queda "cargando" en el teléfono. */
export async function confirmarToque(idCallback, creds, { aviso = '' } = {}) {
  return llamar('answerCallbackQuery', { callback_query_id: idCallback, text: aviso }, creds)
}
