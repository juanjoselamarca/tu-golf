import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { FilaSkins } from './FilaSkins'
import { ArmarSkins } from './ArmarSkins'
import { MENSAJE_POZO_TOPE } from './PozoPorJugador'
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

  it('pozo sobre el techo (escrito o pegado): no entra y dice el máximo; un monto válido lo quita', () => {
    const { onSkins } = armar({ skins: { ...skinsPorDefecto(), pozoPorJugador: 20000 } })
    const campo = screen.getByLabelText('Pozo por jugador') as HTMLInputElement
    fireEvent.change(campo, { target: { value: '99.999.999' } })
    expect(onSkins).not.toHaveBeenCalled()
    expect(campo.value).toBe('20.000')
    expect(screen.getByRole('status').textContent).toBe(MENSAJE_POZO_TOPE)
    expect(MENSAJE_POZO_TOPE).toContain('$5.000.000')
    fireEvent.change(campo, { target: { value: '30.000' } })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('editar el pozo por el medio deja el cursor tras el mismo dígito aunque se mueva el punto de miles', () => {
    function Controlado() {
      const [skins, setSkins] = useState({ ...skinsPorDefecto(), pozoPorJugador: 10000 })
      return <ArmarSkins skins={skins} onSkins={setSkins} modo="neto" onModo={() => {}} holes={18} />
    }
    /** Como el navegador: el texto nuevo y el cursor ya puestos cuando llega el evento (setter nativo: React lo ve). */
    const teclear = (el: HTMLInputElement, valor: string, cursor: number) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valor)
      el.setSelectionRange(cursor, cursor)
      fireEvent.input(el)
    }
    render(<Controlado />)
    const campo = screen.getByLabelText('Pozo por jugador') as HTMLInputElement
    campo.focus()
    // «10.000» → se escribe un 5 tras el 1: «150.000» con el cursor tras el 5 (posición 2).
    teclear(campo, '150.000', 2)
    expect(campo.value).toBe('150.000')
    expect(campo.selectionStart).toBe(2)
    // «150.000» → «1500.000» tras el 0 (pos 4): queda «1.500.000», el cursor tras el 4º dígito (pos 5).
    teclear(campo, '1500.000', 4)
    expect(campo.value).toBe('1.500.000')
    expect(campo.selectionStart).toBe(5)
    // Retroceso sobre el punto de miles: «1.|500.000» → «1500.000», el mismo monto; el cursor queda tras el 1.
    teclear(campo, '1500.000', 1)
    expect(campo.value).toBe('1.500.000')
    expect(campo.selectionStart).toBe(1)
  })

  it('el aviso del tope se va al salir del campo y con un monto válido', () => {
    armar({ skins: { ...skinsPorDefecto(), pozoPorJugador: 20000 } })
    const campo = screen.getByLabelText('Pozo por jugador') as HTMLInputElement
    fireEvent.change(campo, { target: { value: '99.999.999' } })
    expect(screen.getByRole('status').textContent).toBe(MENSAJE_POZO_TOPE)
    fireEvent.blur(campo)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('validación: par neto en neto, par en gross; puntos «del pozo» solo si hay pozo', () => {
    armar({ modo: 'gross' })
    expect(document.body.textContent).toContain('hace par o mejor en el siguiente')
    expect(document.body.textContent).not.toContain('par neto')
    expect(document.body.textContent).toContain('Cada uno vale 1 skin.')
    cleanup()
    armar({ skins: { ...skinsPorDefecto(), pozoPorJugador: 5000 } })
    expect(document.body.textContent).toContain('hace par neto o mejor en el siguiente')
    expect(document.body.textContent).toContain('Cada uno vale 1 skin del pozo.')
  })

  it('los seis porcentajes en una grilla de 3 columnas iguales', () => {
    armar()
    const grilla = screen.getByRole('button', { name: '100 %' }).parentElement as HTMLElement
    expect(grilla.style.display).toBe('grid')
    expect(grilla.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')
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

  it('lectura fallida: «Reintentar» (≥ 44 px) dentro del aviso, y lo llama', () => {
    const onReintentar = vi.fn()
    render(
      <ResumenSkins
        skins={skinsPorDefecto()} modo="neto" jugadores={2} onReintentar={onReintentar}
        problema={{ titulo: 'Revisa el skins', detalle: 'Revisa tu señal e intenta de nuevo.', esError: true }}
      />,
    )
    const boton = within(screen.getByRole('alert')).getByRole('button', { name: 'Reintentar' })
    expect(parseInt(boton.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
    fireEvent.click(boton)
    expect(onReintentar).toHaveBeenCalledTimes(1)
  })

  it('mientras calcula no muestra un bloqueo', () => {
    render(<ResumenSkins skins={skinsPorDefecto()} modo="gross" jugadores={2} problema={PROBLEMA_SKINS_CARGANDO} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).toContain('Sin plata')
  })
})
