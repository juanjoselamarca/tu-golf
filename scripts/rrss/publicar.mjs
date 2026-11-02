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
import { SLUG_PIEZA, destinoInstagram, huellaDeCaptura, huellaTexto, huellaVisual } from './marca.mjs'
import { ESCENAS, huellaEscena } from './escenas.mjs'
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
export function dirSalida(env = process.env) {
  return env.RRSS_DIR_SALIDA?.trim() || path.join(RAIZ, 'out', 'rrss')
}

/**
 * El manifiesto de fotogramas de una toma: qué se capturó, cuánto dura cada
 * cuadro y con qué nota.
 *
 * La ruta estaba escrita a mano en cada lugar que la toca —capturar, montar, el
 * expediente del revisor y el sello de lo revisado—. Cuatro copias de un nombre de
 * archivo es cómo se mueve una y las otras tres leen un manifiesto que ya no está:
 * el reel se monta igual, con los fotogramas viejos, y nadie ve un error.
 */
export function rutaManifiestoFrames(escena, env = process.env) {
  return path.join(dirSalida(env), escena, 'frames.json')
}

/** Los fotogramas de una toma, o `null` si la escena no está capturada. */
export function framesDeEscena(escena, env = process.env) {
  const ruta = rutaManifiestoFrames(escena, env)
  if (!existsSync(ruta)) return null
  return JSON.parse(readFileSync(ruta, 'utf8')).frames ?? []
}

/**
 * Deja la carpeta de una escena lista para una toma nueva, y devuelve dónde van los
 * cuadros: el manifiesto se borra PRIMERO y los jpg después.
 *
 * El orden es el control. `frames.json` vive fuera de `frames/`, así que borrar solo la
 * carpeta lo dejaba intacto, y `capturar.mjs` lo reescribe recién al final: una toma que
 * muere a mitad —la app aborta, el guion revienta, Ctrl-C— dejaba el manifiesto VIEJO
 * apuntando a los jpg NUEVOS, porque los nombres son secuenciales y se sobrescriben. La
 * huella de la captura quedaba idéntica y el PUBLICAR de ayer seguía valiendo para un MP4
 * montado con otra toma. Sin manifiesto, el expediente y el empaquetado fallan cerrado:
 * "la escena no está capturada".
 *
 * Vive acá, con `rutaManifiestoFrames` y `framesDeEscena`, porque es parte del contrato
 * del manifiesto y no un detalle del navegador. Y acá se puede probar: `capturar.mjs`
 * tiene shebang y un `import()` dinámico, y eso no se puede importar desde un test.
 */
