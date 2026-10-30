// El portón del sistema: una tanda sale a Instagram solo si Juanjo la aprobó.
//
// Dos canales, el mismo portón:
//   · `telegram` — el bot manda la vista previa con tres botones (Aprobar todo /
//     Pedir cambios / Rechazar) y acá se leen los toques. Es el modo normal.
//   · `chat` — si no hay credenciales del bot, la tanda se presenta en la sesión
//     de Claude Code y el veredicto se registra con `node ... --veredicto`. No es
//     un modo de juguete: es el que permite probar el sistema completo sin esperar
//     ningún token, y es el que queda si un día Telegram se cae.
//
// Lo que NO hace: aprobar por su cuenta. No hay ruta, bandera ni variable de
// entorno que salte este paso, porque el día que exista, una pieza con un dato
// mal calculado sale publicada mientras nadie mira.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { escribirTanda, leerTanda, pendientesDeAprobacion, transicionar } from './cola.mjs'
import { huellaTexto, huellaVisual } from './marca.mjs'
import { huellaEscena } from './escenas.mjs'
import { sinRutasDeDisco } from './saneado.mjs'
import { confirmarToque, credenciales, escaparHtml, esDelChatAprobador, leerDecisiones, mandarArchivo, mandarTexto } from './telegram.mjs'
import { dirSalida } from './publicar.mjs'

/**
 * Dónde se recuerda hasta qué actualización de Telegram ya se leyó. Vive en
 * `out/` (fuera del repo) porque es ruido de operación, no una decisión.
 *
 * Si el archivo se pierde, la próxima corrida vuelve a leer toques viejos. No es
 * grave y no se arregla con un archivo más seguro: lo que impide que una tanda se
 * apruebe dos veces es la máquina de estados de cola.mjs, que rechaza
 * `aprobada → aprobada`. Un marcador perdido produce un aviso, no una
 * publicación duplicada.
 *
 * Sale de `dirSalida()` y no de un `path.join` propio: es la misma carpeta
 * `out/rrss` que usa todo el resto, y con un segundo cálculo un test que
 * recoge veredictos escribía en la de verdad aunque hubiera stubeado
 * `RRSS_DIR_SALIDA`.
 */
function rutaEstadoTelegram() {
  return path.join(dirSalida(), 'telegram-estado.json')
}

export const VEREDICTOS = {
  aprobar: 'aprobada',
  rechazar: 'rechazada',
  cambios: 'cambios_pedidos',
}

export function canal(env = process.env) {
  return credenciales(env) ? 'telegram' : 'chat'
}

function leerEstadoTelegram() {
  const ruta = rutaEstadoTelegram()
  if (!existsSync(ruta)) return { offset: 0, esperandoNotaDe: null }
  try {
    return { offset: 0, esperandoNotaDe: null, ...JSON.parse(readFileSync(ruta, 'utf8')) }
  } catch {
    return { offset: 0, esperandoNotaDe: null }
  }
}

function escribirEstadoTelegram(estado) {
  const ruta = rutaEstadoTelegram()
  mkdirSync(path.dirname(ruta), { recursive: true })
  writeFileSync(ruta, `${JSON.stringify(estado, null, 2)}\n`)
}

