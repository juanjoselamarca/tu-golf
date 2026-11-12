// Revisión del inbox 8a0b2270: el stepper de Nueva Ronda deja volver a una etapa hecha, salvo con la ronda
// creándose (la pantalla de compartir lee el formulario vivo y mostraría otra ronda). La página usa esta función:
// si alguien la simplifica a "siempre navegable", este test cae.
import { describe, it, expect, vi } from 'vitest'
import { volverDeEtapa } from './useFormularioDeRonda'

describe('volverDeEtapa', () => {
  it('con la ronda creándose el stepper no es navegable', () => {
    expect(volverDeEtapa(true, vi.fn())).toBeUndefined()
  })

  it('sin crear, tocar una etapa vuelve a ella', () => {
    const setPaso = vi.fn()
    volverDeEtapa(false, setPaso)!(1)
    expect(setPaso).toHaveBeenCalledWith(1)
  })
})
