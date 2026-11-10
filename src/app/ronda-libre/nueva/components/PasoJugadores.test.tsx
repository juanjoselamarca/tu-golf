// @vitest-environment jsdom
// Un índice a medio escribir ("+") o que no es número ("1O") le llega al formulario como `null` (= sin índice):
// sin este bloqueo, "Revisar →" avanzaba y la ronda se creaba con ese jugador sin índice.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { PasoJugadores } from './PasoJugadores'
import { ID_DEL_CREADOR, type RivalDelCreador } from '../hooks/useFormularioDeRonda'

vi.mock('../hooks/usePlayerSearch', () => ({
  usePlayerSearch: () => ({ results: [], searching: false, open: false, dismiss: vi.fn(), containerRef: { current: null } }),
}))

const RIVAL: RivalDelCreador = { id: 'r1', tipo: 'invitado', nombre: 'Pedro', telefono: '', handicap: 10, tees: null, profileId: null }

function Paso({ onSiguiente, equipos = false, rivalesIniciales = [RIVAL] }: {
  onSiguiente: () => void
  equipos?: boolean
  rivalesIniciales?: RivalDelCreador[]
}) {
  const [rivales, setRivales] = useState<RivalDelCreador[]>(rivalesIniciales)
  const [indice, setIndice] = useState<number | null>(12)
  return (
    <PasoJugadores
      creador={{ nombre: 'Ana', indice }}
      onIndiceCreador={setIndice}
      teeGlobal="" onTeeGlobal={vi.fn()} tees={[]}
      formato={equipos ? 'best_ball' : 'stroke_play'} modo="neto" esFormatoDeEquipo={equipos}
      preguntaQuienAnota={false} anotaPorTodos onQuienAnota={vi.fn()} llevaElScoreDelGrupo
      rivales={rivales}
      onCampoRival={(idx, campo, valor) => setRivales(rs => rs.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)))}
      onQuitarRival={idx => setRivales(rs => rs.filter((_, i) => i !== idx))}
      onAgregarRival={vi.fn()}
      equipos={equipos ? [{ nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR, ...rivales.map(r => r.id)] }] : []}
      onAgregarEquipo={vi.fn()} onQuitarEquipo={vi.fn()} onRenombrarEquipo={vi.fn()} onMoverAlEquipo={vi.fn()}
      golpesDe={i => (i == null ? null : Math.round(i))}
      rondasRecientes={[]} problema={null}
      onAtras={vi.fn()} onSiguiente={onSiguiente}
    />
  )
}

const revisar = () => screen.getByRole('button', { name: /Revisar/ }) as HTMLButtonElement
const indiceRival = () => document.getElementById('rival-0-indice') as HTMLInputElement
const aviso = () => document.getElementById('paso-jugadores-aviso') as HTMLElement

describe('PasoJugadores — un índice inválido o a medio escribir no deja avanzar', () => {
  it('con "1O" en el rival, "Revisar" no avanza y dice por qué; al corregirlo, avanza', () => {
    const onSiguiente = vi.fn()
    render(<Paso onSiguiente={onSiguiente} />)
    expect(revisar().disabled).toBe(false)
    fireEvent.change(indiceRival(), { target: { value: '1O' } })
    expect(revisar().disabled).toBe(true)
    fireEvent.click(revisar())
    expect(onSiguiente).not.toHaveBeenCalled()
    expect(aviso().textContent).toBe('Revisa el índice de Pedro: escribe un número (12.4, o +2 si es plus) o déjalo vacío.')
    expect(aviso().getAttribute('role')).toBe('status')
    expect(revisar().getAttribute('aria-describedby')).toBe('paso-jugadores-aviso')
    expect(indiceRival().getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(indiceRival(), { target: { value: '10' } })
    expect(revisar().disabled).toBe(false)
    fireEvent.click(revisar())
    expect(onSiguiente).toHaveBeenCalledTimes(1)
  })

  it('"+" a medio escribir en el creador también bloquea, con el aviso bajo el botón', () => {
    render(<Paso onSiguiente={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Índice', { selector: '#indice-creador' }), { target: { value: '+' } })
    expect(revisar().disabled).toBe(true)
    expect(aviso().textContent).toBe('Revisa tu índice: escribe un número (12.4, o +2 si es plus) o déjalo vacío.')
  })

  it('un rival sin nombre se nombra "Jugador N"', () => {
    render(<Paso onSiguiente={vi.fn()} rivalesIniciales={[{ ...RIVAL, nombre: '' }]} />)
    fireEvent.change(indiceRival(), { target: { value: '1O' } })
    expect(aviso().textContent).toMatch(/^Revisa el índice de Jugador 1:/)
  })

  it('el aviso está siempre montado (vacío sin problema) para que el lector de pantalla lo anuncie', () => {
    render(<Paso onSiguiente={vi.fn()} />)
    expect(aviso().textContent).toBe('')
    expect(revisar().getAttribute('aria-describedby')).toBeNull()
  })

  it('modo equipos: bloquear el índice de un compañero y quitarlo libera el paso', () => {
    render(<Paso onSiguiente={vi.fn()} equipos />)
    expect(revisar().disabled).toBe(false)
    fireEvent.change(indiceRival(), { target: { value: '+' } })
    expect(revisar().disabled).toBe(true)
    expect(aviso().textContent).toMatch(/^Revisa el índice de Pedro:/)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Pedro' }))
    expect(revisar().disabled).toBe(false)
    expect(aviso().textContent).toBe('')
  })

  it('quitar al rival con el índice inválido destraba el paso', () => {
    render(<Paso onSiguiente={vi.fn()} />)
    fireEvent.change(indiceRival(), { target: { value: 'abc' } })
    expect(revisar().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Quitar/ }))
    expect(revisar().disabled).toBe(false)
  })
})
