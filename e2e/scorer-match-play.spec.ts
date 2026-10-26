import { test, expect, type Page } from '@playwright/test'
import { adminClient, cleanupRondaFixture, createRondaFixture, getTestUserId, sinError } from './helpers/ronda-fixture'

/**
 * E2E del match play de ronda libre (2 jugadores, gross): el scorer y la vista de resultados con datos que se
 * pueden calcular a mano.
 *
 * Antes sólo había un test de "carga sin crash" (rondas-existentes.spec.ts). Lo que protege este spec:
 * - El "Conceder hoyo" del scorer llega a la base como -1 (CONCEDE) por el camino real de guardado y el hoyo cuenta
 *   como perdido en las dos vistas. El 01-oct-2026 un validador aplicado a prod rechazó el -1 y el botón dejó de
 *   funcionar sin que ningún test lo viera; antes de `scoresParaMatch` la vista en vivo mostraba "Pendiente".
 * - El estado del match hoyo a hoyo (quién gana, empate, "N UP") en la tarjeta del scorer.
 * - DORMIE y "N UP X con M por jugar" en el scorer y en la vista en vivo.
 * - Un match decidido 4&3 sigue diciendo 4&3 aunque se anoten los hoyos que ya no se jugaban (si el motor los
 *   contara, mostraría "1 UP" y el ganador podría cambiar).
 *
 * Los asserts no dependen de cuál de los dos es el jugador A: el motor nombra siempre al que va arriba.
 * Golpes fijos (4 contra 5) en vez del par: en gross el par no decide ningún hoyo.
 */

const ANA = 'Anita Prueba'
const BRUNO = 'Bruno Prueba'

test.describe.configure({ mode: 'serial' })

let testUserId: string
const creadas: string[] = []

test.beforeAll(async () => {
  testUserId = await getTestUserId()
})

test.afterAll(async () => {
  for (const id of creadas) await cleanupRondaFixture(id)
})

/** Golpes de los hoyos `desde..hasta` con el mismo valor. */
function hoyos(desde: number, hasta: number, golpes: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (let h = desde; h <= hasta; h++) out[String(h)] = golpes
  return out
}

/**
 * Ronda match play gross de 18 hoyos: Anita es el usuario de prueba (el scorer la reconoce y la elige sola) y
 * Bruno un invitado. Con `anaInvitada` Anita queda también como invitada: la vista de resultados de una ronda
 * finalizada no ofrece entonces guardar nada en el historial del usuario de prueba.
 */
async function crearMatch(opts: {
  ana: Record<string, number>
  bruno: Record<string, number>
  estado?: 'en_curso' | 'finalizada'
  anaInvitada?: boolean
}): Promise<{ id: string; codigo: string }> {
  const ronda = await createRondaFixture({
    creadorUserId: testUserId,
    creadorName: ANA,
    formato_juego: 'match_play',
    modo_juego: 'gross',
    scores: opts.ana,
  })
  creadas.push(ronda.id)
  const admin = adminClient()
  await sinError('insert Bruno', admin.from('ronda_libre_jugadores').insert({
    ronda_id: ronda.id, user_id: null, nombre: BRUNO, handicap: null, tees: 'blanco', scores: opts.bruno, is_guest: true,
  }))
  if (opts.anaInvitada) {
    await sinError('Anita invitada', admin.from('ronda_libre_jugadores').update({ user_id: null, is_guest: true }).eq('ronda_id', ronda.id).eq('nombre', ANA))
  }
  if (opts.estado === 'finalizada') {
    await sinError('finalizar', admin.from('rondas_libres').update({ estado: 'finalizada' }).eq('id', ronda.id))
  }
  return { id: ronda.id, codigo: ronda.codigo }
}

async function golpesDeAna(rondaId: string): Promise<Record<string, number>> {
  const fila = await sinError('scores de Anita', adminClient()
    .from('ronda_libre_jugadores').select('scores').eq('ronda_id', rondaId).eq('nombre', ANA).single())
  return (fila?.scores ?? {}) as Record<string, number>
}

function erroresDePagina(page: Page): string[] {
  const errores: string[] = []
  page.on('pageerror', e => errores.push(e.message))
  return errores
}

