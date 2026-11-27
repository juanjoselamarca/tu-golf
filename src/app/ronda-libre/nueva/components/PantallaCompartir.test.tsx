// @vitest-environment jsdom
// «Ronda creada» (feedback de Juanjo 26-nov: «no se entiende nada»): cada link dice si es para anotar o para mirar,
// y hay UNA acción principal que lleva al scorer.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PantallaCompartir, textoDeEmpezar } from './PantallaCompartir'

vi.mock('@/components/share/useShare', () => ({ useShare: () => ({ share: vi.fn(), copyLink: vi.fn() }) }))

afterEach(cleanup)

const pintar = (over: Partial<Parameters<typeof PantallaCompartir>[0]> = {}) => {
  const onEmpezar = vi.fn()
  render(
    <PantallaCompartir codigo="ABCD12" cancha="Los Leones" holes={18} llevaElScoreDelGrupo unCelularPorEquipo={false} onEmpezar={onEmpezar} {...over} />,
  )
  return onEmpezar
}

describe('PantallaCompartir', () => {
  it('un celular por equipo: link para anotar (primero) y link para mirar, y «Anotar mi equipo»', () => {
    const onEmpezar = pintar({ unCelularPorEquipo: true })
    const titulos = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    expect(titulos).toEqual(['Link para anotar', 'Link para mirar'])
    expect(screen.getByText('Comparte los links')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Compartir link para anotar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Compartir link para mirar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Anotar mi equipo →' }))
    expect(onEmpezar).toHaveBeenCalledTimes(1)
  })

  it('un celular anota por todos: solo el link para mirar', () => {
    pintar()
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Link para mirar'])
    expect(screen.getByText('Comparte el link')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Compartir link para anotar' })).toBeNull()
  })

  it('la cancha y los hoyos de la ronda creada', () => {
    pintar({ holes: 9 })
    expect(screen.getByRole('heading', { level: 1, name: 'Ronda creada' })).toBeTruthy()
    expect(screen.getByText('Los Leones · 9 hoyos')).toBeTruthy()
  })

  it('el botón dice qué hace quien lo toca', () => {
    expect(textoDeEmpezar(true, true)).toBe('Anotar mi equipo')
    expect(textoDeEmpezar(false, true)).toBe('Empezar a anotar')
    expect(textoDeEmpezar(false, false)).toBe('Empezar a jugar')
  })
})
