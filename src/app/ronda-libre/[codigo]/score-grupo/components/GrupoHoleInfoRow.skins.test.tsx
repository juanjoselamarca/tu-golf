import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GrupoHoleInfoRow } from './GrupoHoleInfoRow'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'

const fila = (skins?: { valor: number; provisional: boolean } | null) => render(
  <GrupoHoleInfoRow par={4} strokeIndex={3} yardaje={null} showNetStableford maxStrokes={1} accion={null} theme={SCORER_THEME} skins={skins} />,
)

describe('GrupoHoleInfoRow · «Vale N skins»', () => {
  it('fuera del skins sigue GOLPES GRUPO y no hay VALE', () => {
    fila()
    expect(screen.getByText('GOLPES GRUPO')).toBeTruthy()
    expect(screen.queryByText('VALE')).toBeNull()
  })
  it('en el skins: «Vale 3 skins» en lugar de GOLPES GRUPO', () => {
    fila({ valor: 3, provisional: false })
    expect(screen.getByRole('status', { name: 'Vale 3 skins' }).textContent).toContain('3 skins')
    expect(screen.queryByText('GOLPES GRUPO')).toBeNull()
  })
  it('provisional: «desde 2 skins», sin «+», y el aria-label dice lo mismo', () => {
    fila({ valor: 2, provisional: true })
    const vale = screen.getByRole('status', { name: 'Vale desde 2 skins' })
    expect(vale.textContent).toContain('desde 2 skins')
    expect(vale.textContent).not.toContain('+')
  })
  it('provisional en 1: «desde 1 skin» (singular)', () => {
    fila({ valor: 1, provisional: true })
    expect(screen.getByRole('status', { name: 'Vale desde 1 skin' }).textContent).toContain('desde 1 skin')
  })
  it('null: la columna VALE sigue, con «—» y «Valor no disponible»; sin GOLPES GRUPO', () => {
    fila(null)
    const vale = screen.getByRole('status', { name: 'Valor no disponible' })
    expect(vale.textContent).toContain('VALE')
    expect(vale.textContent).toContain('—')
    expect(screen.queryByText('GOLPES GRUPO')).toBeNull()
  })
  it('rótulos de 11 px como mínimo', () => {
    fila({ valor: 3, provisional: false })
    for (const r of ['PAR', 'SI', 'VALE']) expect(parseFloat(screen.getByText(r).style.fontSize)).toBeGreaterThanOrEqual(11)
  })
})

// Revisión Fable PR #888, vuelta 3 (P2.6): a 360 px con YDS, «GOLPES GRUPO» repartido en partes iguales llenaba sus
// 90 px de 90. La columna crece como VALE y no se encoge bajo el rótulo (sin minWidth 0). Medido en las capturas v4.
describe('GrupoHoleInfoRow · columna GOLPES GRUPO', () => {
  it('crece como VALE (1,6) y no se encoge bajo su rótulo, que no parte línea', () => {
    render(<GrupoHoleInfoRow par={4} strokeIndex={3} yardaje={403} showNetStableford maxStrokes={1} accion={null} theme={SCORER_THEME} />)
    const rotulo = screen.getByText('GOLPES GRUPO')
    const columna = rotulo.parentElement!
    expect(columna.style.flex).toBe('1.6 1 0%')
    expect(columna.style.minWidth).toBe('')
    expect(rotulo.style.whiteSpace).toBe('nowrap')
  })
})
