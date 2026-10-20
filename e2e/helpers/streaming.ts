import { expect, type Page } from '@playwright/test'

/**
 * Espera a que llegue todo el HTML y React mueva a su lugar cada segmento streameado. Mientras un segmento sigue en
 * `<div hidden id="S:n">`, su contenido puede estar dos veces en el DOM (la copia oculta y la ya movida) y un
 * localizador por texto o CSS da strict mode violation.
 */
export async function esperarStreaming(page: Page): Promise<void> {
  await page.waitForLoadState('load')
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0)
}
