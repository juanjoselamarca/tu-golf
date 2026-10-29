// Arma el expediente que lee el revisor de una tanda, antes de que la vea Juanjo.
//
// El que produce una pieza lee lo que quiso escribir, no lo que escribió: por eso
// en el código del proyecto rige "el autor nunca se revisa a sí mismo". Acá valía
// lo contrario y era el hueco del flujo — el primer par de ojos frescos terminaba
// siendo Juanjo, que es justo lo que el sistema promete evitarle.
//
// Este script es la parte mecánica de esa revisión: junta TODO lo que se puede
// juzgar (el caption entero, cada lámina, los momentos del reel con su duración) y
// deja las rutas de las imágenes para que el revisor las abra. No opina: si opinara,
// estaría decidiendo dónde mirar, que es lo único que el revisor aporta.
//
// Se arma ANTES de que la tanda exista, con las piezas ya renderizadas, porque el
// revisor va antes del portón de Juanjo y no después:
//
//   node scripts/rrss/expediente-pieza.mjs --idea "<la idea>" --pieza <slug>:<rol> ...
//
// También acepta el slug de una tanda ya armada, para revisar una que volvió con
// cambios: `node scripts/rrss/expediente-pieza.mjs 2026-W44`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { leerTanda } from './cola.mjs'
import { ESCENAS } from './escenas.mjs'
import { destinoInstagram, huellaDeLoRevisado } from './marca.mjs'
import { duracionEsperada } from './montar.mjs'
import { parsearPieza, selloDeEntradas } from './tanda.mjs'
import {
  dirSalida,
  rutaLegible,
  rutaManifiestoFrames,
  rutaPiezaJson,
} from './publicar.mjs'
import { motivoNoPublicable, validarPieza } from './validar.mjs'

/** Un momento del reel: fotogramas seguidos que cuentan lo mismo, con lo que duran juntos. */
export function momentosDelReel(frames) {
  const momentos = []
  for (const f of frames) {
    const ultimo = momentos[momentos.length - 1]
    if (ultimo && ultimo.nota === f.nota) {
      ultimo.ms += f.ms
      ultimo.cuadros += 1
      ultimo.hasta = f.archivo
      ultimo.rutaHasta = f.ruta ?? null
      continue
    }
    momentos.push({
      nota: f.nota,
      ms: f.ms,
      // Cuántos archivos distintos son. Dos `frame(ms)` seguidos sin nota —el caso
      // por defecto de capturar.mjs— se funden en un momento de 4 s, y sin este
      // número la tabla decía "una pantalla quieta 4 s" mostrando uno de los dos
      // frames: dos pantallas distintas contadas como una que nunca existió.
      cuadros: 1,
      desde: f.archivo,
      hasta: f.archivo,
      ruta: f.ruta ?? null,
      rutaHasta: f.ruta ?? null,
    })
  }
  return momentos
}

function segundos(ms) {
  return `${(ms / 1000).toFixed(1)} s`
}

/**
 * El fotograma de cierre tal como `montar.mjs` lo pega al final del MP4.
 *
 * No está en `frames.json` —entra recién al montar—, así que el expediente declaraba
 * una duración 2,6 s menor que el video y el CTA final, que es la última cosa que ve
 * quien lo mira, no se revisaba. Los datos salen de `ESCENAS`, que es de donde los
 * saca el que monta; la ruta apunta a la lámina original, que se puede abrir.
 */
function framesDeCierre(escena) {
  if (!escena?.cierre) return []
  const { pieza, lamina, ms } = escena.cierre
  return [
    {
      archivo: lamina,
      ms,
      nota: `cierre (lámina de la pieza ${pieza})`,
      ruta: path.join(dirSalida(), pieza, lamina),
    },
  ]
}

/**
 * Los problemas que se pueden ver sin criterio, para que el revisor gaste su juicio
 * en lo que no se puede medir.
 *
 * Corre el validador canónico (`validarPieza`) y no una lista propia, porque el
 * revisor no tiene Bash y no puede correrlo él. Sin esto, una pieza que nunca pasó
 * por `validar.mjs` llegaba al expediente con voseo, con la palabra prohibida o con
 * un número sin fuente, y volvía con un PUBLICAR: lo único que el revisor mira es
 * lo que el expediente le muestra.
 *
 * Lo único propio es la existencia de los archivos, que no es un control de marca:
 * una pieza perfecta sin renderizar deja al revisor opinando del JSON.
 */