/**
 * El texto de la vista previa. Separado del envío para poder leerlo en el canal
 * `chat` y para que un test pueda afirmar que la tanda llega con lo que hace
 * falta para decidir: la idea, cada pieza con su rol y su hora, y el caption
 * completo. Una vista previa sin el caption obliga a abrir archivos para aprobar,
 * y una aprobación que cuesta trabajo no se da.
 *
 * El `formato` decide cómo salen el énfasis y los datos, porque este mismo resumen va a
 * dos lados: a Telegram, que lo interpreta como HTML, y a la consola cuando no hay bot
 * configurado —que es el camino por el que pasa una tanda antes de que el token esté
 * puesto—. Escapar dentro del compositor servía para Telegram y le arruinaba el otro: en
 * la consola se leía `Scramble &amp; best ball` y `&lt;5 sobre par`, o sea un caption que
 * no es el que se va a publicar, en la pantalla donde se aprueba. Así que el compositor
 * dice qué es dato y qué es énfasis, y el formato lo elige quien manda.
 *
 * En `html` las únicas etiquetas del mensaje son las del énfasis de acá: cada dato que
 * viene del contenido pasa por `escaparHtml`. Sin eso, un caption con "<5 sobre par" —que
 * en golf se escribe todo el tiempo— hace que Telegram rechace el mensaje entero y la
 * vista previa no llegue. El default es `html` porque es el modo que se cae en silencio
 * si se olvida: en la consola un `&amp;` se ve raro, en Telegram no llega nada.
 */
export function resumenDeTanda(tanda, piezas, { formato = 'html' } = {}) {
  const dato = formato === 'html' ? escaparHtml : (t) => String(t)
  const fuerte = formato === 'html' ? (t) => `<b>${t}</b>` : (t) => String(t)
  const lineas = [fuerte(`Tanda ${dato(tanda.slug)}`), '', dato(tanda.idea), '']
  for (const p of tanda.piezas) {
    const pieza = piezas[p.pieza]
    lineas.push(
      `${fuerte(dato(p.rol.toUpperCase()))} · ${dato(pieza?.formato ?? '?')} · ${dato(p.pieza)}`,
    )
    if (p.hora_sugerida) lineas.push(`Hora sugerida: ${dato(p.hora_sugerida)}`)
    if (pieza?.caption) lineas.push('', dato(pieza.caption))
    if (pieza?.hashtags?.length) lineas.push(dato(pieza.hashtags.join(' ')))
    lineas.push('')
  }
  return lineas.join('\n').trim()
}

const BOTONES = (slug) => [
  { texto: '✅ Aprobar todo', dato: `aprobar:${slug}` },
  { texto: '✏️ Pedir cambios', dato: `cambios:${slug}` },
  { texto: '✖️ Rechazar', dato: `rechazar:${slug}` },
]

/**
 * Manda la tanda a aprobar y la deja en `en_revision`.
 *
 * `adjuntos` son las rutas que ya produjo el render: la hoja de contactos de cada
 * pieza y el MP4 del reel si hay. Se mandan ANTES del texto con botones para que
 * los botones queden al final del chat, que es donde el pulgar llega.
 */
export async function enviarParaAprobacion(tanda, { piezas = {}, adjuntos = [], env = process.env } = {}) {
  // Lo que se muestra queda sellado en la tanda: el texto (el caption y los
  // hashtags que lleva la vista previa), lo visual (las láminas de la hoja de
  // contactos) y, en un reel, la escena. `empaquetar` vuelve a leer el JSON de
  // la pieza desde disco días después: sin las huellas, una corrección posterior
  // sale publicada bajo un "Aprobada por Juanjo" que ya no corresponde. Las
  // piezas siguen siendo referencias y no copias —esa decisión no cambia—, lo
  // que se guarda es la huella de lo que se mostró, no el contenido.
  //
  // Sellar solo el texto no alcanzaba: una lámina corregida y vuelta a
  // renderizar mueve la pieza y su `publicacion.json` a la vez, así que el
  // control de "render al día" calza y el de texto no se entera.
  const sellada = {
    ...tanda,
    piezas: tanda.piezas.map((p) => {
      const pieza = piezas[p.pieza]
      if (!pieza) return p
      return {
        ...p,
        huella_texto: huellaTexto(pieza),
        huella_visual: huellaVisual(pieza),
        ...(pieza.escena != null ? { huella_escena: huellaEscena(pieza.escena) } : {}),
      }
    }),
  }
  const enRevision = transicionar(sellada, 'en_revision', { nota: `vista previa enviada por ${canal(env)}` })
  const creds = credenciales(env)
  // El que se devuelve es el plano: se imprime en la consola cuando no hay bot y es el
  // que lee un test para afirmar que la tanda llega con lo que hace falta para decidir.
  const texto = resumenDeTanda(enRevision, piezas, { formato: 'plano' })
  if (creds) {
    for (const a of adjuntos) {
      if (!existsSync(a.ruta)) throw new Error(`La tanda ${tanda.slug} declara un adjunto que no existe: ${a.ruta}`)
      await mandarArchivo(a.tipo, a.ruta, creds, { pie: a.pie ?? '' })
    }
    await mandarTexto(resumenDeTanda(enRevision, piezas, { formato: 'html' }), creds, {
      botones: BOTONES(enRevision.slug),
    })
  }
  escribirTanda(enRevision)
  return { tanda: enRevision, canal: canal(env), texto, adjuntos }
}

