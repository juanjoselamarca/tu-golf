import { test, expect, type Page, type Request } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIMITE_CUERPO_SUBIDA_BYTES } from '../src/lib/red/limite-cuerpo'
import { MENSAJES_SUBIDA_FOTOS } from '../src/lib/import/subir-fotos'
import { ERROR_IMPORT_IA_NO_DISPONIBLE } from '../src/lib/import-types'

/**
 * E2E: importar por fotos con pantallazos pesados (protege el fix P0 #572).
 *
 * Bug reproducido en prod el 16-oct: con 2 fotos del celular (3 MB c/u) el request
 * pasaba los 4,5 MB de Vercel, que responde 413 en TEXTO PLANO; el wizard hacía
 * res.json() y el jugador veía `Unexpected token 'R', "Request En"... is not valid JSON`.
 *
 * El fix comprime cada foto en el navegador (canvas, 2048 px, JPEG) y arma lotes bajo
 * LIMITE_CUERPO_SUBIDA_BYTES. Eso solo se puede probar en un navegador real: los tests
 * unitarios inyectan `comprimir`, acá corre el canvas de verdad.
 *
 * /api/import/screenshot está mockeado: no se llama a Gemini ni se crean import_jobs
 * en prod. Lo que se mide es lo que el CLIENTE manda y lo que el jugador VE.
 */

// ── PNG de ruido aleatorio (no comprime: se comporta como una foto real) ──────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(tipo: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([len, cuerpo, crc])
}

