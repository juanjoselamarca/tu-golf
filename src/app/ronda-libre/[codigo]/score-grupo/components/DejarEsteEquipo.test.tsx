import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DejarEsteEquipo } from './DejarEsteEquipo'

const equipo = { id: 'e2', nombre: 'Los Pumas' }

describe('DejarEsteEquipo', () => {
  it('pide confirmación con el nombre del creador; solo «Dejar» suelta el equipo', () => {
    const onDejar = vi.fn()
    render(<DejarEsteEquipo equipo={equipo} nombreCreador="Juanjo" enCurso={null} onDejar={onDejar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dejar este equipo' }))
    expect(onDejar).not.toHaveBeenCalled()
    expect(screen.getByText('¿Dejar Los Pumas?')).toBeTruthy()
    expect(screen.getByText('Lo vuelve a anotar Juanjo. Lo que ya subiste queda guardado.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dejar' }))
    expect(onDejar).toHaveBeenCalledWith('e2', 'Los Pumas')
  })

  it('«Cancelar» no suelta nada; sin nombre del creador: «quien creó la ronda»', () => {
    const onDejar = vi.fn()
    render(<DejarEsteEquipo equipo={equipo} nombreCreador={null} enCurso={null} onDejar={onDejar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dejar este equipo' }))
    expect(screen.getByText('Lo vuelve a anotar quien creó la ronda. Lo que ya subiste queda guardado.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onDejar).not.toHaveBeenCalled()
  })

  it('con un pedido en vuelo no acepta otro toque', () => {
    render(<DejarEsteEquipo equipo={equipo} nombreCreador="Juanjo" enCurso="e2" onDejar={vi.fn()} />)
    const boton = screen.getByRole('button', { name: 'Dejando…' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
  })
})
