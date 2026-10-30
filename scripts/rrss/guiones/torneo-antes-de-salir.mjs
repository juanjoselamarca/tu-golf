// Pieza 3 del lanzamiento — «Tu torneo, listo antes de salir.» Muda, 9:16.
//
// Las dos primeras piezas son para el jugador. Esta es para el que ARMA: se ve
// el torneo creándose de cero y termina en el QR que los jugadores escanean.
//
//   1. la pantalla de plantillas  → "¿Por dónde empezamos?"
//   2. se toca "Stroke Play 18 hoyos"
//   3. se escribe el nombre y la fecha
//   4. se busca la cancha y se elige
//   5. "Crear torneo" → el QR de inscripción, con el código a la vista
//
// Sin rótulos quemados ni voz: el único texto es el de la app (más los
// subtítulos que el montaje quema), que es lo mismo que el organizador va a ver
// cuando lo haga él.
//
// Lo que la pieza promete es la PANTALLA, no el reloj, y la diferencia importa
// porque el caption se escribe a partir de esto: el tecleo se graba tecla por
// tecla pero a un ritmo puesto acá (`MS_POR_TECLA`), y la espera del servidor no
// se filma —en local tarda segundos que no son los de nadie—. Así que ni este
// archivo ni el caption pueden decir "a velocidad real" ni "sin cortes": lo
// decían, y era lo único de la pieza que el espectador no podía comprobar.
import { encuadrarArriba, zonaSegura } from '../encuadre.mjs'

/**
 * El ritmo del tecleo en pantalla, en milisegundos por tecla.
 *
 * Es una decisión de montaje, no una medición: nadie cronometró a un
 * organizador. Vive con nombre para que se lea como lo que es —si mañana alguien
 * quiere que el video vaya "a velocidad real", el número que hay que medir es
 * este— y para que el caption no vuelva a prometer un reloj que acá se elige.
 */
const MS_POR_TECLA = 85

/**
 * Escribe a la vista, una tecla por fotograma.
 *
 * No se usa `fill()` —el texto aparecería de golpe, que en un reel se lee como
 * un montaje— ni `pressSequentially()`, que teclea mientras la cámara mira para
 * otro lado: acá cada tecla deja su fotograma, y el texto se ve aparecer letra
 * por letra como cuando lo escribe una persona.
 */
async function teclear(toma, campo, texto, { msPorTecla = MS_POR_TECLA, nota = 'tecleo' } = {}) {
  for (const letra of texto) {
    await campo.press(letra === ' ' ? 'Space' : letra)
    await toma.frame(msPorTecla, nota)
  }
}

/** El buscador de cancha de la primera ronda del borrador. */
function buscadorDeCancha(page) {
  return page.getByPlaceholder('Buscar cancha...').first()
}

/**
 * Espera a que la app termine de crear el torneo, o se rinde con el motivo.
 *
 * Crear torneo tiene rate limit (5 por hora y por usuario) y la toma gasta uno
 * en cada corrida: al sexto intento la app responde 429 y se queda en el
 * borrador. Esperar solo la navegación dejaba la toma colgada 60 s para morir
 * con "Timeout exceeded", que no dice nada de por qué.
 *
 * Tampoco sirve correr la navegación contra `[role=alert]`: la pantalla del
 * borrador tiene avisos propios —el estado de guardado, la advertencia de la
 * cancha— y uno de ellos gana la carrera aunque el torneo se haya creado bien
 * (pasó: el endpoint devolvió 200 y la toma murió igual). Lo que se mira es la
 * RESPUESTA del endpoint, que es donde la app dice sí o no, y recién después la
 * navegación. El `waitForResponse` se arma ANTES del toque, si no la respuesta
 * llega mientras todavía no hay nadie escuchando.
 */
function escucharLaCreacion(page, { timeout = 60_000 } = {}) {
  return page.waitForResponse((r) => r.url().includes('/create-tournament'), { timeout })
}

