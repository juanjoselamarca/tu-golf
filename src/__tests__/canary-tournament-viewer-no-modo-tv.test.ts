/**
 * TEST CANARIO — el viewer público /torneo/[slug] NO muestra "Modo TV"
 *
 * Inbox 35f4ee89 (27-may-2026): Juanjo pidió remover el botón "Modo TV"
 * del header del viewer público. La ruta /torneo/[slug]/tv sigue
 * accesible vía URL directa para casting (no se borró), pero el header
 * del viewer no debe ofrecer el botón al jugador final.
 *
 * Este canario evita que vuelva a aparecer en un refactor accidental
 * del header.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const VIEWER = path.resolve(__dirname, '../app/torneo/[slug]/page.tsx')

describe('Viewer público /torneo/[slug]', () => {
  const content = fs.readFileSync(VIEWER, 'utf8')

  it('no renderiza el botón "Modo TV" en el header público (inbox 35f4ee89)', () => {
    // Acepta solo menciones en comentarios; bloquea cualquier JSX visible.
    // Patrón visible: `>\s*Modo TV\s*<` o `>Modo TV</` (JSX text node).
    const jsxTextPattern = />\s*Modo TV\s*</
    expect(
      jsxTextPattern.test(content),
      'src/app/torneo/[slug]/page.tsx NO debe renderizar el texto "Modo TV" como contenido JSX. Si querés exponer un acceso a /tv, hacelo en /organizador/[slug] (dashboard del owner), no en el viewer público (decisión Juanjo inbox 35f4ee89).',
    ).toBe(false)
  })
})