/** Abre el scorer y espera la tarjeta head-to-head (sólo existe con 2 jugadores en match play). */
async function abrirScorer(page: Page, codigo: string, hoyoEsperado: number) {
  await page.goto(`/ronda-libre/${codigo}/score`)
  expect(page.url()).not.toContain('/login')
  // El scorer elige solo al jugador del usuario: no debe aparecer el selector de jugadores.
  await expect(page.getByRole('button', { name: 'Aumentar score' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(`HOYO ${hoyoEsperado}`, { exact: true })).toBeVisible()
  await expect(page.getByText('VS', { exact: true })).toBeVisible()
}

test.describe('Match play ronda libre — scorer', () => {
  test('la tarjeta del hoyo dice quién lo ganó y cómo va el match', async ({ page }) => {
    const errores = erroresDePagina(page)
    // Hoyo 1: Anita 4-5 (gana). Hoyo 2: 4-4 (empate). Hoyo 3: 4-5 (gana) → Anita 2 UP tras 3.
    const { codigo } = await crearMatch({ ana: hoyos(1, 3, 4), bruno: { 1: 5, 2: 4, 3: 5 } })

    // Primer hoyo sin anotar de Anita: el 4. Todavía sin resultado, con el estado acumulado.
    await abrirScorer(page, codigo, 4)
    await expect(page.getByText(`${ANA} 2 UP`)).toBeVisible()
    await expect(page.getByText('Pendiente')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Conceder hoyo' })).toBeEnabled()

    await page.getByRole('button', { name: 'Hoyo anterior' }).click()
    await expect(page.getByText(`${ANA} gana`)).toBeVisible()
    await expect(page.getByText(`${ANA} 2 UP`)).toBeVisible()

    await page.getByRole('button', { name: 'Hoyo anterior' }).click()
    await expect(page.getByText('Empate', { exact: true })).toBeVisible()
    await expect(page.getByText(`${ANA} 1 UP`)).toBeVisible()

    await page.getByRole('button', { name: 'Hoyo anterior' }).click()
    await expect(page.getByText(`${ANA} gana`)).toBeVisible()
    await expect(page.getByText(`${ANA} 1 UP`)).toBeVisible()

    expect(errores).toEqual([])
  })

  test('Conceder hoyo guarda -1 en la base, el hoyo cuenta para el rival y sobrevive a la recarga', async ({ page }) => {
    const errores = erroresDePagina(page)
    const { id, codigo } = await crearMatch({ ana: hoyos(1, 3, 4), bruno: { 1: 5, 2: 4, 3: 5 } })

    await abrirScorer(page, codigo, 4)
    await page.getByRole('button', { name: 'Conceder hoyo' }).click()

    // En la tarjeta: Anita concede, Bruno se lleva el hoyo y el match baja de 2 UP a 1 UP.
    await expect(page.getByRole('button', { name: 'Hoyo concedido' })).toBeDisabled()
    await expect(page.getByText(`${ANA} concede`)).toBeVisible()
    await expect(page.getByText(`${ANA} 1 UP`)).toBeVisible()

    // Pasar de hoyo dispara el guardado real (useScoreSave → API). El -1 tiene que llegar tal cual.
    await page.getByRole('button', { name: 'Siguiente hoyo' }).click()
    await expect.poll(async () => (await golpesDeAna(id))['4'], { timeout: 15_000 }).toBe(-1)
    const guardados = await golpesDeAna(id)
    expect(guardados).toMatchObject({ 1: 4, 2: 4, 3: 4, 4: -1 })

    // Recarga: el scorer abre en el 5 (el 4 ya tiene dato) y el 4 sigue concedido.
    await abrirScorer(page, codigo, 5)
    await page.getByRole('button', { name: 'Hoyo anterior' }).click()
    await expect(page.getByRole('button', { name: 'Hoyo concedido' })).toBeDisabled()
    await expect(page.getByText(`${ANA} concede`)).toBeVisible()

    // Vista en vivo: el concedido cuenta como jugado y perdido (no "Pendiente").
    await page.goto(`/ronda-libre/${codigo}`)
    await expect(page.getByText('1 UP Anita con 14 por jugar')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('4 de 18 hoyos jugados')).toBeVisible()

    expect(errores).toEqual([])
  })

  test('DORMIE: 3 arriba con 3 por jugar, en el scorer y en la vista en vivo', async ({ page }) => {
    const errores = erroresDePagina(page)
    // Anita gana del 1 al 3 y empatan del 4 al 15.
    const { codigo } = await crearMatch({ ana: hoyos(1, 15, 4), bruno: { ...hoyos(1, 3, 5), ...hoyos(4, 15, 4) } })

    await abrirScorer(page, codigo, 16)
    await expect(page.getByText(`${ANA} 3 UP`)).toBeVisible()
    await expect(page.getByText('DORMIE', { exact: true })).toBeVisible()

    await page.goto(`/ronda-libre/${codigo}`)
    await expect(page.getByText('3 UP Anita con 3 por jugar')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('15 de 18 hoyos jugados')).toBeVisible()
    await expect(page.getByText('DORMIE', { exact: true })).toBeVisible()
    await expect(page.getByText('Marcador en vivo')).toBeVisible()

    expect(errores).toEqual([])
  })
})

test.describe('Match play ronda libre — resultado final', () => {
  test('4&3: ganador, resultado y conteo de hoyos, aunque se anoten los hoyos que ya no se jugaban', async ({ page }) => {
    const errores = erroresDePagina(page)
    // Anita gana del 1 al 4 y empatan del 5 al 15: 4 arriba con 3 por jugar → 4&3 tras el 15.
    // Del 16 al 18 Bruno gana los tres (3 contra 5): si contaran, quedaría "1 UP".
    const { codigo } = await crearMatch({
      ana: { ...hoyos(1, 15, 4), ...hoyos(16, 18, 5) },
      bruno: { ...hoyos(1, 4, 5), ...hoyos(5, 15, 4), ...hoyos(16, 18, 3) },
      estado: 'finalizada',
      anaInvitada: true,
    })

    await page.goto(`/ronda-libre/${codigo}`)
    await expect(page.getByText('Resultado final')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Match Play Gross')).toBeVisible()
    await expect(page.getByText('Ganador', { exact: true })).toBeVisible()
    await expect(page.getByText(ANA, { exact: true }).first()).toBeVisible()
    await expect(page.getByText('4&3', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('1 UP', { exact: true })).toHaveCount(0)
    await expect(page.getByText(`${ANA} gana`)).toBeVisible()
    await expect(page.getByText('DORMIE', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Compartir resultado' })).toBeVisible()

    // Conteo: 4 ganados por Anita, 11 empates, 0 de Bruno; los hoyos 16-18 no entran.
    const conteo = await page.locator('div', { has: page.getByText('Empates', { exact: true }) })
      .filter({ has: page.getByText('Ganados', { exact: true }) }).last().innerText()
    const numeros = conteo.split(/\s+/).filter(t => /^\d+$/.test(t)).map(Number)
    expect(numeros.slice().sort((a, b) => a - b)).toEqual([0, 4, 11])
    expect(numeros[1], 'el del medio son los empates').toBe(11)

    expect(errores).toEqual([])
  })
})
