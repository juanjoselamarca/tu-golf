// Pieza 2 del lanzamiento — "Cada uno con su hándicap." Muda, 9:16.
//
// Un solo trabajo: que se entienda por qué sirve. La vuelta terminada, y el
// marcador pone los tres números del jugador en la MISMA fila:
//
//   1. el marcador quieto   → Catalina va primera con 34 de hándicap
//   2. su tarjeta           → anotó 105, el peor bruto de los cuatro
//   3. la tarjeta de Juan   → anotó 86, el mejor bruto, y va segundo
//   4. el marcador otra vez → el orden, ya con las dos tarjetas vistas
//
// Lo que se lee sin sonido ni texto es la resta: 34 y −1 arriba, 13 y +1 abajo.
// Por eso los planos 2 y 3 existen —muestran de dónde sale cada bruto— y por eso
// el plano 4 vuelve al marcador: la pieza cierra en la tabla, no en un cartón.

import { zonaSegura, encuadrarArriba } from '../encuadre.mjs'

/** La fila del marcador de un jugador: el botón que abre y cierra su tarjeta. */
function filaDe(page, nombre) {
  return page
    .getByTestId('marcador-individual')
    .getByRole('button', { name: new RegExp(`scorecard de ${nombre}$`) })
}

/**
 * El marcador tal como se VE: una fila por jugador, con su posición en pantalla
 * y los tres números que la pieza promete. Se parsea el texto de la FILA y no el
 * de la página: el nombre del jugador logueado también lo pinta el menú lateral
 * de la navbar, que está siempre en el DOM (cerrado es un `translateX(-100%)`).
 *
 * `hcp`, `neto` y `gross` salen de la misma fila para poder afirmar lo único que
 * esta pieza afirma: que la resta cuadra a la vista.
 */
async function filasDelMarcador(page, jugadores) {
  const filas = []
  for (const j of jugadores) {
    const fila = filaDe(page, j.nombre)
    const caja = await fila.boundingBox()
    if (!caja) throw new Error(`"${j.nombre}" no aparece en el marcador`)
    const texto = (await fila.innerText()).replace(/\s+/g, ' ').trim()
    const hcp = texto.match(/\b(\d{1,2})\s[+-]/)
    const neto = texto.match(/\s([+-]\d{1,2})\s/)
    const gross = texto.match(/Gross\s([+-]\d{1,3})/i)
    if (!hcp || !neto || !gross)
      throw new Error(`la fila de ${j.nombre} no trae los tres números: "${texto}"`)
    filas.push({
      nombre: j.nombre,
      y: caja.y,
      hcp: Number(hcp[1]),
      neto: Number(neto[1]),
      gross: Number(gross[1]),
    })
  }
  return filas.sort((a, b) => a.y - b.y)
}

/**
 * Lee la tarjeta abierta y la contrasta con la escena. Es la guarda de la
 * SIEMBRA: la tarjeta es lo único del video que muestra golpe por golpe, y si la
 * base quedó con la vuelta de una corrida anterior —se corrigió un cartón en la
 * revisión y nadie volvió a sembrar— el plano sale igual, con otros números.
 */
