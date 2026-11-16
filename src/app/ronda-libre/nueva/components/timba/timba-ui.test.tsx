import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FilaTimbaLibre } from './FilaTimbaLibre'
import { ParejasDeLaTimba } from './ParejasDeLaTimba'
import { FraseDelJuego, renglonesConPuntuacion } from './FraseDelJuego'
import { fraseDelJuego } from './frase-del-juego'
import { timbaDePlantilla, type TimbaDelFormulario } from '../../hooks/timba-del-formulario'

describe('FilaTimbaLibre', () => {
  it('sin permiso: "Próximamente", aria-disabled y tocarla no hace nada ni abre avisos', () => {
    const onElegir = vi.fn()
    render(<FilaTimbaLibre puedeElegir={false} activa={false} onElegir={onElegir} />)
    const fila = screen.getByRole('button', { name: /^Timba libre/ })
    expect(fila.getAttribute('aria-disabled')).toBe('true')
    expect(fila.textContent).toContain('Próximamente')
    fireEvent.click(fila)
    expect(onElegir).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('la "i" abre el banner para todos, con el copy aprobado', () => {
    render(<FilaTimbaLibre puedeElegir={false} activa={false} onElegir={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver juegos de Timba libre' }))
    const banner = screen.getByRole('dialog', { name: 'Timba libre' })
    const t = banner.textContent ?? ''
    for (const texto of [
      'Próximamente', 'Tú anotas el score, la app lleva los puntos.', 'Colombiana / Hollywood',
      'Parejas que rotan cada 6 hoyos', '2-0-2', 'El mejor suma, el peor resta', 'La Subterránea',
      'Solo cuenta la peor bola', 'La Subterror', 'El peor del hoyo resta 1', 'Puntos especiales',
      'en cualquier juego', '+ Birdie', '+ Sandy', '+ Chipingo', '+ Greenie', 'Personalizado total',
      'Parejas, valores y puntos a tu pinta',
    ]) expect(t).toContain(texto)
    fireEvent.click(within(banner).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('con permiso: elegible y sin "Próximamente" (tampoco en el banner)', () => {
    const onElegir = vi.fn()
    render(<FilaTimbaLibre puedeElegir activa={false} onElegir={onElegir} />)
    const fila = screen.getByRole('button', { name: /^Timba libre/ })
    expect(fila.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(fila)
    expect(onElegir).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Ver juegos de Timba libre' }))
    expect(screen.getByRole('dialog').textContent).not.toContain('Próximamente')
  })
})

const jugadores = ['Yo', 'Ana', 'Beto', 'Caro'].map((nombre, i) => ({ id: `j${i}`, nombre, indice: 10 }))

describe('ParejasDeLaTimba', () => {
  it('parejas fijas: el creador elige compañero y se ve el duelo', () => {
    const onTimba = vi.fn()
    const { rerender } = render(
      <ParejasDeLaTimba timba={timbaDePlantilla('subterranea')} onTimba={onTimba} jugadores={jugadores} holes={18} />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Beto' }))
    const elegida: TimbaDelFormulario = onTimba.mock.calls[0][0]
    expect(elegida.companeroDelCreador).toBe('j2')
    rerender(<ParejasDeLaTimba timba={elegida} onTimba={onTimba} jugadores={jugadores} holes={18} />)
    expect(screen.getByText('Yo y Beto contra Ana y Caro')).toBeTruthy()
  })

  it('parejas que rotan: el sorteo muestra los tres tramos', () => {
    const onTimba = vi.fn()
    const { rerender } = render(
      <ParejasDeLaTimba timba={timbaDePlantilla('colombiana')} onTimba={onTimba} jugadores={jugadores} holes={18} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sortear parejas' }))
    const sorteada: TimbaDelFormulario = onTimba.mock.calls[0][0]
    rerender(<ParejasDeLaTimba timba={sorteada} onTimba={onTimba} jugadores={jugadores} holes={18} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Volver a sortear' })).toBeTruthy()
  })

  it('individual o con otra cantidad de jugadores: no pinta nada', () => {
    const { container, rerender } = render(
      <ParejasDeLaTimba timba={timbaDePlantilla('subterror')} onTimba={vi.fn()} jugadores={jugadores} holes={18} />,
    )
    expect(container.innerHTML).toBe('')
    rerender(<ParejasDeLaTimba timba={timbaDePlantilla('colombiana')} onTimba={vi.fn()} jugadores={jugadores.slice(0, 3)} holes={18} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('FraseDelJuego', () => {
  it('cada valor es un blanco de 44px y lleva pegada su puntuación (sin "." huérfano)', () => {
    const t = timbaDePlantilla('dos_cero_dos')
    render(<FraseDelJuego config={t.config} holes={18} onConfig={vi.fn()} />)
    const valores = screen.getAllByRole('button', { name: /Cambiar$/ })
    expect(valores.length).toBeGreaterThan(0)
    for (const b of valores) {
      expect(b.style.minHeight).toBe('44px')
      expect(b.style.display).toBe('inline-flex')
      expect(b.parentElement?.style.whiteSpace).toBe('nowrap')
    }
    const piezas = renglonesConPuntuacion(fraseDelJuego(t.config, 18))
    // Ningún texto que sigue a un valor empieza con puntuación: quedó pegada al valor.
    piezas.forEach((p, i) => {
      if (p.tipo === 'texto' && piezas[i - 1]?.tipo === 'valor') expect(p.texto).not.toMatch(/^[.,;:!?)]/)
    })
    expect(piezas.some(p => p.tipo === 'valor' && p.puntuacion !== '')).toBe(true)
  })
})

