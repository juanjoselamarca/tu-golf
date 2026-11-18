// Tabla de stats del organizador (putts / fairway / GIR).
// - Pasar por el campo de putts sin cambiarlo no guarda: con la carga lenta o fallida el campo está vacío aunque la
//   base tenga putts, y el blur mandaba `putts: null`, que ahora el servidor sí borra.
// - Revisión Fable #834 v2/v3: lo tecleado sin salir del campo sobrevive a la recarga; fairway y GIR son un botón
//   de 44×44 que rota (sin rebotes); un fallo (que lleva el hook) se ve con texto y se reintenta con un toque; un
//   valor de putts fuera de rango se avisa en vez de borrarse en silencio.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { HoleStatsTable, REBOTE_TOQUE_MS, siguienteTriEstado } from './HoleStatsTable'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'

afterEach(() => vi.restoreAllMocks())

function montar(holePutts: Record<number, number | null>, { fallidas = [] as number[] } = {}) {
  const saveHoleStat = vi.fn(async () => true)
  const cambiarStat = vi.fn()
  let estado = { holePutts, holeFairway: {} as Record<number, boolean | null>, holeGir: {} as Record<number, boolean | null> }
  const setter = (k: 'holePutts' | 'holeFairway' | 'holeGir') =>
    vi.fn((f: (p: Record<number, unknown>) => Record<number, unknown>) => {
      estado = { ...estado, [k]: f(estado[k]) }
      dibujar()
    })
  const setHolePutts = setter('holePutts')
  const base = {
    holes: [1], currentScores: { 1: 5 }, saveHoleStat, cambiarStat, statsFallidas: new Set(fallidas),
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
  const salir = () => fireEvent.blur(campo())
  return { saveHoleStat, cambiarStat, setHolePutts, campo, escribir, salir, recargar }
}

describe('HoleStatsTable · putts', () => {
  it('entrar y salir del campo vacío sin escribir no manda nada (no borra putts que no se cargaron)', () => {
    const { saveHoleStat, campo, salir } = montar({})
    fireEvent.focus(campo())
    salir()
    expect(saveHoleStat).not.toHaveBeenCalled()
  })

  it('cambiar el valor guarda el nuevo; vaciarlo guarda null (borrar a propósito)', () => {
    const { saveHoleStat, campo, escribir, salir } = montar({ 1: 2 })
    fireEvent.focus(campo())
    escribir('3')
    salir()
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: 3 })

    fireEvent.focus(campo())
    escribir('')
    salir()
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: null })
  })

  // Revisión Fable de #834 (P1): el segundo blur sin cambios no enviaba un guardado que había fallado.
  it('con el hoyo marcado como fallido, salir del campo sin cambios lo reenvía', () => {
    const { saveHoleStat, campo, salir } = montar({ 1: 2 }, { fallidas: [1] })
    fireEvent.focus(campo())
    salir()
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: 2 })
  })

  it('lo tecleado sin salir del campo sobrevive a una recarga de la tarjeta y se guarda al salir', () => {
    const { saveHoleStat, campo, escribir, salir, recargar } = montar({})
    fireEvent.focus(campo())
    escribir('2')
    recargar({ 1: null })
    expect(campo().value).toBe('2')
    salir()
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: 2 })
  })

  // Revisión Fable #834 v3: "9" se convertía en null y borraba los putts sin decir nada.
  it('un valor fuera de rango se avisa con texto, no se guarda y queda lo que había', () => {
    const { saveHoleStat, setHolePutts, campo, escribir, salir } = montar({ 1: 2 })
    fireEvent.focus(campo())
    escribir('9')
    salir()
    expect(saveHoleStat).not.toHaveBeenCalled()
    expect(setHolePutts).not.toHaveBeenCalled()
    expect(campo().value).toBe('2')
    expect(screen.getByRole('alert').textContent).toMatch(/«9».*entre 0 y 6/)

    fireEvent.focus(campo())
    escribir('3')
    salir()
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, { putts: 3 })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('el encabezado dice el rango y el campo mide al menos 44 px de alto (uso con guante)', () => {
    const { campo } = montar({})
    expect(screen.getByText('Putts (0-6)')).toBeTruthy()
    expect(parseInt(campo().style.minHeight)).toBeGreaterThanOrEqual(44)
  })
})

describe('HoleStatsTable · fairway y GIR', () => {
  it('el botón rota sin dato → Sí → No → sin dato', () => {
    expect([undefined, null, true, false].map(siguienteTriEstado)).toEqual([true, true, false, null])
  })

  it('un solo botón de 44×44 por stat; cada toque fija el valor siguiente (el envío lo agrupa el hook)', () => {
    let reloj = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => reloj)
    const { cambiarStat } = montar({})
    const gir = () => screen.getByRole('button', { name: /^GIR del hoyo 1/ })
    expect(screen.getAllByRole('button', { name: /^GIR del hoyo 1/ })).toHaveLength(1)
    expect(gir().style.width).toBe('44px')
    expect(gir().style.height).toBe('44px')
    for (const esperado of [true, false, null]) {
      fireEvent.click(gir())
      expect(cambiarStat).toHaveBeenLastCalledWith(1, { gir: esperado })
      reloj += REBOTE_TOQUE_MS
    }
    expect(gir().textContent).toBe('—')
  })

  it('un segundo toque antes de 350 ms es un rebote y no cambia nada', () => {
    let reloj = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => reloj)
    const { cambiarStat } = montar({})
    const fw = () => screen.getByRole('button', { name: /^Fairway del hoyo 1/ })
    fireEvent.click(fw())
    reloj += REBOTE_TOQUE_MS - 1
    fireEvent.click(fw())
    expect(cambiarStat).toHaveBeenCalledTimes(1)
    expect(fw().textContent).toBe('Sí')
  })

  it('un hoyo con stats sin guardar se ve con texto (no sólo un title) y el toque reintenta lo pendiente', () => {
    const { saveHoleStat } = montar({}, { fallidas: [1] })
    const aviso = screen.getByRole('button', { name: /no se guardó · toca para reintentar/i })
    expect(parseInt(aviso.style.minHeight)).toBeGreaterThanOrEqual(44)
    fireEvent.click(aviso)
    // `{}`: viaja la foto de lo tocado que el servidor no aplicó (la lleva `useScoreEntry`).
    expect(saveHoleStat).toHaveBeenLastCalledWith(1, {})
  })
})