async function verificarTarjeta(page, escena, nombre, fila) {
  const texto = (await page.getByTestId('marcador-individual').innerText()).replace(/\s+/g, ' ')
  const cabecera = texto.match(/HCP (\d+) (\d+) ([+-]\d+) (\d+) ([+-]\d+) net/)
  if (!cabecera) throw new Error(`la tarjeta de ${nombre} no abrió: "${texto.slice(0, 160)}"`)
  const [, hcp, bruto, , neto, netoVsPar] = cabecera.map(Number)
  const jugador = escena.jugadores.find((j) => j.nombre === nombre)
  const brutoDeLaEscena = jugador.golpes.reduce((a, g) => a + g, 0)
  const idaEnPantalla = texto.match(/OUT (?:\d+ ){9}\d+ ((?:\d+ ){8}\d+)/)
  const ida = idaEnPantalla ? idaEnPantalla[1].split(' ').map(Number) : []
  const idaDeLaEscena = jugador.golpes.slice(0, 9)
  // El total no alcanza como guarda: dos cartones distintos suman lo mismo. Lo
  // que el plano muestra es la IDA hoyo por hoyo, así que eso es lo que se
  // compara contra la escena.
  if (bruto !== brutoDeLaEscena || ida.join() !== idaDeLaEscena.join())
    throw new Error(
      `la tarjeta de ${nombre} muestra ${bruto} (${ida.join(',')}) y la escena siembra ` +
        `${brutoDeLaEscena} (${idaDeLaEscena.join(',')}): la base quedó con otra vuelta ` +
        '(volver a correr escena.mjs)',
    )
  if (hcp !== fila.hcp || netoVsPar !== fila.neto)
    throw new Error(`la tarjeta de ${nombre} no coincide con su fila del marcador`)
  return `${nombre}: ${bruto} brutos · hcp ${hcp} · ${neto} neto (${netoVsPar})`
}

/**
 * Pone la tabla justo DEBAJO de la zona que tapa Instagram.
 *
 * La vuelta está cerrada, así que la pantalla abre con el "Resultado final" y
 * el resumen personal del que mira; la tabla de los cuatro queda más abajo. El
 * plan pide que el PRIMER segundo ya muestre lo que la pieza viene a contar, y
 * eso es la tabla: el encuadre se hace antes del primer fotograma, no con un
 * scroll grabado que le regala dos segundos al pulgar.
 *
 * El corte de arriba no va al borde del cuadro sino al borde de la ZONA SEGURA:
 * pegada al tope, la fila 1 —el 34 y el −1 que el caption pide restar— quedaba
 * debajo de la barra de estado y del rótulo "Reels", y en el recorte 4:5 del
 * feed y de la grilla del perfil se partía al medio. Arriba de la tabla queda
 * el botón "Compartir resultado" entero, que es contenido real de la pantalla y
 * no un elemento cortado a mitad de línea.
 */
async function encuadrarTabla(page) {
  await encuadrarArriba(page, page.getByTestId('marcador-individual'), { nombre: 'el marcador' })
}

/**
 * Lo mismo, con la tarjeta abierta adentro.
 *
 * La grilla hoyo por hoyo es lo que el plano vino a mostrar, así que tiene que
 * entrar ENTERA dentro de la zona segura: los 340 px de abajo se los come el
 * caption de Instagram. Desde el borde de la tabla no siempre alcanza —la
 * tarjeta cuelga de su fila, y la del segundo jugador arranca una fila más
 * abajo—, así que se baja el MÍNIMO necesario y nada más.
 *
 * Lo que se gasta al bajar es franja de arriba, que en el teléfono está tapada
 * por la barra de estado y el rótulo "Reels"; lo que NO se negocia es que la
 * fila del jugador abierto quede dentro de la zona segura, porque es la que
 * tiene el hándicap y el neto que la pieza pide restar. Si ni así entra, la
 * toma se corta en vez de recortar el gancho en silencio.
 *
 * La línea de contadores ("0 Eagles · 1 Birdies…") sí puede quedar debajo del
 * corte: es un resumen secundario y el espectador no lo necesita para entender
 * la pieza. El fin de la grilla es justo donde arranca ese bloque.
 */
