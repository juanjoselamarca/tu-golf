import { test, expect } from '@playwright/test'
import { adminClient, cleanupRondaFixture, getTestUserId, sinError } from './helpers/ronda-fixture'
import { marcarAvisoNoMolestarVisto } from './helpers/aviso-no-molestar'
import { crearScrambleDeClub, golpeDelEquipo, nombreDePerfil, tarjetaDeEquipo } from './helpers/scramble-club-fixture'

/**
 * Scramble con drives (Juanjo, 26-nov: «No deja avanzar»). Sin el drive del hoyo, «Siguiente» no pasa de hoyo ni
 * guarda el par gris: «Drive de» se destaca y lo pide. Marcado el drive, avanza como siempre.
 */
const rondas: string[] = []

test.afterAll(async () => {
  const errs: string[] = []
  for (const id of rondas) {
    try { await cleanupRondaFixture(id) } catch (e) { errs.push((e as Error).message) }
  }
  if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
})

test('scramble con drives: sin el drive del hoyo «Siguiente» no avanza; con el drive, sí', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))
  const testUserId = await getTestUserId()
  const nombre = await nombreDePerfil(testUserId)
  const { id, codigo } = await crearScrambleDeClub(page.request, { id: testUserId, nombre }, ['Los Cóndores', 'Las Águilas'], {
    'Los Cóndores': ['Ana', 'Beto', 'Caro', 'Dani'],
    'Las Águilas': ['Eva', 'Fito', 'Gabo', 'Hugo'],
  })
  rondas.push(id)

  await marcarAvisoNoMolestarVisto(page, codigo)
  await page.goto(`/ronda-libre/${codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })
  const tarjeta = tarjetaDeEquipo(page, 'Los Cóndores')
  await expect(tarjeta.getByRole('group', { name: 'Drive de' })).toBeVisible({ timeout: 20_000 })

  // Sin drive: Siguiente no guarda el hoyo ni avanza; el bloque lo pide.
  const siguiente = page.getByRole('button', { name: /^Siguiente/ })
  await siguiente.click()
  await expect(page.getByRole('alert').filter({ hasText: 'Marca de quién fue el drive para seguir' })).toBeVisible()
  await page.waitForTimeout(1500)
  expect(await golpeDelEquipo(id, 'Los Cóndores', 1), 'frenado: el par gris del hoyo 1 no se guarda').toBeNull()

  // Con el drive de Caro: el aviso se va y Siguiente avanza (guarda el hoyo 1).
  await tarjeta.getByRole('button', { name: 'Caro' }).click()
  await expect(tarjeta.getByRole('button', { name: 'Caro' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('alert').filter({ hasText: 'Marca de quién fue el drive' })).toHaveCount(0)
  await siguiente.click()
  await expect.poll(() => golpeDelEquipo(id, 'Los Cóndores', 1), { timeout: 15_000, message: 'hoyo 1 guardado al avanzar' }).not.toBeNull()
  await expect.poll(async () => {
    const fila = await sinError('drives', adminClient().from('ronda_equipos').select('drives').eq('ronda_id', id).eq('nombre', 'Los Cóndores').single())
    return (fila as { drives: Record<string, number> | null }).drives?.['1'] ?? null
  }, { timeout: 15_000, message: 'drive del hoyo 1 en el servidor' }).toBe(2)
  // Hoyo 2: ningún drive marcado todavía.
  await expect(tarjeta.getByRole('button', { name: 'Caro' })).toHaveAttribute('aria-pressed', 'false')
  expect(pageErrors).toEqual([])
})
