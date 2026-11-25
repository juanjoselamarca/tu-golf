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
  it('provisional: «o más»; sin cifra confiable (null) no muestra nada', () => {
    fila({ valor: 2, provisional: true })
    expect(screen.getByRole('status', { name: 'Vale 2 skins o más' })).toBeTruthy()
  })
  it('null: ni VALE ni GOLPES GRUPO', () => {
    fila(null)
    expect(screen.queryByText('VALE')).toBeNull()
    expect(screen.queryByText('GOLPES GRUPO')).toBeNull()
  })
})
