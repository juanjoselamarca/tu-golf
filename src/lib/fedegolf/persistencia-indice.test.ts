import { describe, it, expect } from 'vitest'
import { ultimoCambioReciente, AVISO_CAMBIO_INDICE_MS } from './persistencia-indice'

const AHORA = new Date('2026-10-19T12:00:00Z').getTime()
const hace = (ms: number) => new Date(AHORA - ms).toISOString()

describe('ultimoCambioReciente', () => {
  it('dos filas distintas y recientes → cambio', () => {
    expect(
      ultimoCambioReciente([{ indice: 8.1, fecha: hace(3_600_000) }, { indice: 8.3, fecha: hace(9e8) }], AHORA),
    ).toEqual({ indice: 8.1, anterior: 8.3, fecha: hace(3_600_000) })
  })

  it('una sola fila (primera vinculación) → no es un cambio', () => {
    expect(ultimoCambioReciente([{ indice: 8.1, fecha: hace(1000) }], AHORA)).toBeNull()
  })

  it('sin filas → null', () => expect(ultimoCambioReciente([], AHORA)).toBeNull())

  it('cambio más viejo que la ventana → no se avisa (primer deploy no despierta cambios de hace meses)', () => {
    expect(
      ultimoCambioReciente([{ indice: 8.1, fecha: hace(AVISO_CAMBIO_INDICE_MS + 1) }, { indice: 8.3, fecha: hace(9e9) }], AHORA),
    ).toBeNull()
  })

  it('filas iguales (historial duplicado heredado) → null', () => {
    expect(ultimoCambioReciente([{ indice: 8.1, fecha: hace(1000) }, { indice: 8.1, fecha: hace(2000) }], AHORA)).toBeNull()
  })

  it('numeric que llega como string desde PostgREST → se compara como número', () => {
    const filas = [{ indice: '8.1', fecha: hace(1000) }, { indice: '8.30', fecha: hace(2000) }] as unknown as { indice: number; fecha: string }[]
    expect(ultimoCambioReciente(filas, AHORA)).toEqual({ indice: 8.1, anterior: 8.3, fecha: hace(1000) })
  })
})
