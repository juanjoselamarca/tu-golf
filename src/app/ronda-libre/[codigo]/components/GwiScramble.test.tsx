import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GwiScramble } from './GwiScramble'

const eq = (nombre: string, diff: number, holesPlayed: number) => ({ nombre, diff, holesPlayed })

describe('GwiScramble', () => {
  it('muestra los dos % (suman 100) con los nombres', () => {
    render(<GwiScramble totalHoyos={18} equipos={[eq('Los Lamarca', -3, 11), eq('Los Ross', -2, 9)]} />)
    const region = screen.getByRole('region')
    const m = region.getAttribute('aria-label')!.match(/Los Lamarca (\d+) %, Los Ross (\d+) %/)!
    expect(Number(m[1]) + Number(m[2])).toBe(100)
    expect(screen.getByText('Los Lamarca')).toBeTruthy()
  })
  it('antes de 3 hoyos, o con otra cantidad de equipos, no se muestra', () => {
    const { container, rerender } = render(<GwiScramble totalHoyos={18} equipos={[eq('A', 0, 2), eq('B', 0, 1)]} />)
    expect(container.innerHTML).toBe('')
    rerender(<GwiScramble totalHoyos={18} equipos={[eq('A', 0, 5), eq('B', 0, 5), eq('C', 0, 5)]} />)
    expect(container.innerHTML).toBe('')
  })
})
