// @vitest-environment jsdom
// Un índice a medio escribir ("+") o que no es número ("1O") le llega al formulario como `null` (= sin índice):
// sin este bloqueo, "Revisar →" avanzaba y la ronda se creaba con ese jugador sin índice.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { PasoJugadores } from './PasoJugadores'
import type { RivalDelCreador } from '../hooks/useFormularioDeRonda'

vi.mock('../hooks/usePlayerSearch', () => ({
  usePlayerSearch: () => ({ results: [], searching: false, open: false, dismiss: vi.fn(), containerRef: { current: null } }),
}))

const RIVAL: RivalDelCreador = { id: 'r1', tipo: 'invitado', nombre: 'Pedro', telefono: '', handicap: 10, tees: null, profileId: null }

function Paso({ onSiguiente }: { onSiguiente: () => void }) {
  const [rivales, setRivales] = useState<RivalDelCreador[]>([RIVAL])
  const [indice, setIndice] = useState<number | null>(12)
  return (
    <PasoJugadores
      creador={{ nombre: 'Ana', indice }}
      onIndiceCreador={setIndice}
      teeGlobal="" onTeeGlobal={vi.fn()} tees={[]}
      formato="stroke_play" modo="neto" esFormatoDeEquipo={false}
      preguntaQuienAnota={false} anotaPorTodos onQuienAnota={vi.fn()} llevaElScoreDelGrupo
      rivales={rivales}
      onCampoRival={(idx, campo, valor) => setRivales(rs => rs.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)))}
      onQuitarRival={idx => setRivales(rs => rs.filter((_, i) => i !== idx))}
      onAgregarRival={vi.fn()}
      equipos={[]} onAgregarEquipo={vi.fn()} onQuitarEquipo={vi.fn()} onRenombrarEquipo={vi.fn()} onMoverAlEquipo={vi.fn()}
      golpesDe={i => (i == null ? null : Math.round(i))}
      rondasRecientes={[]} problema={null}
      onAtras={vi.fn()} onSiguiente={onSiguiente}
    />
  )
}

const revisar = () => screen.getByRole('button', { name: /Revisar/ }) as HTMLButtonElement
const indiceRival = () => document.getElementById('rival-0-indice') as HTMLInputElement
const MENSAJE = 'Escribe un número: 12.4, o +2 si es plus.'

describe('PasoJugadores — un índice inválido o a medio escribir no deja avanzar', () => {
  it('con "1O" en el rival, "Revisar" no avanza y dice por qué; al corregirlo, avanza', () => {
    const onSiguiente = vi.fn()
    render(<Paso onSiguiente={onSiguiente} />)
    expect(revisar().disabled).toBe(false)
    fireEvent.change(indiceRival(), { target: { value: '1O' } })
    expect(revisar().disabled).toBe(true)
    fireEvent.click(revisar())
    expect(onSiguiente).not.toHaveBeenCalled()
    expect(screen.getAllByText(MENSAJE).length).toBeGreaterThanOrEqual(1)
    fireEvent.change(indiceRival(), { target: { value: '10' } })
    expect(revisar().disabled).toBe(false)
    fireEvent.click(revisar())
    expect(onSiguiente).toHaveBeenCalledTimes(1)
  })

  it('"+" a medio escribir en el creador también bloquea, con el aviso bajo el botón', () => {
    render(<Paso onSiguiente={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Índice', { selector: '#indice-creador' }), { target: { value: '+' } })
    expect(revisar().disabled).toBe(true)
    expect(screen.getByText(MENSAJE)).toBeTruthy()
  })

  it('quitar al rival con el índice inválido destraba el paso', () => {
    render(<Paso onSiguiente={vi.fn()} />)
    fireEvent.change(indiceRival(), { target: { value: 'abc' } })
    expect(revisar().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Quitar/ }))
    expect(revisar().disabled).toBe(false)
  })
})
