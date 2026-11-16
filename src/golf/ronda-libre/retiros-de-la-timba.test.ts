import { describe, it, expect } from 'vitest'
import { retirosQueFaltanEnLaVista, retirosVigentes } from './retiros-de-la-timba'

describe('retiros confirmados en el teléfono', () => {
  it('sin vista (GET /juego falló) el retiro confirmado igual vale', () => {
    expect(retirosVigentes({}, { tomas: 14 })).toEqual({ tomas: 14 })
  })
  it('un retiro deshecho en el teléfono saca al jugador aunque la vista vieja lo traiga', () => {
    expect(retirosVigentes({ tomas: 14, pedro: 3 }, { tomas: null })).toEqual({ pedro: 3 })
  })
  it('el del teléfono manda sobre el de la vista si difieren (vista pedida antes)', () => {
    expect(retirosVigentes({ tomas: 16 }, { tomas: 14 })).toEqual({ tomas: 14 })
  })
  it('se olvidan los que la vista ya refleja, y solo esos', () => {
    expect(retirosQueFaltanEnLaVista({ tomas: 14 }, { tomas: 14, pedro: 3, diego: null })).toEqual({ pedro: 3 })
    expect(retirosQueFaltanEnLaVista({ diego: 2 }, { diego: null })).toEqual({ diego: null })
  })
})
