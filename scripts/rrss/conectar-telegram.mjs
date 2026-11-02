// Conecta el bot de RRSS con el teléfono de quien aprueba, en un solo comando.
//
// El token del bot no lo puede pegar Claude (el clasificador lo bloquea, y está
// bien: un token de bot es una credencial). Lo pega una persona. Todo lo demás
// —averiguar el chat_id, guardarlo y comprobar que el canal responde— no tiene
// por qué ser manual, y hacerlo a mano con `getUpdates` en el navegador deja el
// token escrito en el historial del browser. Este script lo evita.
//
//   1. Pegar en .env.local:  RRSS_TELEGRAM_BOT_TOKEN=<lo que dio BotFather>
//   2. node --env-file=.env.local scripts/rrss/conectar-telegram.mjs
//   3. Escribirle /start a @golfersplus_rrss_bot MIENTRAS el comando espera
//
// El orden importa: lo que ya estaba en la cola de mensajes se descarta. El bot
// está nombrado en un repo público y cualquiera puede escribirle, así que "el
// último que escribió" no identifica a nadie. Si en esa ventana escriben varios,
// no elige: los lista y pide `--chat <id>`.
//
// El token nunca se imprime: ni en la salida, ni en un error de red (va dentro
// de la URL de la API), ni en el mensaje de prueba.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

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
 * Los chats DISTINTOS que escribieron, del más reciente al más viejo.
 *
 * Devuelve la lista y no "el último" a propósito. @golfersplus_rrss_bot está
 * nombrado en un repo público: cualquiera puede apretar Iniciar. Con un solo chat
 * en la ventana se puede atribuir a quien corrió el comando; con dos no, y elegir
 * uno significa mandarle a un desconocido el reel, el caption sin publicar y los
 * tres botones de aprobación, dejando a Juanjo sin canal.
 *
 * No exige `/start` exacto: cualquier mensaje sirve, porque lo que identifica al
 * chat es haber escrito mientras el comando esperaba.
 */
export function chatsDeLasActualizaciones(updates) {
  const chats = []
  for (const u of [...updates].reverse()) {
    const msg = u.message ?? u.channel_post ?? u.callback_query?.message
    const chat = msg?.chat
    if (chat?.id == null) continue
    const id = String(chat.id)
    if (chats.some((c) => c.id === id)) continue
    chats.push({
      id,
      titulo: chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' '),
      tipo: chat.type,
      usuario: chat.username ?? null,
    })
  }
  return chats
}

/** El `offset` que confirma lo recibido: la próxima vuelta ya no lo devuelve. */
export function siguienteOffset(updates) {
  const ids = updates.map((u) => u.update_id).filter((n) => Number.isInteger(n))
  return ids.length ? Math.max(...ids) + 1 : null
}

/**
 * Dónde se escribe el archivo nuevo antes de renombrarlo sobre el viejo.
 *
 * El nombre importa y por eso está acá, a la vista y con un test: ese archivo es una
 * copia COMPLETA de .env.local —Supabase, Vercel, el token del bot— y este repo es
 * público. Tiene que calzar con la regla `.env*.local` de .gitignore, que es lo que lo
 * mantiene fuera de un `git add .`. El pid va para que dos corridas no se pisen.
 */
export function rutaTemporalDeEnv(ruta) {
  return path.join(path.dirname(ruta), `.env.tmp-${process.pid}.local`)
}

/**
 * Escribe la clave en .env.local sin tocar el resto del archivo ni reordenarlo:
 * ese archivo tiene las credenciales de Supabase y de todo lo demás, y
 * reescribirlo entero para agregar una línea es la forma conocida de perder una.
 */
export function guardarEnEnv(clave, valor, ruta = ENV) {
  const texto = existsSync(ruta) ? readFileSync(ruta, 'utf8') : ''
  const linea = `${clave}=${valor}`
  // 'g' además de 'm', y la línea entera con su salto: con la clave repetida —pasa,
  // se pega dos veces y nadie lo nota— reemplazar solo la primera dejaba viva la de
  // abajo, y en un .env gana la última: el archivo decía una cosa y el proceso leía
  // otra. La primera se queda con el valor nuevo y las demás se van.
  const re = new RegExp(`^${clave}=.*(\\r?\\n|$)`, 'gm')
  let puestas = 0
  const reemplazado = texto.replace(re, (_m, eol) => (puestas++ === 0 ? `${linea}${eol}` : ''))
  const estado = puestas ? 'actualizada' : 'agregada'
  const sep = texto === '' || texto.endsWith('\n') ? '' : '\n'
  const nuevo = puestas ? reemplazado : `${texto}${sep}${linea}\n`
  // Al lado y renombrar, no encima: `writeFileSync` trunca el archivo al abrirlo,
  // y si el proceso muere en ese instante .env.local queda vacío. Ahi viven las
  // credenciales de Supabase y de Vercel, el proyecto no arranca más y el error
  // aparece después, en otro comando, sin relación aparente con esto.
  //
  // El temporal NO se llama `.env.local.tmp`: eso no lo cubre ninguna regla de
  // .gitignore (`.env*.local` no calza) y el repo es público, así que un rename que
  // falla —en Windows con OneDrive sincronizando pasa— o un Ctrl+C dejaban en el
  // árbol una copia COMPLETA del archivo de credenciales lista para commitear. El
  // nombre de abajo calza con `.env*.local`, lleva el pid (dos corridas no se pisan)
  // y el finally lo borra pase lo que pase.
  const tmp = rutaTemporalDeEnv(ruta)
  try {
    writeFileSync(tmp, nuevo, { mode: 0o600 })
    renameSync(tmp, ruta)
  } finally {
    rmSync(tmp, { force: true })
  }
  return estado
}

