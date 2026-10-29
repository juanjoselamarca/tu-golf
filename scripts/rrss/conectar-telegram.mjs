// Conecta el bot de RRSS con el teléfono de quien aprueba, en un solo comando.
//
// El token del bot no lo puede pegar Claude (el clasificador lo bloquea, y está
// bien: un token de bot es una credencial). Lo pega una persona. Todo lo demás
// —averiguar el chat_id, guardarlo y comprobar que el canal responde— no tiene
// por qué ser manual, y hacerlo a mano con `getUpdates` en el navegador deja el
// token escrito en el historial del browser. Este script lo evita.
//
//   1. Pegar en .env.local:  RRSS_TELEGRAM_BOT_TOKEN=<lo que dio BotFather>
//   2. Escribirle /start a @golfersplus_rrss_bot desde el teléfono
//   3. node --env-file=.env.local scripts/rrss/conectar-telegram.mjs
//
// El token nunca se imprime: ni en la salida, ni en un error de red (va dentro
// de la URL de la API), ni en el mensaje de prueba.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const API = 'https://api.telegram.org'
const ENV = '.env.local'
const BOT = '@golfersplus_rrss_bot'

/** Nada que salga de acá puede llevar el token: va dentro de la URL de la API. */
function sinSecretos(texto, token) {
  const t = String(texto ?? '')
  return token ? t.replaceAll(token, '<RRSS_TELEGRAM_BOT_TOKEN>') : t
}

async function llamar(metodo, token, cuerpo = {}) {
  let res
  try {
    res = await fetch(`${API}/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  } catch (e) {
    throw new Error(`Telegram ${metodo}: ${sinSecretos(e.message, token)}`)
  }
  const datos = await res.json().catch(() => null)
  if (!datos?.ok)
    throw new Error(`Telegram ${metodo}: ${sinSecretos(datos?.description ?? `HTTP ${res.status}`, token)}`)
  return datos.result
}

/**
 * De dónde sale el chat: el ÚLTIMO mensaje recibido, sea `/start` o cualquier
 * otro. Si se exigiera `/start` exacto, alguien que ya le escribió al bot antes
 * de correr esto tendría que adivinar por qué no lo encuentra.
 */
export function chatDeLasActualizaciones(updates) {
  for (const u of [...updates].reverse()) {
    const msg = u.message ?? u.channel_post ?? u.callback_query?.message
    const chat = msg?.chat
    if (chat?.id != null) return { id: String(chat.id), titulo: chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ') ?? '', tipo: chat.type }
  }
  return null
}

/**
 * Escribe la clave en .env.local sin tocar el resto del archivo ni reordenarlo:
 * ese archivo tiene las credenciales de Supabase y de todo lo demás, y
 * reescribirlo entero para agregar una línea es la forma conocida de perder una.
 */
export function guardarEnEnv(clave, valor, ruta = ENV) {
  const texto = existsSync(ruta) ? readFileSync(ruta, 'utf8') : ''
  const linea = `${clave}=${valor}`
  const re = new RegExp(`^${clave}=.*$`, 'm')
  if (re.test(texto)) {
    writeFileSync(ruta, texto.replace(re, linea))
    return 'actualizada'
  }
  const sep = texto === '' || texto.endsWith('\n') ? '' : '\n'
  writeFileSync(ruta, `${texto}${sep}${linea}\n`)
  return 'agregada'
}

async function main() {
  const token = process.env.RRSS_TELEGRAM_BOT_TOKEN?.trim()
  if (!token) {
    console.log(`Falta el token del bot. Son 30 segundos:

  1. Abre el chat con BotFather y copia el token de ${BOT}
     (si no lo tienes a mano: mándale /token y elige el bot)
  2. Pégalo en ${ENV} como una línea nueva:

       RRSS_TELEGRAM_BOT_TOKEN=<pega acá lo que te dio BotFather>

  3. Vuelve a correr este comando.`)
    process.exitCode = 2
    return
  }

  const yo = await llamar('getMe', token)
  console.log(`bot: @${yo.username} (${yo.first_name})`)

  // Long polling: si todavía no le escribió, se queda esperando hasta 60 s en vez
  // de decir "no hay nada" y obligar a correr el comando otra vez.
  console.log(`esperando un mensaje tuyo... escríbele /start a @${yo.username} desde tu Telegram`)
  let updates = await llamar('getUpdates', token, { timeout: 55, limit: 50 })
  let chat = chatDeLasActualizaciones(updates)
  if (!chat) {
    updates = await llamar('getUpdates', token, { timeout: 55, limit: 50 })
    chat = chatDeLasActualizaciones(updates)
  }

  if (!chat) {
    console.log(`
No llegó ningún mensaje. Abre Telegram, busca @${yo.username}, dale "Iniciar"
(o escribe /start) y vuelve a correr esto.`)
    process.exitCode = 3
    return
  }

  const estado = guardarEnEnv('RRSS_TELEGRAM_CHAT_ID', chat.id)
  console.log(`chat encontrado: ${chat.titulo || chat.id} (${chat.tipo}) · clave ${estado} en ${ENV}`)

  await llamar('sendMessage', token, {
    chat_id: chat.id,
    text: [
      'Canal de aprobación conectado.',
      '',
      'Por acá te van a llegar las tandas de la semana: el reel, el caption y tres botones',
      '(Aprobar · Pedir cambios · Rechazar). Nada se publica solo, ni siquiera con tu Aprobar:',
      'eso solo deja la carpeta lista para subir.',
    ].join('\n'),
  })
  console.log('mensaje de prueba enviado · listo para recibir tandas')
}

// Solo corre como comando: el test importa las funciones puras de arriba.
if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
}
