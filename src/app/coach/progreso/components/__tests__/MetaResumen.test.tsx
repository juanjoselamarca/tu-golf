import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MetaResumen } from '../MetaResumen'

describe('MetaResumen — distancia a la meta', () => {
  it('sin hándicap actual no dice que está en la meta ni cuánto falta', () => {
    const { container } = render(<MetaResumen currentHandicap={null} targetHandicap={12} targetDeadline={null} />)
    expect(container.textContent).not.toContain('Estás en tu meta.')
    expect(container.textContent).not.toContain('puntos para tu objetivo')
  })

  it('sin hándicap actual y con plazo muestra sólo el plazo', () => {
    const { container } = render(<MetaResumen currentHandicap={null} targetHandicap={12} targetDeadline="2027-03-01" />)
    expect(container.textContent).toContain('antes de')
    expect(container.textContent).not.toContain('Estás en tu meta.')
  })

  it('sobre la meta muestra los puntos que faltan', () => {
    const { container } = render(<MetaResumen currentHandicap={15.3} targetHandicap={12} targetDeadline={null} />)
    expect(container.textContent).toContain('3.3 puntos para tu objetivo')
    expect(container.textContent).not.toContain('Estás en tu meta.')
  })

  it.each([12, 11.4, 12.04])('con %s y meta 12 está en la meta', hcp => {
    const { container } = render(<MetaResumen currentHandicap={hcp} targetHandicap={12} targetDeadline={null} />)
    expect(container.textContent).toContain('Estás en tu meta.')
  })

  it('la distancia sale de los valores que se muestran', () => {
    const { container } = render(<MetaResumen currentHandicap={12.36} targetHandicap={12.24} targetDeadline={null} />)
    expect(container.textContent).toContain('0.2 puntos para tu objetivo')
  })
})
