import { test, expect } from '@playwright/test'
import { recorrido } from '../helpers/consejo-captura'
import { esperarEditorDeBorrador } from '../helpers/organizador-editor'

/**
 * Recorrido del consejo: organizar un torneo desde cero (/organizador/nuevo). Pasos tomados de
 * e2e/organizar-campeonato-flow.spec.ts. Deja un borrador en la base de pruebas (igual que ese spec) y NO toca
 * "Crear torneo". El editor es una sola página larga: se captura por secciones y entera.
 */
const SECCIONES: Array<[string, RegExp]> = [
  ['Cómo juegan', /Cómo juegan/i],
  ['Categorías', /Categorías/i],
  ['Rondas', /Rondas/i],
]

test('crear torneo: un campeonato de club desde cero', async ({ page }) => {
  const r = recorrido(page, 'crear-torneo', 'Organizar el campeonato del club de un sábado: 18 hoyos, stroke play, con categorías por hándicap')

  await page.goto('/organizador/nuevo', { waitUntil: 'domcontentloaded' })
  expect(page.url()).not.toContain('/login')
  await expect(page.getByText(/¿Por dónde empezamos\?/i)).toBeVisible()
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
