// Campo de putts del organizador: pasar por el campo sin cambiarlo no guarda. Con la carga lenta o fallida el campo
// está vacío aunque la base tenga putts, y el blur mandaba `putts: null`, que ahora el servidor sí borra.

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HoleStatsTable } from './HoleStatsTable'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'

function montar(holePutts: Record<number, number | null>) {
  const saveHoleStat = vi.fn(async () => {})
  const setHolePutts = vi.fn()
  const entry = {
    holes: [1], currentScores: { 1: 5 }, holePutts, setHolePutts, holeFairway: {}, setHoleFairway: vi.fn(),
    holeGir: {}, setHoleGir: vi.fn(), saveHoleStat,
  } as unknown as UseScoreEntryReturn
  const vista = render(<HoleStatsTable courseHoles={[]} entry={entry} />)
  const campo = () => screen.getByPlaceholderText('—') as HTMLInputElement
  const conPutts = (p: Record<number, number | null>) =>
    vista.rerender(<HoleStatsTable courseHoles={[]} entry={{ ...entry, holePutts: p }} />)
  return { saveHoleStat, setHolePutts, campo, conPutts }
}

describe('HoleStatsTable · putts', () => {
  it('entrar y salir del campo vacío sin escribir no manda nada (no borra putts que no se cargaron)', () => {
    const { saveHoleStat, campo } = montar({})
    fireEvent.focus(campo())
    fireEvent.blur(campo())
    expect(saveHoleStat).not.toHaveBeenCalled()
  })

  it('cambiar el valor guarda el nuevo; vaciarlo guarda null (borrar a propósito)', () => {
    const { saveHoleStat, campo, conPutts } = montar({ 1: 2 })
    fireEvent.focus(campo())
    conPutts({ 1: 3 })
    fireEvent.blur(campo())
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: 3 })

    fireEvent.focus(campo())
    conPutts({ 1: null })
    fireEvent.blur(campo())
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: null })
  })
})
