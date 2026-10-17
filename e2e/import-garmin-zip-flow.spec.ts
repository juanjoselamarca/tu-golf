/**
 * Importar desde el ZIP de Garmin — /importar?source=garmin_zip
 *
 * El ZIP que manda Garmin por email pesa 80+ MB (fitness, GPS…) y Vercel corta el cuerpo en 4,5 MB:
 * el navegador abre el ZIP con JSZip y sube SOLO `Golf-SCORECARD.json` y `Golf-COURSE.json`. Hasta hoy
 * ningún spec pasaba de la pantalla guía de Garmin.
 *
 * Con un ZIP REAL armado en el test (JSZip, la misma librería que usa la app):
 *  1. Se suben solo los dos JSON golf, con su contenido exacto — no el ZIP, no el señuelo `RawData`.
 *  2. Sin `Golf-COURSE.json` se manda solo la tarjeta.
 *  3. Revisión: conteo, sello "DATOS DE GARMIN", putts/fairways/penalties, 9 hoyos.
 *  4. Confirmar manda solo las aceptadas, con la identidad de Garmin intacta (garmin_scorecard_id,
 *     import_source, course_id, tee) y el formato elegido.
 *  5. Celebración con lo que el servidor guardó: importadas + actualizadas ("1 ya estaba y se actualizó").
 *  6. Todo duplicado → no celebra: "Estas tarjetas ya estaban en tu historial…".
 *  7. Cada puerta cerrada con su mensaje y SIN subir nada: no es .zip, ZIP corrupto, ZIP sin tarjeta,
 *     tarjeta > 4 MB. Y del servidor: 0 rondas, 413 en texto plano, error con mensaje, sin red.
 *
 * /api/import/garmin-zip y /api/import/confirm están mockeados: no se crean import_jobs ni rondas.
 * Los errores provocados no llegan a `error_logs` ni a PostHog de prod (interceptados y contados).
 */
import { test, expect, type Page, type Request } from '@playwright/test'
import JSZip from 'jszip'
import { LIMITE_CUERPO_SUBIDA_BYTES as LIMITE } from '../src/lib/red/limite-cuerpo'

/* ─── ZIP de Garmin ──────────────────────────────────────────────────────── */

const RUTA_GOLF = 'DI_CONNECT/DI-GOLF'

const SCORECARD = JSON.stringify({
  data: [
    { id: 987654321, courseGlobalId: 4242, startTime: '2026-09-20T12:00:00.0', holes: [{ number: 1, strokes: 4 }] },
  ],
  marca: 'e2e-scorecard-real',
})
const COURSE = JSON.stringify({ data: [{ globalId: 4242, name: 'Los Leones' }], marca: 'e2e-course-real' })
/**
 * Señuelo: un `Golf-SCORECARD.json` dentro de una carpeta RawData. Lleva el nombre EXACTO de la tarjeta, así
 * que solo el filtro `rawdata` de la app lo descarta (sin ese filtro, la app subiría este).
 */
const SCORECARD_RAW = JSON.stringify({ marca: 'e2e-scorecard-rawdata-NO' })

interface OpcionesZip {
  scorecard?: string | null
  course?: string | null
  /** Bytes de relleno (fitness/GPS) para que el ZIP pese más que el límite de Vercel. */
  relleno?: number
}