export function problemasMecanicos(pieza, rutas) {
  const malo = [...validarPieza(pieza)]
  const noPublicable = motivoNoPublicable(pieza)
  if (noPublicable) malo.push(`la pieza no está marcada como publicable: ${noPublicable}`)
  for (const [que, ruta] of Object.entries(rutas)) {
    if (!existsSync(ruta))
      malo.push(
        `falta ${que}: \`${rutaLegible(ruta)}\` — la pieza no está renderizada, o se renderizó con otro slug`,
      )
  }
  return malo
}

/**
 * La pieza leída del disco con lo que hace falta para sellarla: su rol y su toma.
 *
 * El sello lo arma `selloDeEntradas`, el mismo que usa el portón de la tanda. Si acá
 * hubiera una copia, la huella que el expediente imprime y la que el portón exige
 * serían dos cosas parecidas: cualquier campo que una sumara y la otra no deja el
 * flujo trabado pidiendo revisar lo que ya se revisó.
 */
export function leerEntrada(entrada) {
  const pieza = JSON.parse(readFileSync(rutaPiezaJson(entrada.pieza), 'utf8'))
  const [sello] = selloDeEntradas([entrada], { [entrada.pieza]: pieza })
  return { ...sello, hora_sugerida: entrada.hora_sugerida }
}

function seccionDePieza(sello, n) {
  const { pieza } = sello
  const dirPieza = path.join(dirSalida(), pieza.slug)
  const rutas = { 'la hoja de contactos': path.join(dirPieza, 'hoja-de-contactos.png') }
  ;(pieza.laminas ?? []).forEach((_, i) => {
    rutas[`la lámina ${i + 1}`] = path.join(dirPieza, `${String(i + 1).padStart(2, '0')}.png`)
  })

  const lineas = []
  lineas.push(`## Pieza ${n}: ${pieza.slug} (${sello.rol})`)
  lineas.push('')
  lineas.push(`- **Dónde se sube:** ${destinoInstagram(pieza)} · formato \`${pieza.formato}\` · dirección \`${pieza.direccion}\``)
  lineas.push(`- **Pilar:** ${pieza.pilar ?? '(no declara)'} · **público:** ${pieza.publico ?? '(no declara)'}`)
  if (sello.hora_sugerida) lineas.push(`- **Hora sugerida:** ${sello.hora_sugerida}`)
  if (pieza.proposito) lineas.push(`- **Para qué existe, según el autor:** ${pieza.proposito}`)
  lineas.push('')

  const malo = problemasMecanicos(pieza, rutas)
  if (malo.length) {
    lineas.push('**Problemas que ya se vieron sin criterio** (confírmalos, no los repitas):')
    malo.forEach((m) => lineas.push(`- ${m}`))
    lineas.push('')
  }

  lineas.push('### Mira estas imágenes antes de opinar')
  lineas.push('')
  for (const [que, ruta] of Object.entries(rutas)) {
    lineas.push(`- ${que}: \`${rutaLegible(ruta)}\`${existsSync(ruta) ? '' : ' — NO EXISTE'}`)
  }
  lineas.push('')

  // El reel: el revisor no puede ver un MP4, pero sí los momentos y lo que dura cada
  // uno. "Ninguna lámina quieta más de 6 s" solo se puede juzgar con esta tabla.
  if (pieza.escena != null) {
    const escena = ESCENAS[pieza.escena]
    const dirVideo = path.join(dirSalida(), pieza.escena)
    lineas.push(`### El reel, momento a momento (escena \`${pieza.escena}\`)`)
    lineas.push('')
    if (!sello.frames) {
      lineas.push(
        `No hay \`${rutaLegible(rutaManifiestoFrames(pieza.escena))}\`: la escena no está capturada, así que el video de esta tanda no se puede revisar.`,
      )
    } else {
      const frames = [
        ...sello.frames.map((f) => ({ ...f, ruta: path.join(dirVideo, 'frames', f.archivo) })),
        ...framesDeCierre(escena),
      ]
      const momentos = momentosDelReel(frames)
      // El total que va a durar el MP4 lo calcula montar.mjs: si acá se sumara otra
      // vez, el expediente podría declarar un largo que el video no tiene.
      const total = duracionEsperada(frames)
      lineas.push(`Duración total: **${total.toFixed(1)} s** en ${momentos.length} momentos. Abre el frame de cada uno:`)
      lineas.push('')
      lineas.push('| # | Qué pasa | Dura | Cuadros | Frame |')
      lineas.push('| --- | --- | --- | --- | --- |')
      momentos.forEach((m, i) => {
        const falta = m.ruta && !existsSync(m.ruta) ? ' — NO EXISTE' : ''
        const hasta = m.cuadros > 1 && m.hasta !== m.desde ? ` → \`${m.hasta}\`` : ''
        lineas.push(
          `| ${i + 1} | ${m.nota || '(sin nota)'} | ${segundos(m.ms)} | ${m.cuadros} | \`${rutaLegible(m.ruta)}\`${hasta}${falta} |`,
        )
      })
      lineas.push('')
      if (escena?.cierre)
        lineas.push(
          `El último momento es la lámina de cierre y sale de OTRA pieza (\`${escena.cierre.pieza}\`): su texto está en \`scripts/rrss/piezas/${escena.cierre.pieza}.json\`.`,
        )
      const mp4 = path.join(dirVideo, `${pieza.escena}.mp4`)
      lineas.push(`El MP4 montado: \`${rutaLegible(mp4)}\`${existsSync(mp4) ? '' : ' — NO EXISTE: la escena no está montada'}`)
    }
    lineas.push('')
  }

  lineas.push('### El caption, entero')
  lineas.push('')
  lineas.push('```')
  lineas.push(pieza.caption ?? '')
  lineas.push('```')
  lineas.push('')
  lineas.push(`${(pieza.caption ?? '').length} caracteres · hashtags: ${(pieza.hashtags ?? []).join(' ') || '(ninguno)'}`)
  lineas.push('')
  lineas.push('### Las láminas, como texto')
  lineas.push('')
  ;(pieza.laminas ?? []).forEach((lamina, i) => {
    lineas.push(`**${i + 1}. plantilla \`${lamina.plantilla}\`**`)
    for (const campo of ['titular', 'bajada', 'dato', 'cifra', 'pie', 'cta', 'fuente']) {
      if (lamina[campo]) lineas.push(`- ${campo}: ${lamina[campo]}`)
    }
    lineas.push('')
  })
  return lineas.join('\n')
}

