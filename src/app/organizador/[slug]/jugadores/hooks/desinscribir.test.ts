import { describe, it, expect, vi } from 'vitest'
import { desinscribir } from './desinscribir'

const grupoSinTarjeta = { ronda_libre_id: null }
const grupoConTarjeta = { ronda_libre_id: 'ronda-1' }

function caso(opts: { retirado: boolean; status: string; grupos: Array<{ ronda_libre_id: string | null }> }) {
  const retirar = vi.fn(async () => opts.retirado)
  const rebalancear = vi.fn(async () => true)
  const run = () => desinscribir({ playerId: 'p1', status: opts.status, grupos: opts.grupos, retirar, rebalancear })
  return { retirar, rebalancear, run }
}

describe('desinscribir (#810)', () => {
  it('antes del inicio: saca de la inscripción y rebalancea los grupos, como siempre', async () => {
    const c = caso({ retirado: true, status: 'open', grupos: [grupoSinTarjeta] })
    await c.run()
    expect(c.retirar).toHaveBeenCalledWith('p1')
    expect(c.rebalancear).toHaveBeenCalledWith('p1')
  })

  it('WD con el torneo en juego: el retirado se queda en su grupo y no se mueve a nadie', async () => {
    const c = caso({ retirado: true, status: 'in_progress', grupos: [grupoConTarjeta] })
    await c.run()
    expect(c.retirar).toHaveBeenCalledWith('p1')
    expect(c.rebalancear).not.toHaveBeenCalled()
  })

  it('pestaña vieja que todavía lee "open" pero el grupo ya tiene tarjeta: no toca los grupos', async () => {
    const c = caso({ retirado: true, status: 'open', grupos: [grupoConTarjeta] })
    await c.run()
    expect(c.rebalancear).not.toHaveBeenCalled()
  })

  it('WD cancelado o fallido: no pasa nada con los grupos', async () => {
    for (const status of ['open', 'in_progress']) {
      const c = caso({ retirado: false, status, grupos: [grupoSinTarjeta] })
      await c.run()
      expect(c.rebalancear).not.toHaveBeenCalled()
    }
  })

  it('sin grupos armados no rebalancea', async () => {
    const c = caso({ retirado: true, status: 'open', grupos: [] })
    await c.run()
    expect(c.rebalancear).not.toHaveBeenCalled()
  })
})
