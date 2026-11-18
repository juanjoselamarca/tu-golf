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

type Vista = UseScoreEntryReturn['vista']
const fila = (putts: number | null, estado: Vista[number]['estado'] = 'limpio') =>
  ({ gross: 5, putts, fairway_hit: null, gir: null, estado, motivo: estado === 'rechazado' ? 'closed' : null, quizaAplicado: false })

function montar(putts: Record<number, number | null>, { estado = 'limpio' as Vista[number]['estado'] } = {}) {
  let vista: Vista = { 1: fila(putts[1] ?? null, estado) }
  // Como el hook real: la edición se ve al tiro en la vista.
  const editarStat = vi.fn((h: number, patch: Partial<Vista[number]>) => {
    vista = { ...vista, [h]: { ...vista[h], ...patch } }
    dibujar()
    return true
  })
  const reintentarGuardado = vi.fn()
  const entry = () => ({ holes: [1], vista, editarStat, reintentarGuardado, selectedRound: { id: 'r1' } }) as unknown as UseScoreEntryReturn
  const r = render(<HoleStatsTable courseHoles={[{ numero: 1, par: 4 } as never]} entry={entry()} />)
  function dibujar() {
    r.rerender(<HoleStatsTable courseHoles={[{ numero: 1, par: 4 } as never]} entry={entry()} />)
  }
  /** Una relectura de la tarjeta: la vista vuelve con lo que diga la base. */
  const recargar = (p: Record<number, number | null>) => {
    vista = { 1: fila(p[1] ?? null) }
    act(() => dibujar())
  }
  const campo = () => screen.getByLabelText('Putts del hoyo 1') as HTMLInputElement
  const escribir = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })
  const salir = () => fireEvent.blur(campo())
  return { editarStat, reintentarGuardado, campo, escribir, salir, recargar }
}

describe('HoleStatsTable · putts', () => {
  it('entrar y salir del campo vacío sin escribir no manda nada (no borra putts que no se cargaron)', () => {
    const { editarStat, campo, salir } = montar({})
    fireEvent.focus(campo())
    salir()
    expect(editarStat).not.toHaveBeenCalled()
  })

  it('cambiar el valor guarda el nuevo; vaciarlo guarda null (borrar a propósito)', () => {
    const { editarStat, campo, escribir, salir } = montar({ 1: 2 })
    fireEvent.focus(campo())
    escribir('3')
    salir()
    expect(editarStat).toHaveBeenLastCalledWith(1, { putts: 3 })

    fireEvent.focus(campo())
    escribir('')
    salir()
    expect(editarStat).toHaveBeenLastCalledWith(1, { putts: null })
  })

  // Con el documento por hoyo, un hoyo sin confirmar ya se reintenta solo: salir del campo no agrega nada.
  it('con el hoyo sin confirmar, salir del campo sin cambios no envía (el sincronizador ya lo reintenta)', () => {
    const { editarStat, campo, salir } = montar({ 1: 2 }, { estado: 'sin_confirmar' })
    fireEvent.focus(campo())
    salir()
    expect(editarStat).not.toHaveBeenCalled()
  })

  it('lo tecleado sin salir del campo sobrevive a una recarga de la tarjeta y se guarda al salir', () => {
    const { editarStat, campo, escribir, salir, recargar } = montar({})
    fireEvent.focus(campo())
    escribir('2')
    recargar({ 1: null })
    expect(campo().value).toBe('2')
    salir()
    expect(editarStat).toHaveBeenLastCalledWith(1, { putts: 2 })
  })

  // Revisión Fable #834 v3: "9" se convertía en null y borraba los putts sin decir nada.
  it('un valor fuera de rango se avisa con texto, no se guarda y queda lo que había', () => {
    const { editarStat, campo, escribir, salir } = montar({ 1: 2 })
    fireEvent.focus(campo())
    escribir('9')
    salir()
    expect(editarStat).not.toHaveBeenCalled()
    expect(campo().value).toBe('2')
    expect(screen.getByRole('alert').textContent).toMatch(/«9».*entre 0 y 6/)

    fireEvent.focus(campo())
    escribir('3')
    salir()
    expect(editarStat).toHaveBeenLastCalledWith(1, { putts: 3 })
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
    const { editarStat } = montar({})
    const gir = () => screen.getByRole('button', { name: /^GIR del hoyo 1/ })
    expect(screen.getAllByRole('button', { name: /^GIR del hoyo 1/ })).toHaveLength(1)
    expect(gir().style.width).toBe('44px')
    expect(gir().style.height).toBe('44px')
    for (const esperado of [true, false, null]) {
      fireEvent.click(gir())
      expect(editarStat).toHaveBeenLastCalledWith(1, { gir: esperado })
      reloj += REBOTE_TOQUE_MS
    }
    expect(gir().textContent).toBe('—')
  })

  it('un segundo toque antes de 350 ms es un rebote y no cambia nada', () => {
    let reloj = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => reloj)
    const { editarStat } = montar({})
    const fw = () => screen.getByRole('button', { name: /^Fairway del hoyo 1/ })
    fireEvent.click(fw())
    reloj += REBOTE_TOQUE_MS - 1
    fireEvent.click(fw())
    expect(editarStat).toHaveBeenCalledTimes(1)
    expect(fw().textContent).toBe('Sí')
  })

  it('un hoyo rechazado se ve con texto y motivo, sin botón propio (el único botón es el aviso agrupado)', () => {
    montar({}, { estado: 'rechazado' })
    const aviso = screen.getByText(/no se guardó \(tarjeta cerrada\)/i)
    expect(aviso.style.color).toBe('var(--error-fg)')
    // Mutación anotada: devolver el <button> por hoyo → aparece un botón "Hoyo 1: …" y falla.
    expect(screen.queryByRole('button', { name: /no se guardó/i })).toBeNull()
  })

  it('un hoyo sin confirmar también se ve con texto, en ámbar como en la grilla (no en rojo de rechazo)', () => {
    montar({}, { estado: 'sin_confirmar' })
    const aviso = screen.getByText(/Hoyo 1: sin confirmar/i)
    expect(aviso.style.color).toBe('var(--status-open-fg)')
    expect(screen.queryByRole('button', { name: /sin confirmar/i })).toBeNull()
  })
})
