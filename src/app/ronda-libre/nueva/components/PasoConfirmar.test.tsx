// @vitest-environment jsdom
// Revisión del inbox 8a0b2270: con "Crear ronda" ya apretado, volver a editar dejaba cambiar la cancha o "quién
// anota" con el POST en vuelo, y la pantalla de compartir (que lee el formulario vivo) mostraba otra ronda.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PasoConfirmar } from './PasoConfirmar'

function renderPaso(creando: boolean) {
  render(
    <PasoConfirmar
      cancha="Los Leones" forma={{ holes: 18, hoyoInicio: 1, esMultiRecorrido: false }} mitad="front"
      recorridosElegidos={[]} formato="stroke_play" modo="gross" teeGlobal="Azul" fecha="2026-11-12"
      jugadores={[]} equipos={[]} llevaElScoreDelGrupo={false} hcpVisibleDe={() => null} hayVariosTees={false}
      problema={null} creando={creando} onEditar={vi.fn()} onCrear={vi.fn()}
    />,
  )
  return screen.getByRole('button', { name: '← Editar' }) as HTMLButtonElement
}

describe('PasoConfirmar — Editar mientras se crea la ronda', () => {
  it('se puede editar antes de crear', () => {
    expect(renderPaso(false).disabled).toBe(false)
  })

  it('no se puede editar con la ronda creándose', () => {
    expect(renderPaso(true).disabled).toBe(true)
  })
})

describe('PasoConfirmar — scramble de equipos de club', () => {
  const largo = 'Los Tigres del Club de Golf Los Leones de Santiago'
  it('sin fila de Tees, anota «Tú, todos los equipos» y el HCP del club va en su propio elemento (no se corta)', () => {
    render(
      <PasoConfirmar
        cancha="Los Leones" forma={{ holes: 18, hoyoInicio: 1, esMultiRecorrido: false }} mitad="front"
        recorridosElegidos={[]} formato="scramble" modo="neto" teeGlobal="Azul" fecha="2026-11-12"
        jugadores={[]} equipos={[]} llevaElScoreDelGrupo hcpVisibleDe={() => null} hayVariosTees={false}
        equiposDeClub={[{ nombre: largo, handicap: 8 }, { nombre: 'Los Pumas', handicap: 12 }]}
        problema={null} creando={false} onEditar={vi.fn()} onCrear={vi.fn()}
      />,
    )
    expect(screen.queryByText('Tees')).toBeNull()
    expect(screen.getByText('Tú, todos los equipos')).toBeTruthy()
    expect(screen.getByText(largo)).toBeTruthy()
    const hcp = screen.getByText('· HCP 8 (club)')
    expect(hcp.style.flexShrink).toBe('0')
  })
})
