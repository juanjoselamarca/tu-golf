import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FilaSkins } from './FilaSkins'
import { ArmarSkins } from './ArmarSkins'
import { ResumenSkins } from './ResumenSkins'
import { skinsPorDefecto, PROBLEMA_SKINS_CARGANDO } from '../../hooks/skins-del-formulario'
import { FilaTimbaLibre } from '../timba/FilaTimbaLibre'

describe('FilaSkins (candado)', () => {
  it('sin permiso: "Próximamente", aria-disabled y tocarla no hace nada', () => {
    const onElegir = vi.fn()
    render(<FilaSkins puedeElegir={false} activa={false} onElegir={onElegir} />)
    const fila = screen.getByRole('button', { name: /^Skins/ })
    expect(fila.getAttribute('aria-disabled')).toBe('true')
    expect(fila.textContent).toContain('Próximamente')
    fireEvent.click(fila)
    expect(onElegir).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('el mismo candado que la Timba (misma marca y mismo bloqueo)', () => {
    render(<>
      <FilaTimbaLibre puedeElegir={false} activa={false} onElegir={vi.fn()} />
      <FilaSkins puedeElegir={false} activa={false} onElegir={vi.fn()} />
    </>)
    const timba = screen.getByRole('button', { name: /^Timba libre/ })
    const skins = screen.getByRole('button', { name: /^Skins/ })
    expect(timba.getAttribute('style')).toBe(skins.getAttribute('style'))
    expect(timba.getAttribute('aria-disabled')).toBe(skins.getAttribute('aria-disabled'))
  })

  it('la "i" explica el juego a todos; con permiso, elegible y sin "Próximamente"', () => {
    const onElegir = vi.fn()
    const { rerender } = render(<FilaSkins puedeElegir={false} activa={false} onElegir={onElegir} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cómo se juega Skins' }))
    const banner = screen.getByRole('dialog', { name: 'Skins' })
    expect(banner.textContent).toContain('Si empatan, nadie lo gana')
    expect(banner.textContent).toContain('Próximamente')
    fireEvent.click(within(banner).getByRole('button', { name: 'Cerrar' }))

    rerender(<FilaSkins puedeElegir activa={false} onElegir={onElegir} />)
    const fila = screen.getByRole('button', { name: /^Skins/ })
    expect(fila.getAttribute('aria-disabled')).toBeNull()
    expect(fila.textContent).not.toContain('Próximamente')
    fireEvent.click(fila)
    expect(onElegir).toHaveBeenCalledOnce()
  })
})

describe('ArmarSkins', () => {
  const armar = (over: Partial<Parameters<typeof ArmarSkins>[0]> = {}) => {
    const onSkins = vi.fn()
    const onModo = vi.fn()
    render(<ArmarSkins skins={skinsPorDefecto()} onSkins={onSkins} modo="neto" onModo={onModo} holes={18} {...over} />)
    return { onSkins, onModo }
  }

  it('una línea de explicación por perilla, con el copy del spec', () => {
    armar()
    const t = document.body.textContent ?? ''
    for (const texto of ['18 hoyos', 'Pozo por jugador', 'Si empatan el último hoyo', 'Validación', '% de hándicap', 'Puntos especiales']) {
      expect(t).toContain(texto)
    }
  })

  it('% de hándicap solo en neto', () => {
    armar({ modo: 'gross' })
    expect(screen.queryByRole('group', { name: '% de hándicap' })).toBeNull()
  })

  it('cada perilla cambia la config', () => {
    const { onSkins, onModo } = armar()
    fireEvent.click(screen.getByRole('button', { name: 'Gross' }))
    expect(onModo).toHaveBeenCalledWith('gross')
    fireEvent.click(screen.getByRole('button', { name: 'Se pierde' }))
    expect(onSkins.mock.lastCall?.[0].empateUltimoHoyo).toBe('se_pierde')
    fireEvent.click(screen.getByRole('switch', { name: 'Validación' }))
    expect(onSkins.mock.lastCall?.[0].validacion).toBe(true)
    fireEvent.change(screen.getByLabelText('Pozo por jugador'), { target: { value: '20.000' } })
    expect(onSkins.mock.lastCall?.[0].pozoPorJugador).toBe(20000)
    fireEvent.click(screen.getByRole('button', { name: '80 %' }))
    expect(onSkins.mock.lastCall?.[0].hcpPct).toBe(80)
  })

  it('el pozo se ve con miles chilenos', () => {
    armar({ skins: { ...skinsPorDefecto(), pozoPorJugador: 20000 } })
    expect((screen.getByLabelText('Pozo por jugador') as HTMLInputElement).value).toBe('20.000')
  })

  it('27 hoyos: lo dice en rojo, sin dejar avanzar acá', () => {
    armar({ holes: 27 })
    expect(document.body.textContent).toContain('Skins se juega en 18 o 9 hoyos')
  })
})

describe('ResumenSkins', () => {
  it('reglas y pozo total; un bloqueo se ve en grande', () => {
    render(<ResumenSkins
      skins={{ ...skinsPorDefecto(), pozoPorJugador: 10000 }} modo="neto" jugadores={4}
      problema={{ titulo: 'Revisa el skins', detalle: 'Ross no tiene hándicap.' }}
    />)
    const t = document.body.textContent ?? ''
    expect(t).toContain('Neto al 100 %')
    expect(t).toContain('$10.000 · $40.000 en total')
    expect(screen.getByRole('alert').textContent).toContain('Ross no tiene hándicap.')
  })

  it('mientras calcula no muestra un bloqueo', () => {
    render(<ResumenSkins skins={skinsPorDefecto()} modo="gross" jugadores={2} problema={PROBLEMA_SKINS_CARGANDO} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).toContain('Sin plata')
  })
})
