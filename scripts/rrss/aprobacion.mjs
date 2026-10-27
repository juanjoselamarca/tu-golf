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
import { fileURLToPath } from 'node:url'
import { escribirTanda, leerTanda, pendientesDeAprobacion, transicionar } from './cola.mjs'
import { huellaTexto, huellaVisual } from './marca.mjs'
import { huellaEscena } from './escenas.mjs'
import { confirmarToque, credenciales, esDeJuanjo, leerDecisiones, mandarArchivo, mandarTexto } from './telegram.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
/**
 * Dónde se recuerda hasta qué actualización de Telegram ya se leyó. Vive en
 * `out/` (fuera del repo) porque es ruido de operación, no una decisión.
 *
 * Si el archivo se pierde, la próxima corrida vuelve a leer toques viejos. No es
 * grave y no se arregla con un archivo más seguro: lo que impide que una tanda se
 * apruebe dos veces es la máquina de estados de cola.mjs, que rechaza
 * `aprobada → aprobada`. Un marcador perdido produce un aviso, no una
 * publicación duplicada.
 */
const ESTADO_TELEGRAM = path.join(RAIZ, 'out', 'rrss', 'telegram-estado.json')

export const VEREDICTOS = {
  aprobar: 'aprobada',
  rechazar: 'rechazada',
  cambios: 'cambios_pedidos',
}

export function canal(env = process.env) {
  return credenciales(env) ? 'telegram' : 'chat'
}

function leerEstadoTelegram() {
  if (!existsSync(ESTADO_TELEGRAM)) return { offset: 0, esperandoNotaDe: null }
  try {
    return { offset: 0, esperandoNotaDe: null, ...JSON.parse(readFileSync(ESTADO_TELEGRAM, 'utf8')) }
  } catch {
    return { offset: 0, esperandoNotaDe: null }
  }
}

function escribirEstadoTelegram(estado) {
  mkdirSync(path.dirname(ESTADO_TELEGRAM), { recursive: true })
  writeFileSync(ESTADO_TELEGRAM, `${JSON.stringify(estado, null, 2)}\n`)
}

/**
 * El texto de la vista previa. Separado del envío para poder leerlo en el canal
 * `chat` y para que un test pueda afirmar que la tanda llega con lo que hace
 * falta para decidir: la idea, cada pieza con su rol y su hora, y el caption
 * completo. Una vista previa sin el caption obliga a abrir archivos para aprobar,
 * y una aprobación que cuesta trabajo no se da.
 */
export function resumenDeTanda(tanda, piezas) {
  const lineas = [
    `<b>Tanda ${tanda.slug}</b>`,
    '',
    tanda.idea,
    '',
  ]
  for (const p of tanda.piezas) {
    const pieza = piezas[p.pieza]
    lineas.push(`<b>${p.rol.toUpperCase()}</b> · ${pieza?.formato ?? '?'} · ${p.pieza}`)
    if (p.hora_sugerida) lineas.push(`Hora sugerida: ${p.hora_sugerida}`)
    if (pieza?.caption) lineas.push('', pieza.caption)
    if (pieza?.hashtags?.length) lineas.push(pieza.hashtags.join(' '))
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
  const texto = resumenDeTanda(enRevision, piezas)
  if (creds) {
    for (const a of adjuntos) {
      if (!existsSync(a.ruta)) throw new Error(`La tanda ${tanda.slug} declara un adjunto que no existe: ${a.ruta}`)
      await mandarArchivo(a.tipo, a.ruta, creds, { pie: a.pie ?? '' })
    }
    await mandarTexto(texto, creds, { botones: BOTONES(enRevision.slug) })
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
  const movida = transicionar(tanda, destino, { nota: nota || `${veredicto} por ${quien}`, ...extra })
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
    if (!esDeJuanjo(d, creds)) {
      avisos.push(`toque ignorado: vino del chat ${d.deChat}, no del de Juanjo`)
      continue
    }
    const [veredicto, slug] = String(d.dato).split(':')
    try {
      if (veredicto === 'cambios') {
        esperandoNotaDe = slug
        await confirmarToque(d.idCallback, creds, { aviso: 'Escríbeme qué cambiar' })
        await mandarTexto(`Dale. ¿Qué cambio de la tanda <b>${slug}</b>? Mándame una frase.`, creds)
        continue
      }
      const movida = registrarVeredicto(slug, veredicto, { nota: `botón "${veredicto}" en Telegram` })
      aplicados.push({ slug, estado: movida.estado })
      await confirmarToque(d.idCallback, creds, { aviso: movida.estado })
      await mandarTexto(`Tanda <b>${slug}</b> → <b>${movida.estado}</b>.`, creds)
    } catch (e) {
      avisos.push(`${d.dato}: ${e.message}`)
      await confirmarToque(d.idCallback, creds, { aviso: 'No se pudo' })
      await mandarTexto(`No pude aplicar eso en <b>${slug}</b>: ${e.message}`, creds)
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
    if (!esDeJuanjo(m, creds) || !esperandoNotaDe) continue
    const slug = esperandoNotaDe
    try {
      const movida = registrarVeredicto(slug, 'cambios', { nota: m.texto })
      aplicados.push({ slug, estado: movida.estado, nota: m.texto })
      esperandoNotaDe = null
      await mandarTexto(`Anotado para <b>${slug}</b>. Lo regenero y te lo vuelvo a mandar.`, creds)
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
