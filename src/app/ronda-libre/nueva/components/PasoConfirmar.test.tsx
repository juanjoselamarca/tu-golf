// @vitest-environment jsdom
// Revisión del inbox 8a0b2270: con "Crear ronda" ya apretado, volver a editar dejaba cambiar la cancha o "quién
// anota" con el POST en vuelo, y la pantalla de compartir (que lee el formulario vivo) mostraba otra ronda.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PasoConfirmar, fechaDelResumen } from './PasoConfirmar'

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

describe('fechaDelResumen', () => {
  const hoy = new Date('2026-11-26T12:00:00')
  it('día de la semana con mayúscula y sin año si es el actual', () => {
    expect(fechaDelResumen('2026-11-28', hoy)).toBe('Sábado 28 de noviembre')
  })
  it('con año si es otro', () => {
    expect(fechaDelResumen('2027-01-02', hoy)).toMatch(/^Sábado 2 de enero.*2027$/)
  })
  it('una fecha que no se entiende se muestra tal cual', () => {
    expect(fechaDelResumen('xx', hoy)).toBe('xx')
  })
})
