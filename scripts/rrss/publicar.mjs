// Empaqueta una tanda APROBADA para subirla a Instagram.
//
// No publica por API. El plan v2 decidió subir por navegador con la extensión de
// Chrome, pieza a pieza, porque la app de Meta exige un perfil de Facebook que la
// cuenta no tiene (docs/rrss/setup-meta-y-bot.md). Lo que hace este script es
// dejar todo en una carpeta en el orden exacto de subida: los archivos numerados,
// el caption listo para pegar y la hora sugerida. Cuando exista la app de Meta,
// el publicador por API reemplaza el último paso y todo lo anterior sigue igual.
//
// El portón: si la tanda no está en `aprobada`, acá no pasa nada. Es el mismo
// control que en aprobacion.mjs pero del otro lado, porque este script se puede
// correr solo y "alguien validó antes" no es una garantía.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SLUG_PIEZA, huellaTexto, huellaVisual } from './marca.mjs'
import { huellaEscena } from './escenas.mjs'
import { motivoNoPublicable, validarPieza } from './validar.mjs'
import { escribirTanda, leerTanda, transicionar } from './cola.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
/**
 * Dónde dejó el render sus archivos y dónde se arma el paquete de la tanda.
 *
 * `RRSS_DIR_SALIDA` existe para los tests, por la misma razón que
 * `RRSS_DIR_TANDAS` en cola.mjs: el empaquetador se prueba de verdad escribiendo
 * y borrando en disco, y sin el override un test tendría que operar sobre
 * `out/rrss/<pieza real>/` y borrar al salir el reel que estaba montado.
 */
function dirSalida(env = process.env) {
  return env.RRSS_DIR_SALIDA?.trim() || path.join(RAIZ, 'out', 'rrss')
}

/**
 * Una ruta del proyecto como la escribe un humano: relativa a la raíz y con
 * barras normales.
 *
 * `path.relative` devuelve `out\rrss\tandas\...` en Windows, y esa ruta termina
 * impresa dentro de `SUBIR.md`, que es un markdown que Juanjo lee en el teléfono:
 * los backslashes son el carácter de escape de Markdown y el renderizador se come
 * algunos. Lo que se muestra tiene que ser pegable en una terminal.
 */
function rutaLegible(abs) {
  return path.relative(RAIZ, abs).split(path.sep).join('/')
}

/**
 * Dónde viven los JSON de las piezas.
 *
 * `RRSS_DIR_PIEZAS` existe por lo mismo que `RRSS_DIR_TANDAS` y
 * `RRSS_DIR_SALIDA`: sin él, los tests del empaquetador se arman sobre las
 * piezas reales del repo y quedan atados a su contenido. Una pieza que cambia
 * de caption —o que se marca como fixture— rompe un test que no habla de eso,
 * y la tentación entonces es relajar el test en vez de mirar la pieza.
 */
function dirPiezas(env = process.env) {
  return env.RRSS_DIR_PIEZAS?.trim() || path.join(RAIZ, 'scripts', 'rrss', 'piezas')
}

export function rutaPiezaJson(slug) {
  if (!SLUG_PIEZA.test(slug ?? '')) throw new Error(`Slug de pieza inválido: "${slug}".`)
  return path.join(dirPiezas(), `${slug}.json`)
}

/**
 * El MP4 de una pieza que es el reel de una escena, o null si la pieza no declara
 * escena.
 *
 * El video NO vive en la carpeta de la pieza, y no puede vivir ahí: `render.mjs`
 * borra `out/rrss/<pieza>/` entera antes de escribir las láminas, así que un MP4
 * guardado ahí lo borraría el siguiente render de la lámina de cierre. Vive en
 * `out/rrss/<escena>/<escena>.mp4`, que es donde lo deja `montar.mjs`, y la pieza
 * dice de qué escena es con el campo `escena`.
 *
 * Sin ese campo el empaquetador buscaba el MP4 en la carpeta de la pieza, no lo
 * encontraba NUNCA —son dos slugs distintos: la escena es `anota-todos-ven` y la
 * pieza `2026-10-27-anota-todos-ven`— y caía al camino de las láminas: a
 * Instagram subía la lámina de cierre sola, una imagen fija donde iba el reel,
 * sin un solo error.
 *
 * `video.json` se exige además del MP4 por lo mismo que la huella visual de las
 * láminas: si la escena se corrigió después de montar, lo que hay en disco es el
 * reel anterior.
 */