/** PNG RGB de `lado`×`lado` px con ruido: pesa ~3 bytes/px (como una foto sin comprimir). */
function pngDeRuido(lado: number, semilla: number): Buffer {
  const fila = 1 + lado * 3
  const raw = Buffer.alloc(fila * lado)
  let x = semilla >>> 0 || 1
  for (let y = 0; y < lado; y++) {
    raw[y * fila] = 0 // filtro "None"
    for (let i = 1; i < fila; i++) {
      // xorshift32: determinista, rápido y sin patrón que el deflate aproveche
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5
      raw[y * fila + i] = x & 0xff
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(lado, 0)
  ihdr.writeUInt32BE(lado, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// 2600 px por lado → ~20 MB por foto: más pesada que cualquier foto de celular y
// varias veces el límite de Vercel. Comprimida a 2048 px JPEG queda en ~1-3 MB.
const LADO_FOTO = 2600
// Van a disco: Playwright no acepta más de 50 MB de buffers en un setInputFiles.
let dirFotos = ''
let FOTOS: string[] = []
let pesoOriginal = 0
/** Escrituras de captureError() a error_logs interceptadas en el test actual. */
let erroresBloqueados = 0

/** Límite real de Vercel para el cuerpo de una función (el del código deja margen). */
const LIMITE_VERCEL_BYTES = 4.5 * 1024 * 1024

// ── Mocks ─────────────────────────────────────────────────────────────────────────

function rondaMock(n: number) {
  const scores = [5, 4, 4, 5, 4, 3, 5, 5, 6, 5, 3, 5, 5, 4, 5, 4, 6, 5]
  return {
    tempId: `temp-e2e-lote-${n}`,
    course_name: `Cancha Lote E2E ${n}`,
    played_at: `2026-09-0${n}`,
    scores: Object.fromEntries(scores.map((s, i) => [String(i + 1), s])),
    par_per_hole: Object.fromEntries(scores.map((_, i) => [String(i + 1), 4])),
    total_gross: scores.reduce((a, b) => a + b, 0),
    holes_played: 18,
    import_confidence: 0.95,
    validation: { valid: true, warnings: [] },
    course_rating: null,
    slope_rating: null,
    metadata: { ambiguous_holes: [] },
  }
}

interface ArchivoEnviado { nombre: string; tipo: string }

/** Lee los archivos `images` de un multipart sin depender de un parser externo. */
function archivosDelMultipart(req: Request): ArchivoEnviado[] {
  const cuerpo = req.postDataBuffer()?.toString('latin1') ?? ''
  const out: ArchivoEnviado[] = []
  const re = /Content-Disposition: form-data; name="images"; filename="([^"]+)"\r\nContent-Type: ([^\r\n]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cuerpo))) out.push({ nombre: m[1], tipo: m[2] })
  return out
}

async function irAGuiaDeFotos(page: Page) {
  await page.goto('/importar?source=photos', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Pantallazo de scorecard').first()).toBeVisible({ timeout: 20_000 })
}

function inputDeFotos(page: Page) {
  return page.locator('input[type="file"][accept*=".jpg"]').first()
}

/** Ningún mensaje técnico de parseo puede llegar al jugador (el bug original). */
async function sinErrorTecnico(page: Page) {
  const cuerpo = await page.locator('body').innerText()
  expect(cuerpo).not.toMatch(/Unexpected token|is not valid JSON|SyntaxError|Request Entity/i)
}

test.describe('Importar por fotos — fotos pesadas en lotes bajo el límite de Vercel (#572)', () => {
  test.beforeAll(() => {
    pesoOriginal = 0
    dirFotos = mkdtempSync(join(tmpdir(), 'e2e-fotos-'))
    FOTOS = [1, 2, 3].map(n => {
      const buf = pngDeRuido(LADO_FOTO, 0x9e3779b9 * n)
      pesoOriginal += buf.length
      const ruta = join(dirFotos, `IMG_000${n}.png`)
      writeFileSync(ruta, buf)
      return ruta
    })
  })
  test.afterAll(() => {
    if (dirFotos) rmSync(dirFotos, { recursive: true, force: true })
  })

  test.beforeEach(async ({ page }) => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
    // Los casos de error pasan por captureError(), que escribe en error_logs de prod y
    // manda la excepción a PostHog: sin esto cada corrida dejaría "errores de usuario"
    // falsos que otro agente leería como un bug real.
    erroresBloqueados = 0
    await page.route(/\/rest\/v1\/error_logs/, route => {
      erroresBloqueados++
      return route.fulfill({ status: 201, body: '' })
    })
    await page.route(/posthog\.com/, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  })

  test('3 fotos de ~20 MB: se comprimen en el navegador, ningún request pasa el límite y la revisión trae las rondas de todos los lotes', async ({ page }) => {
    test.setTimeout(120_000)
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    const requests: Array<{ bytes: number; archivos: ArchivoEnviado[] }> = []
    let fotosVistas = 0
    await page.route('**/api/import/screenshot', async route => {
      const req = route.request()
      const archivos = archivosDelMultipart(req)
      requests.push({ bytes: req.postDataBuffer()?.length ?? 0, archivos })
      // Una ronda por foto recibida, numeradas en el orden en que llegan.
      const rounds = archivos.map(() => rondaMock(++fotosVistas))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job_id: `job-e2e-lote-${requests.length}`, rounds, errors: [] }),
      })
    })

    await irAGuiaDeFotos(page)
    expect(pesoOriginal, 'las fotos de prueba deben pasar holgadamente el límite').toBeGreaterThan(3 * LIMITE_VERCEL_BYTES)

    await inputDeFotos(page).setInputFiles(FOTOS)

    await expect(page.getByText('Revisar 3 rondas')).toBeVisible({ timeout: 60_000 })

    // Lo que el cliente mandó: todas las fotos, comprimidas a JPEG, en lotes bajo el límite.
    expect(requests.length, '3 fotos comprimidas no caben en un request: debe haber lotes').toBeGreaterThanOrEqual(2)
    const enviados = requests.flatMap(r => r.archivos)
    expect(enviados.map(a => a.nombre)).toEqual(['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0003.jpg'])
    for (const a of enviados) expect(a.tipo).toBe('image/jpeg')
    for (const r of requests) {
      expect(r.bytes, 'un request no puede pasar el límite de Vercel (413 en texto plano)').toBeLessThan(LIMITE_VERCEL_BYTES)
      // Margen del multipart: el código deja 0,5 MB sobre LIMITE_CUERPO_SUBIDA_BYTES.
      expect(r.bytes).toBeLessThan(LIMITE_CUERPO_SUBIDA_BYTES + 64 * 1024)
    }
    // Compresión real: lo subido pesa una fracción de lo elegido.
    const totalSubido = requests.reduce((a, r) => a + r.bytes, 0)
    test.info().annotations.push({
      type: 'lotes',
      description: `${requests.length} request(s): ${requests.map(r => `${r.archivos.length} foto(s) ${(r.bytes / 1048576).toFixed(2)} MB`).join(' · ')} — original ${(pesoOriginal / 1048576).toFixed(1)} MB`,
    })
    expect(totalSubido).toBeLessThan(pesoOriginal / 4)

    // Las rondas de TODOS los lotes llegan a la revisión, en orden.
    for (const n of [1, 2, 3]) {
      await expect(page.getByText(`Cancha Lote E2E ${n}`).first()).toBeVisible()
    }
    await expect(page.getByRole('button', { name: /Importar 3 rondas/ })).toBeVisible()
    await sinErrorTecnico(page)
    expect(pageErrors).toEqual([])
  })

  test('413 en texto plano (Vercel corta el request): el jugador ve un mensaje en español, no "Unexpected token"', async ({ page }) => {
    await page.route('**/api/import/screenshot', route =>
      route.fulfill({ status: 413, contentType: 'text/plain', body: 'Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE' }),
    )
    await irAGuiaDeFotos(page)
    await inputDeFotos(page).setInputFiles([FOTOS[0]])

    await expect(page.getByText(MENSAJES_SUBIDA_FOTOS.respuestaIlegible)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/^Revisar \d+ rondas?$/)).toHaveCount(0)
    await sinErrorTecnico(page)
    // El error se reporta (captureError) pero NO llega a la base de prod.
    await expect.poll(() => erroresBloqueados, { timeout: 10_000 }).toBeGreaterThanOrEqual(1)
    // El jugador puede reintentar: el input sigue disponible.
    await expect(inputDeFotos(page)).toBeAttached()
  })

  test('falla el 2º lote (429): no se muestra un resultado parcial como si fuera completo', async ({ page }) => {
    test.setTimeout(120_000)
    const MENSAJE_429 = 'Llegaste al límite de lecturas por hora. Intenta en un rato.'
    let llamadas = 0
    let fotosDelPrimerLote = 0
    await page.route('**/api/import/screenshot', async route => {
      llamadas++
      if (llamadas === 1) {
        const archivos = archivosDelMultipart(route.request())
        fotosDelPrimerLote = archivos.length
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ job_id: 'job-e2e-parcial', rounds: archivos.map((_, i) => rondaMock(i + 1)), errors: [] }),
        })
        return
      }
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: MENSAJE_429 }) })
    })

    await irAGuiaDeFotos(page)
    await inputDeFotos(page).setInputFiles(FOTOS)

    await expect(page.getByText(MENSAJE_429)).toBeVisible({ timeout: 60_000 })
    // Si las 3 fotos comprimidas cupieran en un solo lote, este caso no se ejercita:
    // fallar en vez de pasar en vacío.
    expect(llamadas, 'las 3 fotos deben repartirse en 2+ lotes').toBeGreaterThanOrEqual(2)
    expect(fotosDelPrimerLote).toBeLessThan(FOTOS.length)
    await expect(page.getByText(/^Revisar \d+ rondas?$/)).toHaveCount(0)
    await expect(page.getByText('Cancha Lote E2E 1')).toHaveCount(0)
    await sinErrorTecnico(page)
  })

  test('el servicio de lectura no está disponible: mensaje para el jugador, no el error crudo de Gemini', async ({ page }) => {
    await page.route('**/api/import/screenshot', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job_id: 'job-e2e-ia', rounds: [], errors: [{ index: 0, error: ERROR_IMPORT_IA_NO_DISPONIBLE }] }),
      }),
    )
    await irAGuiaDeFotos(page)
    await inputDeFotos(page).setInputFiles([FOTOS[0]])

    await expect(page.getByText(/Error conectando con el servicio de lectura de fotos/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(ERROR_IMPORT_IA_NO_DISPONIBLE)).toHaveCount(0)
    await sinErrorTecnico(page)
  })

  // Dead-end hunter 17/18-oct: con una foto que no era tarjeta, la revisión mostraba las
  // demás rondas sin decir nada y el jugador confirmaba creyendo que había importado todo.
  test('1 de 3 fotos no es tarjeta: la revisión dice cuál y el aviso no queda tapado por el overlay', async ({ page }) => {
    test.setTimeout(120_000)
    let n = 0
    await page.route('**/api/import/screenshot', async route => {
      const archivos = archivosDelMultipart(route.request())
      const rounds: ReturnType<typeof rondaMock>[] = []
      const errors: Array<{ index: number; error: string }> = []
      archivos.forEach((a, i) => {
        if (a.nombre === 'IMG_0002.jpg') errors.push({ index: i, error: 'not_a_scorecard' })
        else rounds.push(rondaMock(++n))
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job_id: 'job-e2e-aviso', rounds, errors }),
      })
    })

    await irAGuiaDeFotos(page)
    await inputDeFotos(page).setInputFiles(FOTOS)

    await expect(page.getByText('Revisar 2 rondas')).toBeVisible({ timeout: 60_000 })
    const aviso = page.getByRole('alert').filter({ hasText: 'No importamos la foto 2 de 3' })
    await expect(aviso).toHaveText(/no parece una tarjeta de Garmin Golf/)
    // toBeVisible no detecta que otro elemento lo tape: se mira qué hay en su centro.
    const encima = await aviso.evaluate(el => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return top === el || el.contains(top)
    })
    expect(encima, 'el aviso debe verse, no quedar debajo de la pantalla de revisión').toBe(true)
    await sinErrorTecnico(page)
  })
})
