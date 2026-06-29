import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShareButton } from './ShareButton'
import type { SharePayload } from '@/golf/share/types'

const payload: SharePayload = {
  title: 'Mi ronda — Golfers+',
  text: 'Jugué 82 (+10) en Los Leones',
  url: 'https://golfersplus.vercel.app/tarjeta/abc',
}

let origNavigator: PropertyDescriptor | undefined

beforeEach(() => {
  origNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    value: { share: vi.fn() }, configurable: true, writable: true,
  })
})
afterEach(() => {
  if (origNavigator) Object.defineProperty(globalThis, 'navigator', origNavigator)
  vi.restoreAllMocks()
})

describe('ShareButton', () => {
  it('renderiza el trigger con el label por defecto "Compartir"', () => {
    render(<ShareButton payload={payload} />)
    expect(screen.getByRole('button', { name: /compartir/i })).toBeTruthy()
  })

  it('renderiza un label custom', () => {
    render(<ShareButton payload={payload} label="Compartir ronda" />)
    expect(screen.getByRole('button', { name: /compartir ronda/i })).toBeTruthy()
  })

  it('el sheet arranca cerrado (no se ve "Compartir imagen")', () => {
    render(<ShareButton payload={payload} />)
    expect(screen.queryByRole('button', { name: /compartir imagen/i })).toBeNull()
  })

  it('click en el trigger abre el sheet (aparece "Compartir imagen")', () => {
    render(<ShareButton payload={payload} label="Compartir ronda" />)
    fireEvent.click(screen.getByRole('button', { name: /compartir ronda/i }))
    expect(screen.getByRole('button', { name: /compartir imagen/i })).toBeTruthy()
  })
})