async function encuadrarTarjeta(page, nombre) {
  await encuadrarTabla(page)
  const seguro = zonaSegura(page)
  const contadores = await page.getByText(/Eagles/).last().boundingBox()
  if (!contadores) throw new Error(`la tarjeta de ${nombre} no abrió`)
  const sobra = Math.round(contadores.y - seguro.abajo)
  if (sobra > 0) {
    await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'instant' }), sobra)
    await page.waitForTimeout(350)
  }
  const fila = await filaDe(page, nombre).boundingBox()
  if (!fila) throw new Error(`la fila de ${nombre} se fue de pantalla`)
  if (fila.y < seguro.arriba)
    throw new Error(
      `para que la tarjeta de ${nombre} entre completa su fila queda en y=${Math.round(fila.y)}, ` +
        `arriba de la zona segura (${seguro.arriba}): la interfaz de Instagram taparía el ` +
        'hándicap y el neto (revisar el plano, no el encuadre)',
    )
}

export default async function guion({ page, toma, escena, BASE }) {
  const notas = {}
  const [primera, segunda] = escena.tarjetas_del_gesto

  // ── Plano 1: el marcador quieto ───────────────────────────────────────────
  await page.goto(`${BASE}/ronda-libre/${escena.codigo}`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  })
  await page.waitForTimeout(2500)
  if (page.url().includes('/login')) throw new Error('la toma llegó al marcador sin sesión')

  await encuadrarTabla(page)
  const filas = await filasDelMarcador(page, escena.jugadores)
  notas.marcador = filas.map((f) => `${f.nombre} hcp ${f.hcp} neto ${f.neto} gross ${f.gross}`)

  // Lo justo para leer las cuatro filas y no más: en un reel mudo, el plano de
  // apertura es el tiempo que el pulgar tarda en pasar de largo. El giro de la
  // pieza —el 105 de la que va primera— tiene que llegar antes del segundo 3.
  await toma.frame(1400, 'marcador')

  // ── Plano 2: la tarjeta de la primera (el peor bruto) ─────────────────────
  await toma.tocar(filaDe(page, primera), { nota: 'abre-primera', despues: 400 })
  await encuadrarTarjeta(page, primera)
  notas.tarjeta_primera = await verificarTarjeta(page, escena, primera, filas[0])
  await toma.frame(2500, 'tarjeta-primera')

  // ── Plano 3: la tarjeta del segundo (el mejor bruto) ──────────────────────
  // Abrir una cierra la otra (el marcador expande de a una), así que este toque
  // es el contraste completo: el cartón de 105 se va y entra el de 86.
  await toma.tocar(filaDe(page, segunda), { nota: 'abre-segunda', despues: 400 })
  await encuadrarTarjeta(page, segunda)
  notas.tarjeta_segunda = await verificarTarjeta(page, escena, segunda, filas[1])
  await toma.frame(2200, 'tarjeta-segunda')

  // ── Plano 4: vuelta al marcador ───────────────────────────────────────────
  await toma.tocar(filaDe(page, segunda), { nota: 'cierra', antes: 300, durante: 500, despues: 150 })
  await encuadrarTabla(page)
  await toma.frame(1700, 'marcador-final')

  // ── Lo que la pieza afirma, verificado contra lo que se grabó ─────────────
  // Si algo de esto no se cumple, el video no cuenta la historia del caption y
  // hay que revisar la escena, no el encuadre.
  const orden = filas.map((f) => f.nombre)
  const porBruto = [...filas].sort((a, b) => a.gross - b.gross)
  notas.orden_neto = orden
  notas.orden_bruto = porBruto.map((f) => f.nombre)

  if (orden[0] !== primera)
    throw new Error(`el marcador no abre con ${primera}: ${orden.join(' > ')}`)
  if (porBruto[porBruto.length - 1].nombre !== primera)
    throw new Error(
      `${primera} va primera pero NO tiene el peor bruto: ${notas.orden_bruto.join(' > ')}`,
    )
  if (porBruto[0].nombre === primera)
    throw new Error(`${primera} ganaría igual sin hándicap: la pieza no muestra nada`)
  for (const f of filas)
    if (f.hcp + f.neto !== f.gross)
      throw new Error(
        `la fila de ${f.nombre} no cuadra en pantalla: ${f.hcp} + (${f.neto}) ≠ ${f.gross}`,
      )

  return notas
}
