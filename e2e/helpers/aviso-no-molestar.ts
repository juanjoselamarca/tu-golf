import type { Page } from '@playwright/test'
import { CLAVE_STORAGE_AVISO_NO_MOLESTAR, claveAvisoRondaLibre } from '../../src/hooks/ronda/useAvisoNoMolestar'

/**
 * Deja el aviso de cancha "Activa No molestar" como YA VISTO para una ronda libre, antes de abrir su scorer.
 *
 * Desde #654 los tres scorers de jugador muestran ese aviso 400 ms después de quedar listos para anotar, como hoja
 * modal (backdrop + aria-modal) una vez por ronda y teléfono. Un test que abre el scorer y empieza a tocar "+" o
 * "Siguiente hoyo" se encuentra con la hoja encima: Playwright reintenta el click hasta agotar el timeout. Así se
 * pusieron en rojo 5 specs del scorer en la corrida semanal del 01-nov-2026.
 *
 * Se escribe en localStorage exactamente lo que el hook deja escrito cuando el jugador ya tocó "Ahora no" en esta
 * ronda (misma clave y mismo formato, importados de la fuente única): el scorer no cambia en nada más. La hoja en
 * sí se prueba aparte, en `ronda-scoring.spec.ts` ("el aviso Activa No molestar sale una vez y 'Ahora no' lo
 * cierra"), para que esta marca nunca tape una regresión del aviso.
 *
 * Llamar ANTES del `page.goto` del scorer (`/score` o `/score-grupo`); vale para todas las navegaciones siguientes
 * de la misma página.
 */
export async function marcarAvisoNoMolestarVisto(page: Page, codigo: string): Promise<void> {
  const clave = claveAvisoRondaLibre(codigo)
  if (!clave) throw new Error('marcarAvisoNoMolestarVisto: la ronda no tiene código')
  await page.addInitScript(
    ({ claveStorage, clave }) => {
      try {
        const crudo = localStorage.getItem(claveStorage)
        const lista: unknown = crudo ? JSON.parse(crudo) : []
        const vistas = Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
        if (!vistas.includes(clave)) localStorage.setItem(claveStorage, JSON.stringify([...vistas, clave]))
      } catch {
        // Sin storage el hook tampoco muestra el aviso: el scorer sigue igual.
      }
    },
    { claveStorage: CLAVE_STORAGE_AVISO_NO_MOLESTAR, clave },
  )
}

/** La hoja del aviso tal como la ve el jugador: diálogo modal con el título "Activa No molestar". */
export function hojaAvisoNoMolestar(page: Page) {
  return page.getByRole('dialog').filter({ hasText: 'No molestar' })
}
