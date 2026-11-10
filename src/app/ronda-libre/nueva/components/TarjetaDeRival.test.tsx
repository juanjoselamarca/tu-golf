// @vitest-environment jsdom
// #773: el índice del rival era type=number + Number(): "+1.5" quedaba en '' → 0 y un plus se veía "-2".
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { TarjetaDeRival } from './TarjetaDeRival'
import type { RivalDelCreador } from '../hooks/useFormularioDeRonda'

vi.mock('../hooks/usePlayerSearch', () => ({
  usePlayerSearch: () => ({ results: [], searching: false, open: false, dismiss: vi.fn(), containerRef: { current: null } }),
}))

const BASE: RivalDelCreador = { id: 'r1', tipo: 'invitado', nombre: 'Pedro', telefono: '', handicap: null, tees: null, profileId: null }

function Tarjeta({ inicial, onHandicap }: { inicial: number | null; onHandicap: (v: number | null) => void }) {
  const [rival, setRival] = useState<RivalDelCreador>({ ...BASE, handicap: inicial })
  return (
    <TarjetaDeRival rival={rival} indiceEnLista={0} tees={[]} teeGlobal="" golpes={rival.handicap}
      onCampo={(campo, valor) => {
        setRival(r => ({ ...r, [campo]: valor }))
        if (campo === 'handicap') onHandicap(valor as number | null)
      }}
      onQuitar={vi.fn()} onBloqueo={vi.fn()} />
  )
}
const campo = () => screen.getByLabelText('Índice') as HTMLInputElement

describe('TarjetaDeRival — índice (#773)', () => {
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
