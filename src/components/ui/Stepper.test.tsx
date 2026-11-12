// @vitest-environment jsdom
// Inbox 8a0b2270: en "Nueva Ronda" no se podía volver a una etapa tocándola en el stepper; había que apretar
// "Atrás" una vez por paso. Los pasos completados ahora son botones, y sólo esos: avanzar sigue exigiendo
// pasar por el "Siguiente" de cada paso, que es el que valida.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Stepper } from './Stepper'

const PASOS = ['Cancha', 'Formato', 'Jugadores', 'Confirmar']

describe('Stepper — volver a una etapa', () => {
  it('cada paso completado es un botón que vuelve a esa etapa', () => {
    const onVolverAPaso = vi.fn()
    render(<Stepper steps={4} current={3} labels={PASOS} onVolverAPaso={onVolverAPaso} />)

    fireEvent.click(screen.getByRole('button', { name: 'Volver a cancha' }))
    expect(onVolverAPaso).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Volver a formato' }))
    expect(onVolverAPaso).toHaveBeenCalledWith(2)
  })

  it('el paso actual y los pendientes no son botones (no se salta hacia adelante)', () => {
    render(<Stepper steps={4} current={2} labels={PASOS} onVolverAPaso={vi.fn()} />)

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /formato/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /jugadores/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /confirmar/i })).toBeNull()
  })

  it('en el primer paso no hay nada a qué volver', () => {
    render(<Stepper steps={4} current={1} labels={PASOS} onVolverAPaso={vi.fn()} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('con pasos navegables el contenedor es un grupo, no un progressbar (que anula a sus hijos para el lector)', () => {
    render(<Stepper steps={4} current={3} labels={PASOS} onVolverAPaso={vi.fn()} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('group', { name: 'Paso 3 de 4: Jugadores' })).toBeTruthy()
  })

  it('sin onVolverAPaso queda como antes: progressbar y sin botones', () => {
    render(<Stepper steps={4} current={3} labels={PASOS} />)
    const barra = screen.getByRole('progressbar', { name: 'Paso 3 de 4: Jugadores' })
    expect(barra.getAttribute('aria-valuenow')).toBe('3')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('el paso actual se marca con aria-current="step"', () => {
    const { container } = render(<Stepper steps={4} current={3} labels={PASOS} onVolverAPaso={vi.fn()} />)
    const actuales = container.querySelectorAll('[aria-current="step"]')
    expect(actuales).toHaveLength(1)
    expect(actuales[0].textContent).toBe('3')
  })
})