async function zipDeGarmin({ scorecard = SCORECARD, course = COURSE, relleno = 0 }: OpcionesZip = {}): Promise<Buffer> {
  const zip = new JSZip()
  // El señuelo va primero: la app no puede quedarse con el primer "scorecard" que encuentre.
  zip.file(`${RUTA_GOLF}/RawData/Golf-SCORECARD.json`, SCORECARD_RAW)
  zip.file('DI_CONNECT/DI-Connect-User/user_profile.json', '{"userName":"e2e"}')
  if (scorecard != null) zip.file(`${RUTA_GOLF}/Golf-SCORECARD.json`, scorecard)
  if (course != null) zip.file(`${RUTA_GOLF}/Golf-COURSE.json`, course)
  if (relleno > 0) {
    // Aleatorio → no comprime: el ZIP pesa de verdad lo que dice `relleno`.
    const bytes = Buffer.alloc(relleno)
    for (let i = 0; i < relleno; i++) bytes[i] = (Math.random() * 256) | 0
    zip.file('DI_CONNECT/DI-Connect-Fitness/activities.fit', bytes)
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/* ─── Respuestas mock ────────────────────────────────────────────────────── */

const PARES_18 = [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 3, 4, 4, 5, 5]
const porHoyo = (xs: number[]) => Object.fromEntries(xs.map((x, i) => [String(i + 1), x]))

const RONDA_18 = {
  tempId: 'garmin-e2e-1',
  played_at: '2026-09-20',
  course_name: 'Club de Golf Los Leones',
  course_id: 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26',
  tee_color: 'blanco',
  total_gross: 84,
  holes_played: 18,
  scores: porHoyo([5, 4, 4, 5, 5, 3, 5, 4, 6, 5, 3, 5, 4, 4, 5, 5, 6, 6]),
  par_per_hole: porHoyo(PARES_18),
  // La API real siempre manda CR/slope del archivo: son el respaldo si la cancha no resuelve en el catálogo.
  course_rating: 71.2,
  slope_rating: 128,
  import_confidence: 1.0,
  validation: { valid: true, holesPlayed: 18, issues: [] },
  metadata: { import_source: 'garmin_zip', garmin_scorecard_id: '987654321', putts: 31, fairways: 9, penalties: 1 },
}

const RONDA_9 = {
  tempId: 'garmin-e2e-2',
  played_at: '2026-09-13',
  course_name: 'Club de Golf La Dehesa',
  course_id: null,
  tee_color: null,
  total_gross: 44,
  holes_played: 9,
  scores: porHoyo([5, 5, 4, 6, 5, 4, 5, 4, 6]),
  par_per_hole: porHoyo(PARES_18.slice(0, 9)),
  course_rating: null,
  slope_rating: null,
  import_confidence: 1.0,
  validation: { valid: true, holesPlayed: 9, issues: [] },
  metadata: { import_source: 'garmin_zip', garmin_scorecard_id: '987654322', putts: 17 },
}

const JOB_ID = 'garmin-e2e-job-001'

/* ─── Helpers ────────────────────────────────────────────────────────────── */

interface Parte { name: string; filename: string | null; body: string }

/** Parte un multipart/form-data en sus campos (suficiente para los JSON que manda la app). */
function partesMultipart(req: Request): Parte[] {
  const tipo = req.headers()['content-type'] ?? ''
  const boundary = /boundary=(.+)$/.exec(tipo)?.[1]
  const cuerpo = req.postDataBuffer()?.toString('utf8') ?? ''
  if (!boundary) return []
  return cuerpo.split(`--${boundary}`).slice(1, -1).map(bloque => {
    const [cabecera, ...resto] = bloque.replace(/^\r\n/, '').split('\r\n\r\n')
    return {
      name: /name="([^"]+)"/.exec(cabecera)?.[1] ?? '',
      filename: /filename="([^"]+)"/.exec(cabecera)?.[1] ?? null,
      body: resto.join('\r\n\r\n').replace(/\r\n$/, ''),
    }
  })
}

interface Mocks {
  subidas: Request[]
  confirmaciones: Array<{ job_id: string | null; rounds: Array<Record<string, unknown>> }>
}

async function montarMocks(
  page: Page,
  opciones: {
    garmin?: (route: Parameters<Parameters<Page['route']>[1]>[0]) => Promise<void>
    confirm?: Record<string, unknown>
  } = {},
): Promise<Mocks> {
  const mocks: Mocks = { subidas: [], confirmaciones: [] }
  await page.route('**/api/import/garmin-zip', async route => {
    mocks.subidas.push(route.request())
    if (opciones.garmin) return opciones.garmin(route)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: JOB_ID, rounds: [RONDA_18, RONDA_9] }),
    })
  })
  await page.route('**/api/import/confirm', async route => {
    mocks.confirmaciones.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opciones.confirm ?? { success: true, job_id: JOB_ID, total_imported: 1, total_errors: 0, total_duplicates: 0 }),
    })
  })
  return mocks
}