/**
 * Aplica un veredicto a una tanda. Es el único camino por el que una tanda llega
 * a `aprobada`, venga de un botón de Telegram o de la línea de comandos.
 */
export function registrarVeredicto(slug, veredicto, { nota = '', quien = 'juanjo' } = {}) {
  const destino = VEREDICTOS[veredicto]
  if (!destino) throw new Error(`Veredicto "${veredicto}" desconocido. Hay: ${Object.keys(VEREDICTOS).join(', ')}.`)
  const tanda = leerTanda(slug)
  if (!tanda) throw new Error(`No existe la tanda ${slug}.`)
  // `aprobada_por` solo cuando de verdad se aprobó: escribirlo en cualquier
  // veredicto dejaba una tanda RECHAZADA con `aprobada_por: "juanjo"`, y ese
  // campo es el único registro de quién dio el visto bueno.
  const extra = destino === 'aprobada' ? { aprobada_por: quien } : {}
  // La nota la escribe una persona en el teléfono y queda en `scripts/rrss/tandas/<slug>.json`,
  // que se commitea en un repo PÚBLICO: "cambia la lámina de C:\Users\<quien sea>\out\01.png"
  // entra tal cual por acá. Se sanea en este punto, y no en cada llamador, porque los dos
  // canales —el botón de Telegram y la línea de comandos— pasan por acá y el llamador que se
  // olvide es el que publica el nombre de usuario. El canario de las tandas lo cazaría, pero
  // recién en el push y ya commiteado, que es tarde para una salida limpia.
  const movida = transicionar(tanda, destino, {
    nota: sinRutasDeDisco(nota || `${veredicto} por ${quien}`),
    ...extra,
  })
  escribirTanda(movida)
  return movida
}

/**
 * Lee los toques y los mensajes nuevos de Telegram y los aplica.
 *
 * "Pedir cambios" no se aplica con el toque: el botón pide la nota y la tanda se
 * queda en `en_revision` hasta que el mensaje llega. Así `cambios_pedidos` nunca
 * existe sin decir qué cambiar, que es la única forma de que la nota sirva para
 * regenerar algo.
 */