export function videoDePieza(pieza) {
  if (pieza.escena == null) return null
  if (!/^[a-z0-9][a-z0-9-]*$/.test(pieza.escena))
    throw new Error(`La pieza ${pieza.slug} declara una escena con nombre inseguro: "${pieza.escena}".`)
  const dir = path.join(dirSalida(), pieza.escena)
  const archivo = path.join(dir, `${pieza.escena}.mp4`)
  const manifiesto = path.join(dir, 'video.json')
  if (!existsSync(archivo) || !existsSync(manifiesto))
    throw new Error(
      `La pieza ${pieza.slug} es el reel de la escena "${pieza.escena}" y el video no está montado ` +
        `(falta ${rutaLegible(existsSync(archivo) ? manifiesto : archivo)}). Corre la toma completa:\n` +
        `   node scripts/test-db/con-base-de-pruebas.mjs -- node scripts/rrss/escena.mjs ${pieza.escena}\n` +
        `   node scripts/test-db/con-base-de-pruebas.mjs -- node scripts/rrss/capturar.mjs ${pieza.escena}\n` +
        `   node scripts/rrss/montar.mjs ${pieza.escena}`,
    )
  const vid = JSON.parse(readFileSync(manifiesto, 'utf8'))
  const esperada = huellaEscena(pieza.escena)
  if (vid.huella_escena !== esperada)
    throw new Error(
      `La escena "${pieza.escena}" cambió después de montarse ` +
        `(huella ${vid.huella_escena ?? 'ausente'} ≠ ${esperada}): el MP4 en disco es de la versión anterior. ` +
        `Vuelve a capturar y a montar la toma.`,
    )
  // La lámina de cierre va montada DENTRO del MP4, así que acá abajo nadie mira
  // `publicacion.json`: la huella visual de la pieza tiene que compararse contra
  // la que `montar.mjs` selló. Sin esto se corrige el titular del cierre, se
  // vuelve a renderizar, las dos huellas de siempre calzan y el reel sube con el
  // titular viejo pegado en los últimos segundos.
  const visualEsperada = huellaVisual(pieza)
  if (vid.cierre?.huella_visual !== visualEsperada)
    throw new Error(
      `La lámina de cierre de ${pieza.slug} cambió después de montarse ` +
        `(huella ${vid.cierre?.huella_visual ?? 'ausente'} ≠ ${visualEsperada}): ` +
        'el MP4 lleva pegada la versión anterior. Vuelve a renderizar la lámina y a montar:\n' +
        `   node scripts/rrss/render.mjs scripts/rrss/piezas/${pieza.slug}.json\n` +
        `   node scripts/rrss/montar.mjs ${pieza.escena}`,
    )
  return archivo
}

/**
 * Los archivos que el render dejó para una pieza, verificando que correspondan a
 * la pieza COMO ESTÁ AHORA.
 *
 * El control que importa es la huella visual: `render.mjs` la escribe en
 * `publicacion.json` con los campos que deciden los píxeles, y acá se recalcula.
 * Si alguien corrigió un titular o cambió una cifra de una tabla después de
 * renderizar —y pasa, es el ciclo normal de una revisión— los PNG en disco son de
 * la versión anterior y se publicaría la vieja sin que nada avise. La huella hace
 * que eso sea un error y no una sorpresa en el feed.
 */
export function mediosDePieza(pieza) {
  const dir = path.join(dirSalida(), pieza.slug)
  const manifiesto = path.join(dir, 'publicacion.json')
  if (!existsSync(manifiesto))
    throw new Error(`La pieza ${pieza.slug} no está renderizada: falta ${rutaLegible(manifiesto)}.`)
  const pub = JSON.parse(readFileSync(manifiesto, 'utf8'))
  const esperada = huellaVisual(pieza)
  if (pub.huella_visual !== esperada)
    throw new Error(
      `La pieza ${pieza.slug} cambió después de renderizarse (huella ${pub.huella_visual ?? 'ausente'} ≠ ${esperada}). ` +
        `Vuelve a correr: node scripts/rrss/render.mjs scripts/rrss/piezas/${pieza.slug}.json`,
    )
  const archivos = []
  // El video manda cuando la pieza es el reel de una escena: las láminas son su
  // fotograma de cierre, que ya va montado DENTRO del MP4, no una pieza aparte.
  const video = videoDePieza(pieza)
  if (video) archivos.push(video)
  else
    for (const rel of pub.laminas ?? []) {
      const abs = path.join(RAIZ, rel)
      if (!existsSync(abs)) throw new Error(`La pieza ${pieza.slug} declara una lámina que no está en disco: ${rel}`)
      archivos.push(abs)
    }
  if (!archivos.length) throw new Error(`La pieza ${pieza.slug} no tiene nada que subir.`)
  return { archivos, dir }
}

