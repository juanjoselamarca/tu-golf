// @vitest-environment jsdom
// #773: el índice del rival era type=number + Number(): "+1.5" quedaba en '' → 0 y un plus se veía "-2".
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { TarjetaDeRival } from './TarjetaDeRival'
import type { RivalDelCreador } from '../hooks/useFormularioDeRonda'

const busqueda = vi.hoisted(() => ({ results: [] as Array<{ id: string; name: string; indice: number | null }> }))
vi.mock('../hooks/usePlayerSearch', () => ({
  usePlayerSearch: () => ({ results: busqueda.results, searching: false, open: busqueda.results.length > 0, dismiss: vi.fn(), containerRef: { current: null } }),
}))

const BASE: RivalDelCreador = { id: 'r1', tipo: 'invitado', nombre: 'Pedro', telefono: '', handicap: null, tees: null, profileId: null }

function Tarjeta({ inicial, onHandicap, base = BASE }: { inicial: number | null; onHandicap: (v: number | null) => void; base?: RivalDelCreador }) {
  const [rival, setRival] = useState<RivalDelCreador>({ ...base, handicap: inicial })
  return (
    <TarjetaDeRival rival={rival} indiceEnLista={0} numeroEnPantalla={2} tees={[]} teeGlobal="" hcp={rival.handicap}
      onCampo={(campo, valor) => {
        setRival(r => ({ ...r, [campo]: valor }))
        if (campo === 'handicap') onHandicap(valor as number | null)
      }}
      onQuitar={vi.fn()} onBloqueo={vi.fn()} />
  )
}
const campo = () => screen.getByLabelText('Índice') as HTMLInputElement

describe('TarjetaDeRival — índice (#773)', () => {
  it('"12.35" (bloquea) y después se elige en el buscador un perfil SIN índice: el campo queda vacío, no pegado', () => {
    busqueda.results = [{ id: 'p-sin-indice', name: 'Pedro Pérez', indice: null }]
    try {
      const onHandicap = vi.fn()
      render(<Tarjeta inicial={null} onHandicap={onHandicap} base={{ ...BASE, tipo: 'cuenta', nombre: 'Ped' }} />)
      fireEvent.change(campo(), { target: { value: '12.35' } })
      expect(campo().value).toBe('12.35')
      fireEvent.click(screen.getByText('Pedro Pérez'))
      expect(campo().value).toBe('')
      expect(campo().getAttribute('aria-invalid')).toBe('false')
    } finally {
      busqueda.results = []
    }
  })

  it('un plus (−2) se precarga "+2"', () => {
    render(<Tarjeta inicial={-2} onHandicap={vi.fn()} />)
    expect(campo().value).toBe('+2')
  })

  it.each([['+1.5', -1.5], ['18,5', 18.5], ['', null]])('"%s" se lee como %s', (texto, valor) => {
    const onHandicap = vi.fn()
    render(<Tarjeta inicial={10} onHandicap={onHandicap} />)
    fireEvent.change(campo(), { target: { value: texto } })
    expect(onHandicap).toHaveBeenLastCalledWith(valor)
  })

  it('"abc" avisa y deja el índice en null', () => {
    const onHandicap = vi.fn()
    render(<Tarjeta inicial={10} onHandicap={onHandicap} />)
    fireEvent.change(campo(), { target: { value: 'abc' } })
    expect(onHandicap).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número (12.4, o +2 si es plus) o déjalo vacío.')
  })
})