async function irAGuiaGarmin(page: Page) {
  await page.goto('/importar?source=garmin_zip', { waitUntil: 'domcontentloaded' })
  const body = await page.locator('body').innerText().catch(() => '')
  test.skip(/Security Checkpoint|Failed to verify your browser/.test(body), 'Vercel Security Checkpoint bloqueó el navegador headless')
  await expect(page.getByRole('button', { name: 'Seleccionar archivo ZIP' })).toBeVisible({ timeout: 20_000 })
}

async function subir(page: Page, name: string, buffer: Buffer, mimeType = 'application/zip') {
  await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name, mimeType, buffer })
}

/** Intercepta los reportes de error (error_logs + PostHog) y guarda el `source` de cada uno. */
async function silenciarReporteDeErrores(page: Page): Promise<string[]> {
  const fuentes: string[] = []
  await page.route(/\/rest\/v1\/error_logs/, route => {
    let body: { source?: string } | Array<{ source?: string }> | null = null
    try { body = route.request().postDataJSON() } catch { /* cuerpo no JSON */ }
    for (const fila of Array.isArray(body) ? body : [body]) fuentes.push(String(fila?.source))
    return route.fulfill({ status: 201, body: '' })
  })
  await page.route(/posthog\.com/, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  return fuentes
}

const MENSAJE_MUY_GRANDE =
  'Tu historial de Garmin es demasiado grande para subirlo de una vez. Importa tus rondas recientes con pantallazos.'

/* ─── Tests ──────────────────────────────────────────────────────────────── */

test.describe('Importar ZIP de Garmin — del archivo a la confirmación', () => {
  let reportes: string[] = []
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.E2E_TEST_USER_EMAIL, 'Sin E2E_TEST_USER_EMAIL')
    reportes = await silenciarReporteDeErrores(page)
  })

  test('un ZIP de 6 MB sube solo la tarjeta y las canchas (contenido exacto, sin el señuelo RawData)', async ({ page }) => {
    const mocks = await montarMocks(page)
    await irAGuiaGarmin(page)
    const zip = await zipDeGarmin({ relleno: 6 * 1024 * 1024 })
    expect(zip.length).toBeGreaterThan(6 * 1024 * 1024)

    await subir(page, 'garmin-export.zip', zip)
    await expect(page.getByRole('heading', { name: 'Revisar 2 rondas' })).toBeVisible({ timeout: 20_000 })

    expect(mocks.subidas).toHaveLength(1)
    const req = mocks.subidas[0]
    expect(req.postDataBuffer()!.length, 'el cuerpo debe ser los JSON golf, no el ZIP').toBeLessThan(64 * 1024)
    const partes = partesMultipart(req)
    expect(partes.map(p => [p.name, p.filename])).toEqual([
      ['scorecard_json', 'Golf-SCORECARD.json'],
      ['course_json', 'Golf-COURSE.json'],
    ])
    expect(partes[0].body).toBe(SCORECARD)
    expect(partes[1].body).toBe(COURSE)
  })

  test('sin Golf-COURSE.json en el ZIP sube solo la tarjeta', async ({ page }) => {
    const mocks = await montarMocks(page)
    await irAGuiaGarmin(page)
    await subir(page, 'garmin.zip', await zipDeGarmin({ course: null }))
    await expect(page.getByRole('heading', { name: 'Revisar 2 rondas' })).toBeVisible({ timeout: 20_000 })
    const partes = partesMultipart(mocks.subidas[0])
    expect(partes.map(p => p.name)).toEqual(['scorecard_json'])
    expect(partes[0].body).toBe(SCORECARD)
  })

  test('revisión: sello Garmin, gross, stats y 9 hoyos; confirmar manda solo la aceptada con su identidad de Garmin', async ({ page }) => {
    const mocks = await montarMocks(page)
    await irAGuiaGarmin(page)
    await subir(page, 'garmin.zip', await zipDeGarmin())
    await expect(page.getByRole('heading', { name: 'Revisar 2 rondas' })).toBeVisible({ timeout: 20_000 })

    await expect(page.getByText('Club de Golf Los Leones')).toBeVisible()
    await expect(page.getByText('Club de Golf La Dehesa')).toBeVisible()
    await expect(page.getByText('DATOS DE GARMIN')).toHaveCount(2)
    // Las stats de Garmin viven dentro de la tarjeta expandida ("Ver scorecard").
    const verScorecard = page.getByRole('button', { name: 'Ver scorecard' })
    await expect(verScorecard).toHaveCount(2)
    await verScorecard.first().click()
    await expect(page.getByText('Putts: 31 | Fairways: 9 | Penalties: 1', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Ver scorecard' }).first().click()
    await expect(page.getByText('Putts: 17', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Importar 2 rondas →' })).toBeVisible()

    // Descarta la de 9 hoyos (segunda tarjeta).
    await page.getByRole('button', { name: /Descartar/ }).nth(1).click()
    await expect(page.getByRole('button', { name: /Restaurar/ })).toHaveCount(1)
    const importar = page.getByRole('button', { name: 'Importar 1 ronda →' })
    await expect(importar).toBeVisible()
    await importar.click()

    await expect(page.getByRole('heading', { name: 'Tarjeta guardada' })).toBeVisible({ timeout: 20_000 })
    expect(mocks.confirmaciones).toHaveLength(1)
    const { job_id, rounds } = mocks.confirmaciones[0]
    expect(job_id).toBe(JOB_ID)
    expect(rounds.map(r => r.tempId)).toEqual(['garmin-e2e-1'])
    expect(rounds[0]).toMatchObject({
      course_id: RONDA_18.course_id,
      tee_color: 'blanco',
      total_gross: 84,
      holes_played: 18,
      scores: RONDA_18.scores,
      par_per_hole: RONDA_18.par_per_hole,
      course_rating: 71.2,
      slope_rating: 128,
      formato_juego: 'stroke_play',
      modo_juego: 'gross',
      metadata: { import_source: 'garmin_zip', garmin_scorecard_id: '987654321' },
    })
  })

  test('celebración cuenta importadas + actualizadas y dice cuál ya estaba', async ({ page }) => {
    await montarMocks(page, {
      confirm: { success: true, job_id: JOB_ID, total_imported: 1, total_updated: 1, total_errors: 0, total_duplicates: 0 },
    })
    await irAGuiaGarmin(page)
    await subir(page, 'garmin.zip', await zipDeGarmin())
    await page.getByRole('button', { name: 'Importar 2 rondas →' }).click()
    await expect(page.getByRole('heading', { name: '2 tarjetas guardadas' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('1 ya estaba y se actualizó.')).toBeVisible()
  })

  test('todo duplicado: no celebra, explica que ya estaban y sigue en la revisión', async ({ page }) => {
    await montarMocks(page, {
      confirm: { success: true, job_id: JOB_ID, total_imported: 0, total_errors: 0, total_duplicates: 2 },
    })
    await irAGuiaGarmin(page)
    await subir(page, 'garmin.zip', await zipDeGarmin())
    await page.getByRole('button', { name: 'Importar 2 rondas →' }).click()
    await expect(page.getByText('Estas tarjetas ya estaban en tu historial. No se guardó nada nuevo.')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: /tarjetas? guardadas?/i })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Revisar 2 rondas' })).toBeVisible()
  })

  const PUERTAS_DEL_NAVEGADOR: Array<{
    caso: string
    archivo: () => Promise<{ name: string; buffer: Buffer; mimeType?: string }>
    mensaje: string
    /** El filtro de extensión avisa antes de abrir el ZIP: no es una falla y no se reporta. */
    reporta: boolean
  }> = [
    {
      caso: 'el archivo no es .zip (el JSON suelto)',
      archivo: async () => ({ name: 'Golf-SCORECARD.json', buffer: Buffer.from(SCORECARD), mimeType: 'application/json' }),
      mensaje: 'Por favor selecciona un archivo ZIP de Garmin',
      reporta: false,
    },
    {
      caso: 'ZIP corrupto',
      archivo: async () => ({ name: 'garmin.zip', buffer: Buffer.from('esto no es un zip de verdad '.repeat(50)) }),
      mensaje: 'No se pudo leer el archivo ZIP. Verifica que sea el archivo correcto de Garmin.',
      reporta: true,
    },
    {
      caso: 'ZIP sin Golf-SCORECARD.json (solo el de RawData)',
      archivo: async () => ({ name: 'garmin.zip', buffer: await zipDeGarmin({ scorecard: null }) }),
      // La app hoy dice "envio" sin tilde (pendiente de copy); el test fija el texto real.
      mensaje: 'No se encontraron datos de golf en el archivo. Busca el archivo ZIP que te envio Garmin por email.',
      reporta: true,
    },
    {
      caso: 'tarjeta sobre el límite de subida',
      archivo: async () => ({ name: 'garmin.zip', buffer: await zipDeGarmin({ scorecard: JSON.stringify({ data: 'x'.repeat(LIMITE + 10) }) }) }),
      mensaje: MENSAJE_MUY_GRANDE,
      reporta: true,
    },
    {
      caso: 'tarjeta + canchas suman más que el límite (cada una por debajo)',
      archivo: async () => ({
        name: 'garmin.zip',
        buffer: await zipDeGarmin({
          scorecard: JSON.stringify({ data: 'x'.repeat(LIMITE - 1024 * 1024) }),
          course: JSON.stringify({ data: 'y'.repeat(1024 * 1024 + 10) }),
        }),
      }),
      mensaje: MENSAJE_MUY_GRANDE,
      reporta: true,
    },
  ]

  for (const { caso, archivo, mensaje, reporta } of PUERTAS_DEL_NAVEGADOR) {
    test(`navegador — ${caso}: avisa y no sube nada`, async ({ page }) => {
      const mocks = await montarMocks(page)
      await irAGuiaGarmin(page)
      const { name, buffer, mimeType } = await archivo()
      await subir(page, name, buffer, mimeType)
      await expect(page.getByText(mensaje, { exact: true })).toBeVisible({ timeout: 20_000 })
      expect(mocks.subidas).toHaveLength(0)
      if (reporta) await expect.poll(() => reportes).toContain('import.upload')
      else expect(reportes).toEqual([])
      // Sigue en la guía y se puede volver a elegir archivo.
      await expect(page.getByRole('button', { name: 'Seleccionar archivo ZIP' })).toBeVisible()
    })
  }

  const PUERTAS_DEL_SERVIDOR: Array<{ caso: string; responder: (route: Parameters<Parameters<Page['route']>[1]>[0]) => Promise<void>; mensaje: string }> = [
    {
      caso: '0 rondas en el archivo',
      responder: route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_id: JOB_ID, rounds: [] }) }),
      mensaje: 'No se encontraron rondas de golf en el archivo',
    },
    {
      caso: '413 de Vercel en texto plano',
      responder: route => route.fulfill({ status: 413, contentType: 'text/plain', body: 'Request Entity Too Large' }),
      mensaje: 'No pudimos procesar el archivo. Intenta de nuevo en unos segundos.',
    },
    {
      caso: 'error con mensaje propio',
      responder: route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Golf-SCORECARD.json no contiene datos válidos' }) }),
      mensaje: 'Golf-SCORECARD.json no contiene datos válidos',
    },
    {
      caso: 'sin red',
      responder: route => route.abort('internetdisconnected'),
      mensaje: 'No pudimos subir el archivo. Revisa tu conexión e intenta de nuevo.',
    },
  ]

  for (const { caso, responder, mensaje } of PUERTAS_DEL_SERVIDOR) {
    test(`servidor — ${caso}: lo dice con palabras y deja reintentar`, async ({ page }) => {
      let fallar = true
      const mocks = await montarMocks(page, {
        garmin: async route => {
          if (fallar) return responder(route)
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_id: JOB_ID, rounds: [RONDA_18] }) })
        },
      })
      await irAGuiaGarmin(page)
      const zip = await zipDeGarmin()
      await subir(page, 'garmin.zip', zip)
      await expect(page.getByText(mensaje, { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText(/Unexpected token|is not valid JSON/)).toHaveCount(0)
      await expect.poll(() => reportes).toContain('import.upload')

      // Reintento con el mismo archivo: ahora el servidor responde bien. (La app hoy dice "Revisar 1 rondas";
      // pendiente de copy: cuando se corrija, exigir "Revisar 1 ronda".)
      fallar = false
      await subir(page, 'garmin-reintento.zip', zip)
      await expect(page.getByRole('heading', { name: /^Revisar 1 rondas?$/ })).toBeVisible({ timeout: 20_000 })
      expect(mocks.subidas).toHaveLength(2)
    })
  }
})
