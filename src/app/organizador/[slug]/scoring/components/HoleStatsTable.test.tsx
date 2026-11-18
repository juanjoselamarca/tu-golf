// Tabla de stats del organizador (putts / fairway / GIR).
// - Pasar por el campo de putts sin cambiarlo no guarda: con la carga lenta o fallida el campo está vacío aunque la
//   base tenga putts, y el blur mandaba `putts: null`, que ahora el servidor sí borra.
// - Revisión Fable #834 v2: lo tecleado sin salir del campo sobrevive a la recarga de la tarjeta; fairway y GIR son
//   un botón de 44×44 que rota; un guardado fallido se ve con texto y se reintenta con un toque.

import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { HoleStatsTable, siguienteTriEstado } from './HoleStatsTable'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'

function montar(holePutts: Record<number, number | null>, respuestas: boolean[] = [true]) {
  let i = 0
  const saveHoleStat = vi.fn(async () => respuestas[Math.min(i++, respuestas.length - 1)])
  let estado = { holePutts, holeFairway: {} as Record<number, boolean | null>, holeGir: {} as Record<number, boolean | null> }
  const setter = (k: 'holePutts' | 'holeFairway' | 'holeGir') =>
    vi.fn((f: (p: Record<number, unknown>) => Record<number, unknown>) => {
      estado = { ...estado, [k]: f(estado[k]) }
      dibujar()
    })
  const setHolePutts = setter('holePutts')
  const base = {
    holes: [1], currentScores: { 1: 5 }, saveHoleStat,
    setHolePutts, setHoleFairway: setter('holeFairway'), setHoleGir: setter('holeGir'),
  }
  const entry = () => ({ ...base, ...estado }) as unknown as UseScoreEntryReturn
  const vista = render(<HoleStatsTable courseHoles={[{ numero: 1, par: 4 } as never]} entry={entry()} />)
  function dibujar() {
    vista.rerender(<HoleStatsTable courseHoles={[{ numero: 1, par: 4 } as never]} entry={entry()} />)
  }
  /** La recarga de la tarjeta: `holePutts` vuelve con lo que diga la base. */
  const recargar = (p: Record<number, number | null>) => {
    estado = { ...estado, holePutts: p }
    act(() => dibujar())
  }
  const campo = () => screen.getByLabelText('Putts del hoyo 1') as HTMLInputElement
  const escribir = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })
  return { saveHoleStat, setHolePutts, campo, escribir, recargar }
}

describe('HoleStatsTable · putts', () => {
  it('entrar y salir del campo vacío sin escribir no manda nada (no borra putts que no se cargaron)', () => {
    const { saveHoleStat, campo } = montar({})
    fireEvent.focus(campo())
    fireEvent.blur(campo())
    expect(saveHoleStat).not.toHaveBeenCalled()
  })

  it('cambiar el valor guarda el nuevo; vaciarlo guarda null (borrar a propósito)', async () => {
    const { saveHoleStat, campo, escribir } = montar({ 1: 2 })
    fireEvent.focus(campo())
    escribir('3')
    await act(async () => { fireEvent.blur(campo()) })
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: 3 })

    fireEvent.focus(campo())
    escribir('')
    await act(async () => { fireEvent.blur(campo()) })
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: null })
  })

  // Revisión Fable de #834 (P1): el blur fallaba, y el segundo blur sin cambios no enviaba porque el valor era el
  // mismo que al enfocar. La pantalla quedaba en 2 y la base sin el dato.
  it('un guardado de putts que falló se reenvía al volver a salir del campo, aunque el valor no cambie', async () => {
    const { saveHoleStat, campo, escribir } = montar({}, [false, true])
    fireEvent.focus(campo())
    escribir('2')
    await act(async () => { fireEvent.blur(campo()) })
    expect(saveHoleStat).toHaveBeenCalledTimes(1)
    expect(campo().getAttribute('aria-invalid')).toBe('true')

    fireEvent.focus(campo())
    await act(async () => { fireEvent.blur(campo()) })
    expect(saveHoleStat).toHaveBeenCalledTimes(2)
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: 2 })
    expect(campo().getAttribute('aria-invalid')).toBeNull()

    // Ya guardado: otra pasada sin cambios no envía.
    fireEvent.focus(campo())
    await act(async () => { fireEvent.blur(campo()) })
    expect(saveHoleStat).toHaveBeenCalledTimes(2)
  })

  // Revisión Fable #834 v2 (P2-e): la recarga que sigue a cada golpe reemplazaba `holePutts` con la base y se
  // llevaba lo tecleado antes de salir del campo.
  it('lo tecleado sin salir del campo sobrevive a una recarga de la tarjeta y se guarda al salir', async () => {
    const { saveHoleStat, campo, escribir, recargar } = montar({})
    fireEvent.focus(campo())
    escribir('2')
    recargar({ 1: null })
    expect(campo().value).toBe('2')
    await act(async () => { fireEvent.blur(campo()) })
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: 2 })
  })

  it('el campo de putts mide al menos 44 px de alto (uso con guante)', () => {
    const { campo } = montar({})
    expect(parseInt(campo().style.minHeight)).toBeGreaterThanOrEqual(44)
  })
})

describe('HoleStatsTable · fairway y GIR (P2-g)', () => {
  it('el botón rota sin dato → Sí → No → sin dato', () => {
    expect([undefined, null, true, false].map(siguienteTriEstado)).toEqual([true, true, false, null])
  })

  it('un solo botón de 44×44 por stat; cada toque guarda el valor siguiente', async () => {
    const { saveHoleStat } = montar({})
    const gir = () => screen.getByRole('button', { name: /^GIR del hoyo 1/ })
    expect(screen.getAllByRole('button', { name: /^GIR del hoyo 1/ })).toHaveLength(1)
    expect(gir().style.width).toBe('44px')
    expect(gir().style.height).toBe('44px')
    await act(async () => { fireEvent.click(gir()) })
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { gir: true })
    expect(gir().textContent).toBe('Sí')
    await act(async () => { fireEvent.click(gir()) })
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { gir: false })
    await act(async () => { fireEvent.click(gir()) })
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { gir: null })
    expect(gir().textContent).toBe('—')
  })

  it('un guardado fallido se ve con texto (no sólo un title) y el toque reintenta lo pendiente del hoyo', async () => {
    const { saveHoleStat } = montar({}, [false, true])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Fairway del hoyo 1/ })) })
    const aviso = screen.getByRole('button', { name: /no se guardó · toca para reintentar/i })
    expect(parseInt(aviso.style.minHeight)).toBeGreaterThanOrEqual(44)

    await act(async () => { fireEvent.click(aviso) })
    // `{}`: viaja la foto de lo tocado que el servidor no aplicó (la lleva `useScoreEntry`).
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, {})
    expect(screen.queryByText(/no se guardó/i)).toBeNull()
  })

  it('con dos envíos del mismo hoyo, manda el resultado del último (uno viejo que falla tarde no marca el hoyo)', async () => {
    let soltarPrimero: (ok: boolean) => void = () => {}
    const { saveHoleStat } = montar({})
    saveHoleStat.mockImplementationOnce(() => new Promise<boolean>((r) => { soltarPrimero = r }))
    fireEvent.click(screen.getByRole('button', { name: /^GIR del hoyo 1/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^GIR del hoyo 1/ })) })
    await act(async () => { soltarPrimero(false) })
    expect(screen.queryByText(/no se guardó/i)).toBeNull()
  })
})
