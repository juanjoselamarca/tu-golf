// Pieza 1 del lanzamiento — "Anota. Todos ven lo mismo." Muda, 9:16.
//
// Un solo trabajo: que se entienda qué es la app. Tres planos, y el del medio
// es el gesto:
//
//   1. el marcador en vivo    → Diego va primero
//   2. el scorer              → un dedo baja el score de Juan a 3 (birdie)
//   3. el marcador otra vez   → Juan va primero
//
// El adelantamiento es lo único que se lee sin sonido ni texto, y solo se lee
// si el espectador vio el orden ANTES. Por eso el primer plano existe: sin él
// el tercero es una tabla cualquiera.

/** El nombre tal cual lo pinta el scorer, para ubicar su tarjeta. */
const QUIEN_ANOTA = 'Juan Pérez'

/** La tarjeta del jugador: el bloque que tiene su nombre y los botones. */
function tarjetaDe(page, nombre) {
  return page
    .locator('div')
    .filter({ has: page.getByText(nombre, { exact: true }) })
    .filter({ has: page.locator('button') })
    .last()
}

/**
 * El orden del marcador tal como se VE: los nombres ordenados por su posición
 * en pantalla. Leer el texto del body no servía — traía el menú entero y daba
 * lo mismo antes y después del golpe, así que no verificaba nada.
 *
 * Y se busca DENTRO del marcador, no en la página entera: el que anota está
 * logueado con su nombre, y ese nombre también lo pinta el menú lateral de la
 * navbar, que está SIEMPRE en el DOM —cerrado es un `translateX(-100%)`, no un
 * desmontaje— y arriba de todo. Sin acotar, el "Juan Pérez" más alto de la
 * página era el del menú y la toma se abortaba sola diciendo que ya iba primero.
 */
async function ordenDelMarcador(page, jugadores) {
  const marcador = page.getByTestId('marcador-individual')
  const filas = []
  for (const j of jugadores) {
    const caja = await marcador.getByText(j.nombre, { exact: true }).first().boundingBox()
    if (!caja) throw new Error(`"${j.nombre}" no aparece en el marcador`)
    filas.push({ nombre: j.nombre, y: caja.y })
  }
  return filas.sort((a, b) => a.y - b.y).map((f) => f.nombre)
}

export default async function guion({ page, toma, escena, BASE }) {
  const notas = {}
  const url = `${BASE}/ronda-libre/${escena.codigo}`

  // ── Plano 1: cómo va la cosa antes del golpe ──────────────────────────────
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(2000)
  if (page.url().includes('/login')) throw new Error('la toma llegó al marcador sin sesión')
  notas.orden_antes = await ordenDelMarcador(page, escena.jugadores)
  await toma.frame(2100, 'marcador-antes')

  // ── Plano 2: el scorer, en el hoyo del gesto ──────────────────────────────
  await page.goto(`${url}/score-grupo`, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(3500)
  if (!page.url().includes('/score-grupo'))
    throw new Error(`el scorer rebotó a ${page.url()} (¿la ronda quedó es_demo o sin admin_mode?)`)

  const tarjeta = tarjetaDe(page, QUIEN_ANOTA)
  notas.hoyo = (await page.getByText(/HOYO/i).first().textContent())?.trim()
  notas.antes = (await tarjeta.textContent())?.replace(/\s+/g, ' ').trim()

  // Un segundo y medio quieto alcanza para leer el hoyo, el par y los cuatro
  // jugadores: es el "primer segundo con golf y producto" que pide el plan.
  await toma.frame(1500, 'scorer-quieto')

  // ── El gesto: de 4 a 3, con el dedo a la vista ────────────────────────────
  const menos = tarjeta.locator('button').first()
  await toma.tocar(menos, { nota: 'toque-1' })
  notas.tras_toque_1 = (await tarjeta.textContent())?.replace(/\s+/g, ' ').trim()

  // El scorer pide confirmar el cambio ("Toca otra vez para cambiar el score"):
  // es la guarda anti-toque de la cancha. Si está pidiendo confirmación, se
  // confirma; si ya quedó anotado, un segundo toque bajaría a 2 y arruinaría la
  // toma, así que se decide mirando la pantalla, no a ciegas.
  const pideConfirmar = await page
    .getByText(/Toca otra vez para cambiar/i)
    .first()
    .isVisible()
    .catch(() => false)
  notas.pidio_confirmar = pideConfirmar
  if (pideConfirmar) {
    await toma.tocar(menos, { nota: 'toque-2' })
    notas.tras_toque_2 = (await tarjeta.textContent())?.replace(/\s+/g, ' ').trim()
  }

  await toma.frame(1200, 'score-anotado')

  // ── Plano 3: el mismo marcador, ya dado vuelta ────────────────────────────
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await toma.rafaga(1800, 'entra-el-marcador')
  await page.waitForTimeout(1200)
  await toma.frame(2600, 'marcador-despues')

  notas.orden_despues = await ordenDelMarcador(page, escena.jugadores)

  // La pieza entera depende de esto: si el golpe no cambió al líder, el video
  // no cuenta nada y hay que revisar la escena, no el encuadre.
  if (notas.orden_despues[0] !== QUIEN_ANOTA)
    throw new Error(
      `el gesto no cambió al líder: antes ${notas.orden_antes.join(' > ')} / ` +
        `después ${notas.orden_despues.join(' > ')}`,
    )
  if (notas.orden_antes[0] === QUIEN_ANOTA)
    throw new Error(`${QUIEN_ANOTA} ya iba primero antes del golpe: no hay adelantamiento que mostrar`)

  return notas
}
