import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { useHoleNavigation, esSwipeHorizontal } from '@/hooks/ronda/useHoleNavigation'

function montar(hoyoInicio: number, totalHoles: number, inicial: number) {
  return renderHook(() => {
    const [currentHole, setCurrentHole] = useState(inicial)
    const nav = useHoleNavigation({ hoyoInicio, totalHoles, currentHole, setCurrentHole })
    return { currentHole, setCurrentHole, nav }
  })
}

const touch = (x: number, y = 0) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] }) as never

describe('useHoleNavigation — la misma lista de hoyos para los dos scorers', () => {
  it('18 desde el 1: orden 1..18, anterior/siguiente por índice', () => {
    const { result } = montar(1, 18, 1)
    expect(result.current.nav.ordenHoyos).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
    expect(result.current.nav.currentHoleIdx).toBe(0)
    expect(result.current.nav.isLastHole).toBe(false)
    act(() => { result.current.nav.goToPrevHole() })
    expect(result.current.currentHole).toBe(1) // no hay anterior
    let next: number | null = null
    act(() => { next = result.current.nav.advanceHole() })
    expect(next).toBe(2)
    expect(result.current.currentHole).toBe(2)
  })

  it('back 9 (hoyo_inicio=10, holes=9): navega 10..18 y nunca sale de la ronda', () => {
    const { result } = montar(10, 9, 10)
    expect(result.current.nav.ordenHoyos).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
    // Deslizar hacia atrás parado en el 10 NO va al hoyo 9 (que no se juega).
    act(() => { result.current.nav.swipeHandlers.onTouchStart(touch(100)) })
    act(() => { result.current.nav.swipeHandlers.onTouchEnd(touch(200)) })
    expect(result.current.currentHole).toBe(10)
    // Deslizar hacia adelante avanza al 11 (antes: `currentHole < holes` → 10 < 9 nunca avanzaba).
    act(() => { result.current.nav.swipeHandlers.onTouchStart(touch(200)) })
    act(() => { result.current.nav.swipeHandlers.onTouchEnd(touch(100)) })
    expect(result.current.currentHole).toBe(11)
    // Hasta el último: isLastHole y advanceHole devuelve null.
    act(() => { result.current.setCurrentHole(18) })
    expect(result.current.nav.isLastHole).toBe(true)
    let next: number | null = 0
    act(() => { next = result.current.nav.advanceHole() })
    expect(next).toBeNull()
    expect(result.current.currentHole).toBe(18)
  })

  it('shotgun 18 desde el 10: después del 18 viene el 1', () => {
    const { result } = montar(10, 18, 18)
    expect(result.current.nav.currentHoleIdx).toBe(8)
    act(() => { result.current.nav.advanceHole() })
    expect(result.current.currentHole).toBe(1)
    act(() => { result.current.nav.goToPrevHole() })
    expect(result.current.currentHole).toBe(18)
  })

  it('un deslizar vertical o corto no navega', () => {
    expect(esSwipeHorizontal(30, 0)).toBe(false)
    expect(esSwipeHorizontal(60, 50)).toBe(false)
    expect(esSwipeHorizontal(-60, 10)).toBe(true)
    const { result } = montar(1, 9, 3)
    act(() => { result.current.nav.swipeHandlers.onTouchStart(touch(100, 100)) })
    act(() => { result.current.nav.swipeHandlers.onTouchEnd(touch(40, 160)) })
    expect(result.current.currentHole).toBe(3)
  })

  it('la lista es estable entre renders (es dependencia de otros memos)', () => {
    const { result, rerender } = montar(1, 9, 1)
    const antes = result.current.nav.ordenHoyos
    rerender()
    expect(result.current.nav.ordenHoyos).toBe(antes)
  })

  it('centra la celda del hoyo actual por data-hoyo, no por posición', () => {
    const { result } = montar(10, 9, 10)
    const row = document.createElement('div')
    const celda = document.createElement('div')
    celda.setAttribute('data-hoyo', '11')
    celda.scrollIntoView = vi.fn()
    row.appendChild(celda)
    ;(result.current.nav.progressRowRef as { current: HTMLDivElement | null }).current = row
    act(() => { result.current.setCurrentHole(11) })
    expect(celda.scrollIntoView).toHaveBeenCalledWith({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  })
})
