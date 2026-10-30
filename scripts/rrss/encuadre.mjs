// Dónde cae cada cosa dentro del cuadro de 9:16.
//
// Vive acá y no dentro de un guion porque la zona que tapa Instagram es la
// misma para todas las piezas: si un guion se la calcula a su manera, la pieza
// siguiente sale con el gancho debajo del rótulo "Reels" y nadie lo nota hasta
// verla en el teléfono.
import { MEDIDA, ZONA_SEGURA_STORY } from './marca.mjs'

/**
 * La zona segura de la guía (sección 5), traducida a px de CSS del teléfono de
 * la toma.
 *
 * `ZONA_SEGURA_STORY` está en px del lienzo (1080x1920) y los guiones scrollean
 * en px de CSS: la escala se deriva del viewport real en vez de quedar escrita
 * acá, así que cambiar la medida del formato o la escala de la captura mueve
 * los encuadres solos.
 */
export function zonaSegura(page) {
  const { width, height } = page.viewportSize()
  const escala = MEDIDA.story.ancho / width
  return {
    arriba: Math.round(ZONA_SEGURA_STORY.arribaPx / escala),
    abajo: height - Math.round(ZONA_SEGURA_STORY.abajoPx / escala),
  }
}

/**
 * Deja un elemento pegado al borde de ARRIBA de la zona segura.
 *
 * Es el encuadre por defecto de una pieza: lo que la pieza viene a mostrar
 * arranca lo más alto posible sin meterse debajo de la barra de estado y del
 * rótulo "Reels", y sin gastar en blanco la mitad del cuadro.
 *
 * El scroll es instantáneo a propósito: el movimiento que se graba tiene que
 * ser el del dedo, no el del encuadre. Un scroll animado entre planos se lee
 * como que la pieza se está acomodando sola.
 */
export async function encuadrarArriba(page, locator, { nombre = 'el elemento' } = {}) {
  const seguro = zonaSegura(page)
  const caja = await locator.boundingBox()
  if (!caja) throw new Error(`${nombre} no está en pantalla: no se puede encuadrar`)
  await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'instant' }), caja.y - seguro.arriba)
  await page.waitForTimeout(350)
  return seguro
}