/**
 * Arma la carpeta de subida de una tanda aprobada. Devuelve qué quedó dónde para
 * que quien suba (la extensión de Chrome o Juanjo desde el teléfono) no tenga que
 * adivinar el orden.
 */
export function empaquetar(slug) {
  const tanda = leerTanda(slug)
  if (!tanda) throw new Error(`No existe la tanda ${slug}.`)
  if (tanda.estado !== 'aprobada')
    throw new Error(
      `La tanda ${slug} está en "${tanda.estado}". Solo se empaqueta una tanda aprobada: ` +
        'nada se sube sin que Juanjo la haya aprobado.',
    )
  // `SUBIR.md` encabeza con "Aprobada por <nombre>". Una tanda en "aprobada"
  // sin ese registro no debería existir —`registrarVeredicto` lo escribe
  // siempre—, y si existe es porque alguien editó el JSON a mano: entonces el
  // paquete sale firmando una aprobación que nadie dio.
  if (!tanda.aprobada_por)
    throw new Error(
      `La tanda ${slug} dice "aprobada" pero no registra quién la aprobó. ` +
        'SUBIR.md cita ese nombre como visto bueno; sin él el paquete firmaría una aprobación inexistente.',
    )

  // Todo se revisa ANTES de tocar el disco. Antes, el `rmSync` iba primero y
  // los controles después: una tanda que se quejaba de una huella dejaba al
  // operador sin el paquete bueno que ya tenía, y con una corrida a medias en
  // su lugar. Lo que falla no destruye lo que estaba bien.
  const revisadas = tanda.piezas.map((entrada) => {
    const pieza = JSON.parse(readFileSync(rutaPiezaJson(entrada.pieza), 'utf8'))
    const problemas = validarPieza(pieza)
    if (problemas.length)
      throw new Error(`La pieza ${pieza.slug} ya no pasa los controles de marca:\n   · ${problemas.join('\n   · ')}`)
    // Una tanda guardada antes de que existiera este control sigue en disco con
    // la pieza adentro: el portal de la tanda no la vuelve a ver.
    const noPublicable = motivoNoPublicable(pieza)
    if (noPublicable)
      throw new Error(`La pieza ${pieza.slug} no es publicable: ${noPublicable}`)
    // El caption que se pega en Instagram tiene que ser EL que se aprobó. La
    // vista previa lo mostró entero y la tanda selló su huella; acá se vuelve a
    // leer el JSON de la pieza, que entremedio alguien pudo corregir.
    const textoEsperado = entrada.huella_texto
    if (textoEsperado !== undefined && textoEsperado !== huellaTexto(pieza))
      throw new Error(
        `El caption de ${pieza.slug} cambió después de aprobarse ` +
          `(huella ${huellaTexto(pieza)} ≠ ${textoEsperado}): se subiría un texto que nadie aprobó. ` +
          'Vuelve a mandar la tanda a aprobación con el texto de ahora.',
      )
    return { entrada, pieza, archivos: mediosDePieza(pieza).archivos }
  })

  const destino = path.join(dirSalida(), 'tandas', slug)
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })

  const subidas = []
  revisadas.forEach(({ entrada, pieza, archivos }, i) => {
    const carpeta = path.join(destino, `${String(i + 1).padStart(2, '0')}-${entrada.rol}`)
    mkdirSync(carpeta, { recursive: true })
    const copiados = archivos.map((a, j) => {
      const nombre = `${String(j + 1).padStart(2, '0')}${path.extname(a)}`
      copyFileSync(a, path.join(carpeta, nombre))
      return nombre
    })
    const textoCaption = [pieza.caption, '', (pieza.hashtags ?? []).join(' ')].join('\n').trim()
    writeFileSync(path.join(carpeta, 'caption.txt'), `${textoCaption}\n`)
    subidas.push({
      orden: i + 1,
      rol: entrada.rol,
      pieza: pieza.slug,
      formato: pieza.formato,
      hora_sugerida: entrada.hora_sugerida ?? null,
      carpeta: rutaLegible(carpeta),
      archivos: copiados,
    })
  })

  writeFileSync(path.join(destino, 'SUBIR.md'), instruccionesDeSubida(tanda, subidas))
  writeFileSync(
    path.join(destino, 'tanda.json'),
    `${JSON.stringify({ slug: tanda.slug, idea: tanda.idea, estado: tanda.estado, subidas }, null, 2)}\n`,
  )
  return { destino: rutaLegible(destino), subidas }
}

