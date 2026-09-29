// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SyncChip, SyncProblemRow, SessionExpiredRow } from './DraftSyncStatus'
import { isInlineFieldPath } from '../section-keys'

afterEach(cleanup)

describe('SyncProblemRow', () => {
  it('la acción principal es corregir; descartar pide confirmación con el conteo', () => {
    const onDiscard = vi.fn()
    render(<SyncProblemRow message="Premio 1 · descripción: obligatorio" unsavedCount={2} onDiscard={onDiscard} />)
    expect(screen.getByRole('button', { name: 'Ir al campo' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Descartar 2 cambios' }))
    expect(onDiscard).not.toHaveBeenCalled()
    expect(screen.getByText(/¿Descartar 2 cambios\?/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('cancelar vuelve al mensaje sin descartar', () => {
    const onDiscard = vi.fn()
    render(<SyncProblemRow message="Falta el nombre" unsavedCount={1} onDiscard={onDiscard} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar 1 cambio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onDiscard).not.toHaveBeenCalled()
    expect(screen.getByText('Falta el nombre')).toBeTruthy()
  })

  it('"Ir al campo" enfoca el primer campo inválido', () => {
    render(
      <>
        <input aria-label="ok" />
        <input aria-label="malo" aria-invalid="true" />
        <SyncProblemRow message="x" unsavedCount={1} />
      </>,
    )
    const malo = screen.getByLabelText('malo')
    malo.scrollIntoView = vi.fn()
    fireEvent.click(screen.getByRole('button', { name: 'Ir al campo' }))
    expect(document.activeElement).toBe(malo)
  })
})

describe('SessionExpiredRow', () => {
  it('ofrece iniciar sesión y vuelve al mismo borrador', () => {
    render(<SessionExpiredRow draftId="d-1" />)
    const link = screen.getByRole('link', { name: 'Iniciar sesión' })
    expect(link.getAttribute('href')).toBe(`/login?next=${encodeURIComponent('/organizador/nuevo?draft=d-1')}`)
    expect(screen.getByText(/quedó guardado en este navegador/)).toBeTruthy()
  })
})

describe('SyncChip', () => {
  it('con campos por corregir no repite el rojo: dice "Sin guardar"', () => {
    render(<SyncChip status="invalid" pendingCount={0} />)
    expect(screen.getByText('Sin guardar')).toBeTruthy()
  })
  it('sin conexión cuenta los pendientes', () => {
    render(<SyncChip status="offline" pendingCount={3} />)
    expect(screen.getByText('Sin conexión · 3 pendientes')).toBeTruthy()
  })
})

describe('isInlineFieldPath', () => {
  it('reconoce campos con input propio, con índice en listas', () => {
    expect(isInlineFieldPath('prizes.0.description')).toBe(true)
    expect(isInlineFieldPath('categories.12.name')).toBe(true)
    expect(isInlineFieldPath('registration.max_players')).toBe(true)
    expect(isInlineFieldPath('name')).toBe(true)
  })
  it('lo que no tiene input propio va debajo de la sección', () => {
    expect(isInlineFieldPath('format')).toBe(false)
    expect(isInlineFieldPath('prizes.x.description')).toBe(false)
    expect(isInlineFieldPath('team_config.size')).toBe(false)
  })
})
