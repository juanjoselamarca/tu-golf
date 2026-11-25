import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AvisoDeRepetir } from './AvisoDeRepetir'

describe('AvisoDeRepetir', () => {
  it('confirmando el Skins: el control dice «Cancelar el Skins» (texto y nombre accesible), no hay X que cancele callada', () => {
    const onCancelarSkins = vi.fn()
    const onDescartar = vi.fn()
    render(<AvisoDeRepetir texto="Confirmando el Skins…" confirmando onCancelarSkins={onCancelarSkins} onDescartar={onDescartar} />)
    expect(screen.queryByRole('button', { name: 'Descartar aviso' })).toBeNull()
    const cancelar = screen.getByRole('button', { name: 'Cancelar el Skins' })
    expect(cancelar.textContent).toBe('Cancelar el Skins')
    expect(parseInt(cancelar.style.minHeight)).toBeGreaterThanOrEqual(44)
    fireEvent.click(cancelar)
    expect(onCancelarSkins).toHaveBeenCalledTimes(1)
    expect(onDescartar).not.toHaveBeenCalled()
  })

  it('aviso ya resuelto («no se pudo»): la X solo cierra el aviso', () => {
    const onCancelarSkins = vi.fn()
    const onDescartar = vi.fn()
    render(
      <AvisoDeRepetir texto="No pudimos activar el Skins: la ronda se repite sin él." confirmando={false}
        onCancelarSkins={onCancelarSkins} onDescartar={onDescartar} />,
    )
    expect(screen.queryByRole('button', { name: 'Cancelar el Skins' })).toBeNull()
    const x = screen.getByRole('button', { name: 'Descartar aviso' })
    expect(parseInt(x.style.minWidth)).toBeGreaterThanOrEqual(44)
    fireEvent.click(x)
    expect(onDescartar).toHaveBeenCalledTimes(1)
    expect(onCancelarSkins).not.toHaveBeenCalled()
  })
})
