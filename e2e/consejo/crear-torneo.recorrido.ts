import { test, expect } from '@playwright/test'
import { recorrido } from '../helpers/consejo-captura'
import { esperarEditorDeBorrador } from '../helpers/organizador-editor'
import { adminClient, getTestUserId, sinError } from '../helpers/ronda-fixture'

/**
 * Recorrido del consejo: organizar un torneo desde cero (/organizador/nuevo). Pasos tomados de
 * e2e/organizar-campeonato-flow.spec.ts. NO toca "Crear torneo". El editor es una sola página larga: se captura
 * por secciones y entera.
 *
 * «Por dónde empezamos» lista los borradores del usuario: para medir lo que ve un organizador nuevo (y no una
 * lista que crece con cada corrida), antes y después se borran los borradores sueltos del usuario de pruebas
 * en la base de pruebas (los que no quedaron ligados a un torneo).
 */
const MEDIA_HORA = 30 * 60_000
const inicio = new Date().toISOString()

/**
 * Borradores sueltos (sin torneo ligado) del usuario de pruebas. `antesDe` / `desde` acotan por fecha para no
 * pisar un borrador que otro spec esté usando en paralelo sobre la misma base de pruebas.
 */
async function borrarBorradoresSueltos(filtro: { antesDe?: string; desde?: string }) {
  const owner = await getTestUserId()
  let q = adminClient().from('tournament_drafts').delete()
    .eq('owner_id', owner).is('tournament_id', null).is('pending_tournament_id', null)
  if (filtro.antesDe) q = q.lt('updated_at', filtro.antesDe)
  if (filtro.desde) q = q.gte('created_at', filtro.desde)
  await sinError('delete tournament_drafts', q)
}

// Antes: solo los abandonados hace más de media hora. Después: solo los que nacieron en esta corrida.
test.beforeAll(() => borrarBorradoresSueltos({ antesDe: new Date(Date.now() - MEDIA_HORA).toISOString() }))
test.afterAll(() => borrarBorradoresSueltos({ desde: inicio }))
const SECCIONES: Array<[string, RegExp]> = [
  ['Cómo juegan', /Cómo juegan/i],
  ['Categorías', /Categorías/i],
  ['Rondas', /Rondas/i],
]

test('crear torneo: un campeonato de club desde cero', async ({ page }) => {
  const r = recorrido(page, 'crear-torneo', 'Organizar el campeonato del club de un sábado: 18 hoyos, stroke play, con categorías por hándicap')

  await page.goto('/organizador/nuevo', { waitUntil: 'domcontentloaded' })
  expect(page.url()).not.toContain('/login')
  await expect(page.getByText(/¿Por dónde empezamos\?/i).first()).toBeVisible()
  await r.pantalla('Por dónde empezamos', 'Empezar un torneo nuevo')

  await r.tocar(page.getByRole('button', { name: /Empezar desde cero/i }), 'Empezar desde cero')
  await esperarEditorDeBorrador(page)
  await r.pantalla('Editor del torneo', 'Completar los datos del torneo hasta poder crearlo')

  for (const [nombre, titulo] of SECCIONES) {
    await page.getByRole('heading', { name: titulo }).first().scrollIntoViewIfNeeded()
    await r.pantalla(`Editor: ${nombre}`, 'Seguir completando el torneo')
  }
  await page.getByRole('button', { name: /Crear torneo/i }).scrollIntoViewIfNeeded()
  await r.pantalla('Editor: botón Crear torneo', 'Entender qué falta para poder crear el torneo')

  console.log(`recorrido guardado en ${r.guardar()}`)
})