async function esperarElTorneoCreado(page, creacion) {
  const respuesta = await creacion
  if (!respuesta.ok()) {
    const cuerpo = (await respuesta.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
    throw new Error(`la app rechazó crear el torneo (HTTP ${respuesta.status()}): ${cuerpo}`)
  }
  await page.waitForURL(/\/organizador\/[^/]+\/jugadores/, { timeout: 30_000 })
}

export default async function guion({ page, toma, escena, BASE }) {
  const notas = {}
  const { nombre, fecha, plantilla, busqueda } = escena.torneo

  // ── Plano 1: por dónde se empieza ─────────────────────────────────────────
  await page.goto(`${BASE}/organizador/nuevo`, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(2000)
  if (page.url().includes('/login')) throw new Error('la toma llegó a /organizador/nuevo sin sesión')

  const botonPlantilla = page.getByRole('button', { name: new RegExp(plantilla) }).first()
  if (!(await botonPlantilla.count()))
    throw new Error(`la plantilla "${plantilla}" ya no está en /organizador/nuevo`)
  await toma.frame(1300, 'plantillas')

  // ── Plano 2: la plantilla ─────────────────────────────────────────────────
  await toma.tocar(botonPlantilla, { nota: 'elige-plantilla', despues: 600 })
  const campoNombre = page.locator('#t-name')
  await campoNombre.waitFor({ state: 'visible', timeout: 30_000 })
  await toma.frame(1100, 'borrador')

  // ── Plano 3: el nombre, tecla por tecla ───────────────────────────────────
  await toma.tocar(campoNombre, { nota: 'toca-nombre', despues: 250 })
  await teclear(toma, campoNombre, nombre, { nota: 'escribe-nombre' })
  await toma.frame(600, 'nombre-escrito')

  // ── Plano 4: la fecha ─────────────────────────────────────────────────────
  // Un `input[type=date]` en el teléfono abre el calendario del SISTEMA, que no
  // existe en un navegador sin ventana: se toca (se ve el dedo) y el valor se
  // pone de una, que es lo que el organizador ve cuando elige el día.
  const campoFecha = page.locator('#t-date')
  await toma.tocar(campoFecha, { nota: 'toca-fecha', despues: 250 })
  await campoFecha.fill(fecha)
  await toma.frame(800, 'fecha-puesta')

  // ── Plano 5: la cancha ────────────────────────────────────────────────────
  // De la cancha salen el rating y el slope con los que después se calcula el
  // hándicap de cada jugador: es el campo que hace que el torneo sea un torneo
  // y no una planilla, y por eso tiene plano propio.
  const buscador = buscadorDeCancha(page)
  await buscador.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await toma.tocar(buscador, { nota: 'toca-cancha', despues: 250 })
  await teclear(toma, buscador, busqueda, { nota: 'busca-cancha' })
  const resultado = page.getByText(escena.cancha, { exact: false }).last()
  await resultado.waitFor({ state: 'visible', timeout: 20_000 })
  await toma.frame(700, 'resultado-cancha')
  await toma.tocar(resultado, { nota: 'elige-cancha', despues: 600 })
  await toma.frame(900, 'cancha-elegida')

  // ── Plano 6: crear ────────────────────────────────────────────────────────
  const crear = page.getByRole('button', { name: /Crear torneo/ }).first()
  await crear.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await toma.frame(700, 'listo-para-crear')
  const creacion = escucharLaCreacion(page)
  await toma.tocar(crear, { nota: 'crea', despues: 300 })
  await esperarElTorneoCreado(page, creacion)
  await toma.rafaga(1800, 'creando')

  // ── Plano 7: el QR que reciben los jugadores ──────────────────────────────
  const tarjeta = page.getByTestId('tarjeta-invitacion')
  await tarjeta.waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(600)
  const seguro = await encuadrarArriba(page, tarjeta, { nombre: 'la tarjeta de invitación' })
  await toma.frame(1800, 'qr')

  // ── Plano 8: se abren las inscripciones ───────────────────────────────────
  // El torneo recién creado nace en borrador, y la barra de abajo dice "Aún no
  // puedes iniciar" al lado de "Eliminar torneo": terminar ahí deja la pieza
  // cerrando en rojo. Abrir las inscripciones es además el paso siguiente real
  // del organizador —el que hace que el link sirva— y la app lo responde con
  // "Comparte el link para que se inscriban", que es el cierre que la pieza
  // quiere: el torneo ya está, falta que lleguen.
  const abrir = page.getByRole('button', { name: /Abrir inscripciones/ })
  await toma.tocar(abrir, { nota: 'abre-inscripciones', despues: 500 })
  await page.getByText(/Inscripciones abiertas/).first().waitFor({ state: 'visible', timeout: 30_000 })
  await encuadrarArriba(page, tarjeta, { nombre: 'la tarjeta de invitación' })
  await toma.frame(2300, 'inscripciones-abiertas')

  // ── Lo que la pieza afirma, verificado contra lo que se grabó ─────────────
  const slug = new URL(page.url()).pathname.split('/')[2]
  const encabezado = (await page.getByText(nombre).first().innerText()).replace(/\s+/g, ' ')
  notas.torneo = `${encabezado} · /organizador/${slug}/jugadores`

  const textoPantalla = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  if (!textoPantalla.includes(escena.cancha))
    throw new Error(`el torneo creado no muestra la cancha "${escena.cancha}": ${textoPantalla.slice(0, 200)}`)

  // El QR codifica el link de inscripción, que no se puede leer del DOM. El
  // botón de WhatsApp arma ESE MISMO link con `urlInscripcion()`, así que leer
  // su href es leer lo que el QR va a llevar: si algún día volviera a salir del
  // origen del navegador, acá diría "localhost:3100" y la toma se corta. Un QR
  // a localhost se ve idéntico a uno bueno, y el que lo escanea no llega nunca.
  const whatsapp = await page.locator('a[href*="wa.me"]').first().getAttribute('href')
  const link = decodeURIComponent(whatsapp ?? '').match(/https?:\/\/\S+\/unirse/)?.[0]
  if (!link) throw new Error(`no se encontró el link de inscripción en el botón de WhatsApp: ${whatsapp}`)
  if (!/^https:\/\/golfersplus\.vercel\.app\//.test(link))
    throw new Error(`el QR del video llevaría a "${link}" y no al sitio público`)
  if (!link.includes(slug)) throw new Error(`el link de inscripción no es el de este torneo: ${link}`)
  notas.link_de_inscripcion = link

  // El código de 6 caracteres es la otra forma de entrar (el que no escanea, lo
  // teclea). Si no está, el plano final muestra media promesa.
  const codigo = textoPantalla.match(/C[óo]digo:?\s*([A-Z0-9]{5,8})/)
  if (!codigo) throw new Error('la tarjeta de invitación no muestra el código del torneo')
  notas.codigo = codigo[1]

  // El plano final es el que vende. La tarjeta entera no entra en la zona segura
  // —son 611 px de alto contra 532 disponibles— así que lo que se exige es lo
  // que el plano vino a mostrar: el QR completo y la línea que dice para qué
  // sirve. Los botones de compartir y el código quedan abajo, dentro de la
  // franja del caption: son la acción del ORGANIZADOR, que ya tiene el torneo
  // creado, no lo que el espectador necesita leer.
  const qr = page.getByText('Escanea para inscribirte')
  const fin = await qr.boundingBox()
  if (!fin) throw new Error('el QR no está en pantalla')
  if (fin.y + fin.height > seguro.abajo)
    throw new Error(
      `el QR termina en y=${Math.round(fin.y + fin.height)} y la zona segura cierra en ` +
        `${seguro.abajo}: quedaría debajo del caption de Instagram`,
    )
  const caja = await tarjeta.boundingBox()
  if (!caja) throw new Error('la tarjeta de invitación se fue de pantalla')
  const avisoFinal = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  if (!/Inscripciones abiertas|Comparte el link/.test(avisoFinal))
    throw new Error('la pieza cierra sin el aviso de inscripciones abiertas')
  notas.cierre = 'inscripciones abiertas · "Comparte el link para que se inscriban"'
  notas.encuadre = `tarjeta ${Math.round(caja.y)}–${Math.round(caja.y + caja.height)} · zona segura ${zonaSegura(page).arriba}–${seguro.abajo}`

  return notas
}
