import { test, expect } from '@playwright/test'
import { recorrido } from '../helpers/consejo-captura'

/**
 * Recorrido del consejo: crear una ronda con un amigo (/ronda-libre/nueva). Pasos y selectores tomados de
 * e2e/scorer-nueva-wizard.spec.ts. Llega a "Confirmar ronda" y NO toca "Crear ronda".
 */
test('nueva ronda: jugar con un amigo en Los Leones', async ({ page }) => {
  const r = recorrido(page, 'nueva-ronda', 'Anotar una ronda de hoy en Los Leones con un amigo, stroke play')
  const subtitulo = (texto: RegExp) => page.locator('p', { hasText: texto })

  await page.goto('/ronda-libre/nueva', { waitUntil: 'domcontentloaded' })
  expect(page.url()).not.toContain('/login')
  await r.pantalla('Cancha', 'Elegir dónde juegas hoy')

  const siguiente = page.getByRole('button', { name: /siguiente/i })
  if (await siguiente.isDisabled()) {
    await r.escribir(page.getByLabel('Buscar cancha'), 'Leones', 'Buscar cancha')
    const club = page.locator('div[style*="min-height: 60px"]', { hasText: /leones/i }).first()
    await expect(club).toBeVisible()
    await r.tocar(club, 'Los Leones')
    if (await siguiente.isDisabled()) {
      await r.tocar(page.locator('div[style*="min-height: 56px"]', { hasText: /leones/i }).first(), 'recorrido de Los Leones')
    }
  }
  await r.tocar(siguiente, 'Siguiente')
  await expect(subtitulo(/cómo quieres jugar/i)).toBeVisible()
  await r.pantalla('Formato', 'Elegir stroke play')

  await r.tocar(page.getByRole('button', { name: /^stroke play\b/i }).first(), 'Stroke Play')
  await r.tocar(page.getByRole('button', { name: /siguiente/i }), 'Siguiente')
  await expect(subtitulo(/con quién juegas/i)).toBeVisible()
  await r.pantalla('Jugadores', 'Dejar listo mi índice y seguir')

  // Por defecto queda «Cada uno en su celular»: no se agregan jugadores acá, el amigo entra después con el enlace.
  // Lo que sí pide es el índice propio (la cuenta de pruebas no tiene, como una cuenta nueva).
  const indice = page.getByRole('textbox', { name: 'Índice' })
  if ((await indice.count()) && !(await indice.inputValue())) await r.escribir(indice, '18', 'Índice')
  await r.tocar(page.getByRole('button', { name: /siguiente/i }), 'Siguiente')
  await expect(page.getByText(/confirmar ronda/i).first()).toBeVisible()
  await r.pantalla('Confirmar', 'Revisar y crear la ronda')

  console.log(`recorrido guardado en ${r.guardar()}`)
})
