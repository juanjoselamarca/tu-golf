// @vitest-environment jsdom
// El índice del creador era type=number con value={indice}: un plus se veía "-2" mientras el chip de al lado
// decía "HCP +2", y "+2" o "18,5" no se podían escribir.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { TarjetaDelCreador } from './TarjetaDelCreador'

function Tarjeta({ inicial, onIndice }: { inicial: number | null; onIndice: (v: number | null) => void }) {
  const [indice, setIndice] = useState(inicial)
  return (
    <TarjetaDelCreador nombre="Ana" indice={indice} onIndice={v => { setIndice(v); onIndice(v) }} onBloqueo={vi.fn()}
      tees={[]} teeGlobal="" onTeeGlobal={vi.fn()} golpes={indice} />
  )
}
const campo = () => screen.getByLabelText('Índice') as HTMLInputElement

describe('TarjetaDelCreador — índice', () => {
  it('un plus (−2) se precarga "+2", igual que el chip HCP', () => {
    render(<Tarjeta inicial={-2} onIndice={vi.fn()} />)
    expect(campo().value).toBe('+2')
    expect(screen.getByText('HCP +2')).toBeTruthy()
  })

  it.each([['+1.5', -1.5], ['18,5', 18.5]])('"%s" se lee como %s', (texto, valor) => {
    const onIndice = vi.fn()
    render(<Tarjeta inicial={null} onIndice={onIndice} />)
    fireEvent.change(campo(), { target: { value: texto } })
    expect(onIndice).toHaveBeenLastCalledWith(valor)
    expect(campo().value).toBe(texto)
  })

  it('"abc" avisa y deja el índice en null (sin chip HCP que lo contradiga)', () => {
    const onIndice = vi.fn()
    render(<Tarjeta inicial={10} onIndice={onIndice} />)
    fireEvent.change(campo(), { target: { value: 'abc' } })
    expect(onIndice).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número: 12.4, o +2 si es plus, o déjalo vacío.')
    expect(screen.queryByText(/^HCP/)).toBeNull()
  })

  it('"+" a medio escribir no avisa', () => {
    render(<Tarjeta inicial={null} onIndice={vi.fn()} />)
    fireEvent.change(campo(), { target: { value: '+' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