/**
 * Cuál de los chats que escribieron es el que aprueba.
 *
 * No elige "el último" ni "el primero": el bot está nombrado en un repo público y
 * cualquiera puede escribirle, así que con dos chats en la misma ventana no hay forma
 * de saber cuál es el de Juanjo. Ahí se devuelve la decisión, que es el único camino
 * honesto: el chat que se guarda es el que va a recibir las tandas de la semana.
 *
 * @param {ReturnType<typeof chatsDeLasActualizaciones>} chats
 * @param {string | number | null} [chatPedido] lo que vino en `--chat`, tal cual se
 *   pega: con espacios al lado o como número si lo tomaron de otra pantalla.
 */
export function elegirChat(chats, chatPedido = null) {
  if (!chats.length) return { chat: null, motivo: 'sin-mensajes' }
  const pedido = chatPedido == null ? '' : String(chatPedido).trim()
  if (pedido) {
    const chat = chats.find((c) => c.id === pedido)
    return chat ? { chat, motivo: null } : { chat: null, motivo: 'no-escribio' }
  }
  if (chats.length > 1) return { chat: null, motivo: 'varios' }
  return { chat: chats[0], motivo: null }
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

  const args = process.argv.slice(2)
  const iChat = args.indexOf('--chat')
  const chatPedido = iChat === -1 ? null : String(args[iChat + 1] ?? '').trim()

  // Lo que ya estaba en la cola NO sirve para elegir el chat: pudo escribirlo
  // cualquiera que haya encontrado el bot. Se confirma con `offset` para que la
  // API no lo devuelva más y se espera un mensaje nuevo, que sí se puede atribuir
  // a quien está corriendo este comando.
  const viejas = await llamar('getUpdates', token, { timeout: 0, limit: 100 })
  let offset = siguienteOffset(viejas)
  if (viejas.length)
    console.log(
      `había ${viejas.length} mensaje(s) de antes, de ${chatsDeLasActualizaciones(viejas).length} chat(s): ` +
        'descartados. Solo cuenta lo que llegue ahora.',
    )

  // Long polling: si todavía no le escribió, se queda esperando hasta 60 s en vez
  // de decir "no hay nada" y obligar a correr el comando otra vez.
  console.log(`esperando un mensaje tuyo... escríbele /start a @${yo.username} desde tu Telegram`)
  let chats = []
  for (let vuelta = 0; vuelta < 2 && !chats.length; vuelta += 1) {
    const updates = await llamar('getUpdates', token, {
      timeout: 55,
      limit: 50,
      ...(offset == null ? {} : { offset }),
    })
    offset = siguienteOffset(updates) ?? offset
    chats = chatsDeLasActualizaciones(updates)
  }

  const { chat, motivo } = elegirChat(chats, chatPedido)

  if (motivo === 'sin-mensajes') {
    console.log(`
No llegó ningún mensaje. Abre Telegram, busca @${yo.username}, dale "Iniciar"
(o escribe /start) y vuelve a correr esto.`)
    process.exitCode = 3
    return
  }

  if (!chat) {
    console.log(
      motivo === 'no-escribio'
        ? `\nEl chat ${chatPedido} no escribió en esta ventana. Los que sí:`
        : '\nEscribieron varios chats a la vez y no hay forma de saber cuál aprueba.' +
            '\nElige el tuyo y vuelve a correr el comando con --chat <id>:',
    )
    chats.forEach((c) =>
      console.log(`  --chat ${c.id}   ${c.titulo || '(sin nombre)'}${c.usuario ? ` @${c.usuario}` : ''} (${c.tipo})`),
    )
    // Que quede dicho: la corrida siguiente descarta la cola igual que esta, así que
    // con --chat también hay que volver a escribirle. Sin esta línea se corre el
    // comando con el id correcto, no llega nada y parece que --chat no sirve.
    console.log(
      '\n   Ojo: la corrida nueva también descarta lo que ya esté en la cola.' +
        '\n   Escríbele /start otra vez MIENTRAS el comando espera.',
    )
    process.exitCode = 4
    return
  }

  const estado = guardarEnEnv('RRSS_TELEGRAM_CHAT_ID', chat.id)
  console.log(
    `chat guardado: ${chat.titulo || chat.id}${chat.usuario ? ` @${chat.usuario}` : ''} ` +
      `(${chat.tipo}) · clave ${estado} en ${ENV}`,
  )
  console.log('   Si ese nombre no eres tú: borra la clave y corre esto otra vez con --chat <tu id>.')

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
