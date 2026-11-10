import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Bar } from './Shimmer'
import { CompetenciaSkeleton } from './CompetenciaSkeleton'
import { IdentidadSkeleton } from './IdentidadSkeleton'

// Regresión del 09-nov-2026: los skeletons del dashboard (Mi Golf) tenían grises
// claros escritos a mano (#f0f0ee, #e6e6e3, #ececec). En modo oscuro parpadeaban
// barras y bordes blancos sobre el navy mientras cargaba la sección. Todo color
// de un skeleton sale de tokens theme-aware (DESIGN.md §3, jurisprudencia P2).

function estilosInline(root: HTMLElement): string[] {
  return [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
    .map((el) => el.getAttribute('style') ?? '')
    .filter(Boolean)
}

// jsdom normaliza "#ececec" a "rgb(236, 236, 236)" en el atributo style: un color
// escrito a mano aparece como hex o como rgb(); un token queda como var(--…).
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(/i

describe('skeletons de Mi Golf · colores theme-aware', () => {
  it('la barra del shimmer se pinta con --surface-soft / --surface-border, sin hex', () => {
    const { container } = render(<Bar width="50%" height={14} />)
    const bar = container.firstElementChild as HTMLElement
    const bg = bar.style.background || bar.style.backgroundImage
    expect(bg).toContain('var(--surface-soft)')
    expect(bg).toContain('var(--surface-border)')
    expect(bg).not.toMatch(COLOR_LITERAL)
  })

  it.each([
    ['CompetenciaSkeleton', CompetenciaSkeleton],
    ['IdentidadSkeleton', IdentidadSkeleton],
  ])('%s no trae ningún color escrito a mano (hex o rgb) en sus estilos en línea', (_nombre, Skeleton) => {
    const { container } = render(<Skeleton />)
    const conHex = estilosInline(container as HTMLElement).filter((s) => COLOR_LITERAL.test(s))
    expect(conHex).toEqual([])
  })

  it.each([
    ['CompetenciaSkeleton', CompetenciaSkeleton],
    ['IdentidadSkeleton', IdentidadSkeleton],
  ])('%s dibuja sus bordes con var(--border)', (_nombre, Skeleton) => {
    const { container } = render(<Skeleton />)
    const bordes = estilosInline(container as HTMLElement).filter((s) => /border/.test(s) && /solid/.test(s))
    expect(bordes.length).toBeGreaterThan(0)
    for (const b of bordes) expect(b).toContain('var(--border)')
  })
})