/**
 * El expediente de una tanda, esté en disco o todavía no.
 *
 * Recibe `{ idea, piezas }` directamente, y no solo el slug de una tanda guardada,
 * porque si el expediente necesitara la tanda armada el revisor llegaría después de
 * que el mensaje ya salió al teléfono de Juanjo, que es exactamente al revés.
 */
export function expedienteDeTanda(tandaOSlug) {
  const tanda = typeof tandaOSlug === 'string' ? leerTanda(tandaOSlug) : tandaOSlug
  if (!tanda) throw new Error(`No existe la tanda "${tandaOSlug}".`)
  if (!tanda.idea || !tanda.piezas?.length)
    throw new Error('Un expediente sin idea o sin piezas no se puede revisar.')

  const sellos = tanda.piezas.map((entrada) => leerEntrada(entrada))
  const huella = huellaDeLoRevisado(sellos)

  const lineas = []
  lineas.push(`# Revisión de la tanda ${tanda.slug ?? '(sin armar todavía)'}`)
  lineas.push('')
  lineas.push(`**La idea de la semana, según quien la produjo:** ${tanda.idea}`)
  lineas.push('')
  lineas.push(`Estado: \`${tanda.estado ?? 'sin armar'}\` · ${tanda.piezas.length} pieza(s).`)
  if (tanda.estado === 'aprobada' || tanda.estado === 'publicada') {
    lineas.push('')
    lineas.push(`> Ojo: esta tanda ya está en \`${tanda.estado}\`. Revisarla ahora no evita nada; el momento de la revisión es antes de que la vea Juanjo.`)
  }
  lineas.push('')
  lineas.push('## Lo que tienes que responder')
  lineas.push('')
  lineas.push('Una sola cosa: **¿esto se publica o se corrige?** Y si es `CORREGIR`, qué exactamente')
  lineas.push('y por qué. No reescribas la pieza: di qué está mal.')
  lineas.push('')
  lineas.push('Tu respuesta tiene que traer estas dos líneas, cada una en una línea propia:')
  lineas.push('')
  lineas.push('```')
  lineas.push('Veredicto: PUBLICAR')
  lineas.push(`Huella: ${huella}`)
  lineas.push('```')
  lineas.push('')
  lineas.push('(`CORREGIR` en vez de `PUBLICAR` si hay algo que arreglar.) El portón que manda la')
  lineas.push('tanda a aprobar lee esas dos líneas literalmente: sin ellas no pasa nada, y la huella')
  lineas.push('es lo que dice QUÉ versión revisaste. Si después cambia el caption, una lámina o la')
  lineas.push('toma del reel, la huella se mueve y hay que revisar de nuevo.')
  lineas.push('')
  lineas.push('No sabes qué quiso decir el autor y no hace falta: juzga lo que se ve. Si algo solo se')
  lineas.push('entiende sabiendo lo que el autor tenía en la cabeza, eso **es** el hallazgo.')
  lineas.push('')
  lineas.push('## Contra qué se juzga')
  lineas.push('')
  lineas.push('Lee estos dos, completos, antes de las piezas:')
  lineas.push('')
  lineas.push('- `docs/rrss/guia-de-marca.md` — cómo se ve y cómo se escribe.')
  lineas.push('- `docs/rrss/plan-lanzamiento.md` — qué se está tratando de lograr.')
  lineas.push('')
  lineas.push('Las ocho reglas duras (se rompe una, la pieza no sale):')
  lineas.push('')
  lineas.push('1. Nada se publica sin que Juanjo lo apruebe.')
  lineas.push('2. Nunca se escribe la palabra "premium" en el copy.')
  lineas.push('3. Hay un objeto real en cuadro (la app, la tarjeta, la cancha, un jugador). Nunca texto flotando.')
  lineas.push('4. Una pieza, un trabajo, de un solo pilar.')
  lineas.push('5. Todo número tiene fuente y fecha. Cero redondeos para que suene mejor.')
  lineas.push('6. Español de Chile, sin voseo.')
  lineas.push('7. Cero datos de usuarios reales sin autorización escrita.')
  lineas.push('8. Las referencias se replican como idea, nunca como copia.')
  lineas.push('')
  lineas.push('Y además, mirando las imágenes: el gancho en el segundo 0, ninguna lámina quieta más de')
  lineas.push('6 s, la zona segura del story respetada, el contraste legible con sol, y el golf correcto')
  lineas.push('contra las reglas reales (un hándicap, un neto o un desempate mal calculado en una pieza')
  lineas.push('pública lo ve el primer socio exigente que pase).')
  lineas.push('')
  sellos.forEach((sello, i) => {
    lineas.push(seccionDePieza(sello, i + 1))
  })
  return lineas.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  const piezas = []
  const idea = []
  let suelto
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--pieza') piezas.push(parsearPieza(args[++i]))
    else if (args[i] === '--idea') idea.push(args[++i])
    else suelto = args[i]
  }
  if (!piezas.length && !suelto) {
    console.error('Uso: node scripts/rrss/expediente-pieza.mjs --idea "<idea>" --pieza <slug>:<rol> ...')
    console.error('     o, para una tanda ya armada: node scripts/rrss/expediente-pieza.mjs <tanda>')
    process.exitCode = 2
    return
  }
  const nombre = piezas.length ? `piezas-${piezas[0].pieza}` : suelto
  const texto = expedienteDeTanda(
    piezas.length ? { idea: idea.join(' '), piezas, slug: suelto } : suelto,
  )
  const destino = path.join(dirSalida(), 'expedientes', `${nombre}.md`)
  mkdirSync(path.dirname(destino), { recursive: true })
  writeFileSync(destino, `${texto}\n`)
  console.log(`expediente: ${rutaLegible(destino)} (${texto.length} caracteres)`)
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