export function limpiarTomaAnterior(escena, env = process.env) {
  rmSync(rutaManifiestoFrames(escena, env), { force: true })
  const dir = path.join(dirSalida(env), escena, 'frames')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
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
export function rutaLegible(abs) {
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
 * La lámina de cierre que una escena declara, con su huella visual COMO ESTÁ AHORA.
 *
 * La pieza del cierre NO es necesariamente la del reel: `escenas.mjs` la nombra aparte y
 * el expediente lo dice ("sale de OTRA pieza"). Hoy coinciden por casualidad —la escena
 * `anota-todos-ven` cierra con la lámina de su propia pieza— y mientras coincidan,
 * comparar contra la huella del reel parece funcionar. La primera escena que cierre con
 * la lámina de otra pieza rompe las dos direcciones: bloquea un reel legítimo con un
 * error sobre una lámina que nadie tocó, y deja de cazar el caso que el control existe
 * para cazar. Por eso se resuelve en un solo lugar y por el nombre que declara la escena.
 */
export function huellaDelCierre(escena) {
  const cierre = ESCENAS[escena]?.cierre
  if (!cierre) return null
  const ruta = rutaPiezaJson(cierre.pieza)
  // Sin el JSON no se devuelve `null`: `null` significa "esta escena no cierra con nada", y
  // confundir las dos cosas hace pasar un MP4 con una lámina pegada que ya no existe.
  if (!existsSync(ruta)) return { pieza: cierre.pieza, visual: 'ausente' }
  return { pieza: cierre.pieza, visual: huellaVisual(JSON.parse(readFileSync(ruta, 'utf8'))) }
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
  // El MP4 tiene que ser de la toma que hay en disco, no solo de esta versión de la
  // escena: recapturar sin volver a montar deja `huella_escena` igual —el código no
  // cambió— y el paquete salía con el reel de la toma anterior.
  const capturaEnDisco = framesDeEscena(pieza.escena)
  // Sin `frames.json` no hay contra qué comparar, y eso no es "está bien": es que la
  // toma de la que salió este MP4 no está en disco. Antes se dejaba pasar —la huella
  // quedaba `null` y el control de abajo se salteaba solo—, y el camino no es raro:
  // `capturar.mjs` borra el manifiesto al empezar, así que una recaptura cortada a
  // mitad deja el MP4 de ayer con la escena sin capturar. `desajusteDelReel` ya falla
  // cerrado en ese caso: el expediente avisaba y el empaquetado publicaba igual.
  if (capturaEnDisco == null)
    throw new Error(
      `La escena "${pieza.escena}" no está capturada ` +
        `(falta ${rutaLegible(rutaManifiestoFrames(pieza.escena))}): el MP4 que hay en disco ` +
        'no se puede verificar contra ninguna toma. Vuelve a capturar y a montar:\n' +
        `   node scripts/test-db/con-base-de-pruebas.mjs -- node scripts/rrss/capturar.mjs ${pieza.escena}\n` +
        `   node scripts/rrss/montar.mjs ${pieza.escena}`,
    )
  const huellaCaptura = huellaDeCaptura(capturaEnDisco)
  // Sin sello no se deja pasar: un `video.json` sin `huella_captura` se montó antes de
  // que este control existiera, y de ese MP4 no se sabe de qué toma salió. Volver a
  // montar cuesta segundos; publicar la toma anterior se ve en Instagram.
  if (vid.huella_captura == null)
    throw new Error(
      `El MP4 de "${pieza.escena}" no tiene sellada la toma de la que salió ` +
        '(falta `huella_captura` en video.json): se montó antes de que el sello existiera. ' +
        'Vuelve a montar la toma:\n' +
        `   node scripts/rrss/montar.mjs ${pieza.escena}`,
    )
  if (vid.huella_captura !== huellaCaptura)
    throw new Error(
      `El MP4 de "${pieza.escena}" no es de la toma que hay en disco ` +
        `(captura ${vid.huella_captura} ≠ ${huellaCaptura}): se recapturó ` +
        'después de montar. Vuelve a montar la toma:\n' +
        `   node scripts/rrss/montar.mjs ${pieza.escena}`,
    )
  // La lámina de cierre va montada DENTRO del MP4, así que acá abajo nadie mira
  // `publicacion.json`: la huella visual de la pieza tiene que compararse contra
  // la que `montar.mjs` selló. Sin esto se corrige el titular del cierre, se
  // vuelve a renderizar, las dos huellas de siempre calzan y el reel sube con el
  // titular viejo pegado en los últimos segundos.
  //
  // Quién manda es la ESCENA, no el manifiesto: `montar.mjs` escribe
  // `cierre: null` cuando la escena no declara ninguna lámina de cierre, y
  // exigir la huella igual dejaba a ese reel sin forma de empaquetarse nunca,
  // con un error que habla de algo que no existe. Y al revés: un MP4 con
  // cierre pegado cuando la escena ya no lo declara es un video de la versión
  // anterior, que es justo lo que este control existe para cazar.
  const cierreDeclarado = ESCENAS[pieza.escena]?.cierre
  const delCierre = huellaDelCierre(pieza.escena)
  if (!cierreDeclarado && vid.cierre != null)
    throw new Error(
      `El MP4 de "${pieza.escena}" lleva pegada una lámina de cierre y la escena ya no declara ninguna: ` +
        `el video en disco es de la versión anterior. Vuelve a montar la toma:\n` +
        `   node scripts/rrss/montar.mjs ${pieza.escena}`,
    )
  if (cierreDeclarado && vid.cierre?.huella_visual !== delCierre.visual)
    throw new Error(
      `La lámina de cierre de "${pieza.escena}" (pieza ${delCierre.pieza}) cambió después ` +
        `de montarse (huella ${vid.cierre?.huella_visual ?? 'ausente'} ≠ ${delCierre.visual}): ` +
        'el MP4 lleva pegada la versión anterior. Vuelve a renderizar la lámina y a montar:\n' +
        `   node scripts/rrss/render.mjs scripts/rrss/piezas/${delCierre.pieza}.json\n` +
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
      const abs = path.resolve(RAIZ, rel)
      if (!existsSync(abs)) throw new Error(`La pieza ${pieza.slug} declara una lámina que no está en disco: ${rel}`)
      archivos.push(abs)
    }
  if (!archivos.length) throw new Error(`La pieza ${pieza.slug} no tiene nada que subir.`)
  return { archivos, dir }
}

/**
 * Los sellos que una entrada de tanda puede llevar, y cómo se nombran cuando
 * uno no calza. Es la lista completa: `problemasDeSello` la recorre entera.
 */
const SELLOS = {
  huella_texto: 'el caption',
  huella_visual: 'lo visual',
  huella_escena: 'la escena del reel',
}

/**
 * Lo que Juanjo aprobó, contra lo que hay en disco ahora.
 *
 * La tanda sella una huella por cada cosa que él vio: el texto (el caption y
 * los hashtags de la vista previa), lo visual (las láminas de la hoja de
 * contactos) y, si la pieza es un reel, la escena. Sin el sello visual el
 * agujero era este: se corrige una cifra de una lámina el miércoles y se
 * vuelve a renderizar, y entonces la pieza y su `publicacion.json` cambian
 * JUNTOS —el control de `mediosDePieza` compara esos dos y calza— mientras el
 * caption, intacto, deja pasar el de texto. El paquete sale con una lámina que
 * nadie aprobó, bajo un "Aprobada por" que ya no corresponde.
 *
 * Un sello ausente es un error, no una omisión: toda tanda que pasó por
 * `enviarParaAprobacion` los trae, así que la única forma de que falte es una
 * entrada agregada a mano al JSON, que es justo el adversario del que se
 * defiende el control de `aprobada_por`.
 */
export function problemasDeSello(entrada, pieza) {
  const ahora = {
    huella_texto: huellaTexto(pieza),
    huella_visual: huellaVisual(pieza),
    ...(pieza.escena != null ? { huella_escena: huellaEscena(pieza.escena) } : {}),
  }
  const malo = []
  // Se recorren los TRES campos posibles y no los que la pieza pide hoy: si
  // el set a verificar saliera de la pieza, una que deja de declarar `escena`
  // entre la aprobación y el empaquetado dejaría su `huella_escena` sellada y
  // sin comparar —y ese es justo el bug original, el reel que se convierte en
  // la lámina de cierre sola—. El archivo vigilado no decide qué se vigila.
  for (const [campo, que] of Object.entries(SELLOS)) {
    const sellado = entrada[campo]
    const esperado = ahora[campo]
    if (esperado === undefined) {
      if (sellado !== undefined)
        malo.push(
          `la tanda sella ${que} (${campo}) de ${pieza.slug} y la pieza ya no lo tiene: ` +
            'dejó de ser lo que se aprobó. Vuelve a mandar la tanda a aprobación con lo de ahora.',
        )
      continue
    }
    if (sellado === undefined)
      malo.push(
        `A ${pieza.slug} le falta el sello de ${que} (${campo}) en la tanda: la entrada se agregó a mano ` +
          'después de la aprobación y no hay con qué comparar. Vuelve a mandar la tanda a aprobación.',
      )
    else if (sellado !== esperado)
      malo.push(
        `${que} de ${pieza.slug} cambió después de aprobarse (huella ${esperado} ≠ ${sellado}): ` +
          'se subiría algo que nadie aprobó. Vuelve a mandar la tanda a aprobación con lo de ahora.',
      )
  }
  return malo
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
    // Lo que se sube tiene que ser EL que se aprobó, en el texto y en los
    // píxeles. Acá se vuelve a leer el JSON de la pieza desde disco, que entre
    // la aprobación y el empaquetado alguien pudo corregir.
    const sellos = problemasDeSello(entrada, pieza)
    if (sellos.length) throw new Error(`Lo aprobado ya no es lo que hay:\n   · ${sellos.join('\n   · ')}`)
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
      destino: destinoInstagram(pieza),
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
    // El DESTINO, no el formato: el que sube tiene que saber si abre "reel",
    // "historia" o "publicación" en Instagram. La medida del lienzo va abajo,
    // como dato.
    lineas.push(`## ${s.orden}. ${s.rol} — ${s.destino}`)
    lineas.push('')
    lineas.push(`- Pieza: \`${s.pieza}\``)
    lineas.push(`- Formato: ${s.formato}`)
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
  subidas.forEach((s) => console.log(`   ${s.orden}. ${s.rol} · ${s.destino} · ${s.archivos.length} archivo(s)`))
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