export async function recogerVeredictos({ env = process.env, esperaSegundos = 0 } = {}) {
  const creds = credenciales(env)
  if (!creds) return { canal: 'chat', aplicados: [], avisos: [] }
  const estado = leerEstadoTelegram()
  const { decisiones, mensajes, siguienteOffset } = await leerDecisiones(estado.offset, creds, { esperaSegundos })
  const aplicados = []
  const avisos = []
  let esperandoNotaDe = estado.esperandoNotaDe

  for (const d of decisiones) {
    if (!esDelChatAprobador(d, creds)) {
      avisos.push(`toque ignorado: vino del chat ${d.deChat}, no del chat que aprueba`)
      continue
    }
    const [veredicto, slug] = String(d.dato).split(':')
    try {
      if (veredicto === 'cambios') {
        esperandoNotaDe = slug
        await confirmarToque(d.idCallback, creds, { aviso: 'Escríbeme qué cambiar' })
        await mandarTexto(`Dale. ¿Qué cambio de la tanda <b>${escaparHtml(slug)}</b>? Mándame una frase.`, creds)
        continue
      }
      // Quién apretó, no un nombre fijo: el chat puede ser un grupo y
      // `SUBIR.md` cita ese nombre como el visto bueno.
      const movida = registrarVeredicto(slug, veredicto, {
        nota: `botón "${veredicto}" en Telegram`,
        ...(d.deUsuario ? { quien: d.deUsuario } : {}),
      })
      aplicados.push({ slug, estado: movida.estado })
      await confirmarToque(d.idCallback, creds, { aviso: movida.estado })
      await mandarTexto(`Tanda <b>${escaparHtml(slug)}</b> → <b>${movida.estado}</b>.`, creds)
    } catch (e) {
      avisos.push(`${d.dato}: ${e.message}`)
      await confirmarToque(d.idCallback, creds, { aviso: 'No se pudo' })
      // El mensaje de la excepción se escapa igual que cualquier dato: si trae un `<` o un
      // `&`, el aviso de que algo falló fallaría también, y en silencio.
      await mandarTexto(
        `No pude aplicar eso en <b>${escaparHtml(slug)}</b>: ${escaparHtml(e.message)}`,
        creds,
      )
    }
  }

  // Limitación conocida y asumida: `esperandoNotaDe` es un solo slug sin fecha
  // de vencimiento. Si Juanjo toca "cambios" en una tanda y no contesta, el
  // próximo mensaje que le mande al bot —días después, de cualquier tema— se
  // anota como la nota de esa tanda; y si toca "cambios" en dos tandas
  // seguidas, la nota va a la segunda. No se arregla ahora porque el daño es
  // una nota equivocada en el historial (la tanda ya está en cambios_pedidos,
  // así que el estado no se mueve) y porque no toca el portón: nada se publica
  // sin un "aprobar" explícito. Cuando haya más de una tanda viva a la vez,
  // esto pasa a ser responder citando el mensaje.
  for (const m of mensajes) {
    if (!esDelChatAprobador(m, creds) || !esperandoNotaDe) continue
    const slug = esperandoNotaDe
    try {
      const movida = registrarVeredicto(slug, 'cambios', { nota: m.texto })
      aplicados.push({ slug, estado: movida.estado, nota: m.texto })
      esperandoNotaDe = null
      await mandarTexto(`Anotado para <b>${escaparHtml(slug)}</b>. Lo regenero y te lo vuelvo a mandar.`, creds)
    } catch (e) {
      avisos.push(`nota para ${slug}: ${e.message}`)
    }
  }

  escribirEstadoTelegram({ offset: siguienteOffset, esperandoNotaDe })
  return { canal: 'telegram', aplicados, avisos }
}

async function main() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--veredicto')
  if (i !== -1) {
    const [slug, veredicto, ...nota] = args.slice(i + 1)
    const movida = registrarVeredicto(slug, veredicto, { nota: nota.join(' ') })
    console.log(`✅ ${slug} → ${movida.estado}`)
    return
  }
  const { canal: c, aplicados, avisos } = await recogerVeredictos({ esperaSegundos: args.includes('--esperar') ? 50 : 0 })
  console.log(`canal: ${c}`)
  if (!aplicados.length && !avisos.length) {
    const pendientes = pendientesDeAprobacion()
    console.log(
      pendientes.length
        ? `sin novedades · esperando veredicto de: ${pendientes.map((t) => t.slug).join(', ')}`
        : 'sin novedades · no hay tandas esperando aprobación',
    )
  }
  aplicados.forEach((a) => console.log(`   ${a.slug} → ${a.estado}${a.nota ? ` · "${a.nota}"` : ''}`))
  avisos.forEach((a) => console.log(`   ⚠️  ${a}`))
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