function instruccionesDeSubida(tanda, subidas) {
  const lineas = [
    `# Subir la tanda ${tanda.slug}`,
    '',
    tanda.idea,
    '',
    `> Aprobada por ${tanda.aprobada_por}. Se sube por navegador con la extensión de Chrome, pieza a pieza,`,
    '> en este orden. El caption de cada una está en su carpeta, listo para pegar entero',
    '> (los hashtags van al final del mismo caption, no en un comentario aparte).',
    '',
  ]
  for (const s of subidas) {
    lineas.push(`## ${s.orden}. ${s.rol} — ${s.formato}`)
    lineas.push('')
    lineas.push(`- Pieza: \`${s.pieza}\``)
    lineas.push(`- Archivos, en orden: ${s.archivos.join(', ')}`)
    if (s.hora_sugerida) lineas.push(`- Hora sugerida: ${s.hora_sugerida}`)
    lineas.push(`- Carpeta: \`${s.carpeta}\``)
    lineas.push('')
  }
  lineas.push('## Cuando esté publicado')
  lineas.push('')
  lineas.push('Para poder medir la tanda después hace falta el link de cada publicación:')
  lineas.push('')
  lineas.push('```')
  lineas.push(`node scripts/rrss/publicar.mjs --publicada ${tanda.slug} <link-1> <link-2> ...`)
  lineas.push('```')
  lineas.push('')
  return `${lineas.join('\n')}\n`
}

/**
 * Cierra la tanda con el link de cada publicación. Los links son lo que después
 * permite pedirle las métricas a Instagram; sin ellos la tanda queda publicada y
 * ciega, que es como no haber publicado para efectos de aprender algo.
 */
export const LINK_INSTAGRAM = /^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?(?:\?.*)?$/

export function marcarPublicada(slug, links) {
  const tanda = leerTanda(slug)
  if (!tanda) throw new Error(`No existe la tanda ${slug}.`)
  if (links.length !== tanda.piezas.length)
    throw new Error(`La tanda ${slug} tiene ${tanda.piezas.length} piezas y llegaron ${links.length} links.`)
  // `publicada` es terminal: una tanda que entra ahí con un link vacío queda
  // ciega para siempre, y medirla era el único motivo de pedir los links.
  const malos = links.filter((l) => !LINK_INSTAGRAM.test(String(l ?? '').trim()))
  if (malos.length)
    throw new Error(
      `Links que no son de una publicación de Instagram: ${malos.map((l) => JSON.stringify(l)).join(', ')}. ` +
        'Forma esperada: https://www.instagram.com/p/<id>/ o /reel/<id>/.',
    )
  const piezas = tanda.piezas.map((p, i) => ({ ...p, publicada_en: String(links[i]).trim() }))
  const movida = transicionar({ ...tanda, piezas }, 'publicada', { nota: `${links.length} publicaciones` })
  escribirTanda(movida)
  return movida
}

function main() {
  const args = process.argv.slice(2)
  const iPub = args.indexOf('--publicada')
  if (iPub !== -1) {
    const [slug, ...links] = args.slice(iPub + 1)
    const movida = marcarPublicada(slug, links)
    console.log(`✅ ${slug} → ${movida.estado}`)
    return
  }
  const slug = args[0]
  if (!slug) {
    console.error('Uso: node scripts/rrss/publicar.mjs <tanda>            # empaqueta una tanda aprobada')
    console.error('     node scripts/rrss/publicar.mjs --publicada <tanda> <link>...')
    process.exit(1)
  }
  const { destino, subidas } = empaquetar(slug)
  console.log(`✅ tanda ${slug} empaquetada en ${destino}`)
  subidas.forEach((s) => console.log(`   ${s.orden}. ${s.rol} · ${s.formato} · ${s.archivos.length} archivo(s)`))
  console.log(`   instrucciones: ${destino}/SUBIR.md`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (e) {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  }
}
