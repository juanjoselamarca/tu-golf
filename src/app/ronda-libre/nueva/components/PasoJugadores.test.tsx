// @vitest-environment jsdom
// Un índice a medio escribir ("+") o que no es número ("1O") le llega al formulario como `null` (= sin índice):
// sin este bloqueo, "Revisar →" avanzaba y la ronda se creaba con ese jugador sin índice.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { PasoJugadores } from './PasoJugadores'
import { ID_DEL_CREADOR, type EquipoDeLaRonda, type RivalDelCreador } from '../hooks/useFormularioDeRonda'

vi.mock('../hooks/usePlayerSearch', () => ({
  usePlayerSearch: () => ({ results: [], searching: false, open: false, dismiss: vi.fn(), containerRef: { current: null } }),
}))

const RIVAL: RivalDelCreador = { id: 'r1', tipo: 'invitado', nombre: 'Pedro', telefono: '', handicap: 10, tees: null, profileId: null }

function Paso({ onSiguiente, equipos = false, rivalesIniciales = [RIVAL], repartoDeEquipos }: {
  onSiguiente: () => void
  equipos?: boolean
  rivalesIniciales?: RivalDelCreador[]
  /** Equipos fijos; si no, uno solo con todos. */
  repartoDeEquipos?: EquipoDeLaRonda[]
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
      equipos={equipos ? repartoDeEquipos ?? [{ nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR, ...rivales.map(r => r.id)] }] : []}
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
    const creador = () => screen.getByLabelText('Índice', { selector: '#indice-creador' }) as HTMLInputElement
    expect(creador().style.boxShadow).toBe('')
    fireEvent.change(creador(), { target: { value: '+' } })
    expect(revisar().disabled).toBe(true)
    expect(aviso().textContent).toBe('Revisa tu índice: escribe un número (12.4, o +2 si es plus) o déjalo vacío.')
    // Sin aviso propio (no es "abc"): el campo apunta al aviso del paso y se marca con el borde de error.
    expect(creador().getAttribute('aria-describedby')).toBe('paso-jugadores-aviso')
    expect(creador().style.boxShadow).toContain('var(--error-fg)')
    fireEvent.change(creador(), { target: { value: '+2' } })
    expect(creador().getAttribute('aria-describedby')).toBeNull()
    expect(creador().style.boxShadow).toBe('')
  })

  it('un rival sin nombre se nombra "Jugador N" con su número en pantalla (el creador es la tarjeta 1)', () => {
    render(<Paso onSiguiente={vi.fn()} rivalesIniciales={[{ ...RIVAL, nombre: '' }]} />)
    fireEvent.change(indiceRival(), { target: { value: '1O' } })
    expect(aviso().textContent).toMatch(/^Revisa el índice de Jugador 2:/)
    // "1O" tiene aviso propio bajo el campo: ese es el que lo describe, no el del paso.
    expect(indiceRival().getAttribute('aria-describedby')).not.toBe('paso-jugadores-aviso')
    expect(indiceRival().style.boxShadow).toContain('var(--error-fg)')
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
  describe('un solo número por jugador: su posición en pantalla', () => {
    const SIN_NOMBRE = (id: string): RivalDelCreador => ({ ...RIVAL, id, nombre: '' })

    it('best ball con r0 en el Equipo 2 y r1 en el Equipo 1: el aviso, la etiqueta y "Quitar a…" dicen el mismo número', () => {
      render(
        <Paso onSiguiente={vi.fn()} equipos rivalesIniciales={[SIN_NOMBRE('r0'), SIN_NOMBRE('r1')]}
          repartoDeEquipos={[
            { nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR, 'r1'] },
            { nombre: 'Equipo 2', miembros: ['r0'] },
          ]} />,
      )
      // En pantalla: Ana (1), r1 (2) en el Equipo 1; r0 (3) en el Equipo 2.
      expect(screen.getByLabelText('Nombre del jugador 3').id).toBe('rival-0-nombre')
      expect(screen.getByLabelText('Nombre del jugador 2').id).toBe('rival-1-nombre')
      fireEvent.change(indiceRival(), { target: { value: '+' } })
      expect(revisar().disabled).toBe(true)
      expect(aviso().textContent).toMatch(/^Revisa el índice de Jugador 3:/)
      expect(screen.getByRole('button', { name: 'Quitar a Jugador 3' })).toBeTruthy()
      expect(screen.getByRole('textbox', { name: 'Teléfono de Jugador 3' })).toBeTruthy()
    })

    it('con el creador en el Equipo 2, el primero que bloquea es el de arriba en pantalla, no el creador', () => {
      render(
        <Paso onSiguiente={vi.fn()} equipos rivalesIniciales={[SIN_NOMBRE('r0')]}
          repartoDeEquipos={[
            { nombre: 'Equipo 1', miembros: ['r0'] },
            { nombre: 'Equipo 2', miembros: [ID_DEL_CREADOR] },
          ]} />,
      )
      expect(screen.getByLabelText('Nombre del jugador 1').id).toBe('rival-0-nombre')
      fireEvent.change(screen.getByLabelText('Índice', { selector: '#indice-creador' }), { target: { value: '+' } })
      expect(aviso().textContent).toMatch(/^Revisa tu índice:/)
      fireEvent.change(indiceRival(), { target: { value: '+' } })
      expect(aviso().textContent).toMatch(/^Revisa el índice de Jugador 1:/)
    })
  })
})
