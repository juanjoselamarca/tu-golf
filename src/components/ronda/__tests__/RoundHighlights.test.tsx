import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoundHighlights } from '../RoundHighlights'
import { HoyosEstimados } from '../HoyosEstimados'
import { computeHighlights } from '@/lib/ronda/round-highlights'

vi.mock('next/link', () => ({ default: ({ children, href, ...p }: { children: React.ReactNode; href: string }) => <a href={href} {...p}>{children}</a> }))

const par9desde10: Record<number, number> = { 10: 4, 11: 4, 12: 3, 13: 5, 14: 4, 15: 4, 16: 3, 17: 5, 18: 4 }
const hoyos10a18 = [10, 11, 12, 13, 14, 15, 16, 17, 18]

describe('RoundHighlights', () => {
  it('ronda de 9 desde el 10: suma los hoyos 10..18 (antes mostraba "—")', () => {
    const scores = Object.fromEntries(hoyos10a18.map(h => [h, par9desde10[h]]))
    const data = computeHighlights(scores, par9desde10, 9, hoyos10a18)
    render(<RoundHighlights data={data} scores={scores} parMap={par9desde10} totalHoles={9} hoyos={hoyos10a18} />)
    expect(screen.getAllByText('36').length).toBeGreaterThan(0)
    expect(screen.getByText('Hoyos 10–18')).toBeTruthy()
  })

  it('marca los hoyos estimados (forma, no sólo color) y los cuenta en el total', () => {
    const par = { 1: 4, 2: 4, 3: 4 }
    const scores = { 1: 4, 2: 5, 3: 4 }
    const data = computeHighlights({ 1: 4, 3: 4 }, par, 3)
    const { container } = render(<RoundHighlights data={data} scores={scores} parMap={par} totalHoles={3} hoyosEstimados={[2]} />)
    expect(screen.getByText('1 hoyo estimado (regla WHS)')).toBeTruthy()
    expect(container.querySelector('[title="Hoyo 2: estimado"]')).toBeTruthy()
    expect(screen.getAllByText('13').length).toBeGreaterThan(0)
  })
})

describe('HoyosEstimados', () => {
  const base = {
    estimados: [{ hoyo: 2, motivo: 'concedido' as const }, { hoyo: 9, motivo: 'no_jugado' as const }],
    scores: { 2: 6, 9: 4 }, parMap: { 2: 4, 9: 4 }, correcciones: {},
  }

  it('editable: stepper de 44px que corrige con un golpe más / menos', () => {
    const onCorregir = vi.fn()
    render(<HoyosEstimados {...base} editable onCorregir={onCorregir} historialHref={null} />)
    expect(screen.getByText('2 hoyos estimados')).toBeTruthy()
    expect(screen.getByText('Lo concediste')).toBeTruthy()
    expect(screen.getByText('Sin jugar · match decidido')).toBeTruthy()
    const menos = screen.getByRole('button', { name: 'Un golpe menos en el hoyo 2' })
    expect(menos.style.width).toBe('44px')
    fireEvent.click(menos)
    expect(onCorregir).toHaveBeenCalledWith(2, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Un golpe más en el hoyo 9' }))
    expect(onCorregir).toHaveBeenCalledWith(9, 5)
  })

  it('ya guardada: sin stepper, con enlace para corregir en el historial', () => {
    render(<HoyosEstimados {...base} editable={false} onCorregir={vi.fn()} historialHref="/perfil/historial" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('link', { name: 'Corregir en mi historial' }).getAttribute('href')).toBe('/perfil/historial')
  })

  it('un hoyo corregido se muestra como corregido', () => {
    render(<HoyosEstimados {...base} correcciones={{ 2: 5 }} scores={{ 2: 5, 9: 4 }} editable onCorregir={vi.fn()} historialHref={null} />)
    expect(screen.getByText('Corregido por ti')).toBeTruthy()
  })

  it('sin estimados no renderiza nada', () => {
    const { container } = render(<HoyosEstimados {...base} estimados={[]} editable onCorregir={vi.fn()} historialHref={null} />)
    expect(container.firstChild).toBeNull()
  })
})
