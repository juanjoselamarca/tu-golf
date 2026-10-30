import { describe, it, expect } from 'vitest'
import {
  TEES_MODE_KEYS,
  esModoDeTees,
  etiquetaDeTeesDelTorneo,
  ETIQUETA_MODO_DE_TEES,
} from './tournament-tees-mode'

describe('esModoDeTees', () => {
  it('reconoce los modos que escribe el wizard', () => {
    expect(esModoDeTees('per_player')).toBe(true)
    expect(esModoDeTees('manual')).toBe(true)
    expect(esModoDeTees('mixed')).toBe(true)
  })

  it('reconoce per_category (histórico: deriveTees ya no lo escribe)', () => {
    expect(esModoDeTees('per_category')).toBe(true)
  })

  it('un nombre de tee NO es un modo', () => {
    for (const tee of ['blanco', 'azul', 'negras', 'dorado', 'rojo', 'azul · norte / sur']) {
      expect(esModoDeTees(tee), tee).toBe(false)
    }
  })

  it('tolera espacios y mayúsculas (la columna es texto libre)', () => {
    expect(esModoDeTees('  Per_Player ')).toBe(true)
    expect(esModoDeTees('MANUAL')).toBe(true)
  })

  it('null, undefined y vacío no son un modo', () => {
    expect(esModoDeTees(null)).toBe(false)
    expect(esModoDeTees(undefined)).toBe(false)
    expect(esModoDeTees('')).toBe(false)
    expect(esModoDeTees('   ')).toBe(false)
  })

  it('no se cuelga de un valor raro que parezca un modo', () => {
    expect(esModoDeTees('per_playerx')).toBe(false)
    expect(esModoDeTees('tee manual')).toBe(false)
  })
})

describe('etiquetaDeTeesDelTorneo', () => {
  it('traduce cada modo', () => {
    expect(etiquetaDeTeesDelTorneo('per_player')).toBe('por jugador')
    expect(etiquetaDeTeesDelTorneo('per_category')).toBe('por categoría')
    expect(etiquetaDeTeesDelTorneo('manual')).toBe('asignación manual')
    expect(etiquetaDeTeesDelTorneo('mixed')).toBe('mixtos')
  })

  it('un nombre de tee sale con mayúscula inicial', () => {
    expect(etiquetaDeTeesDelTorneo('blanco')).toBe('Blanco')
    expect(etiquetaDeTeesDelTorneo('dorado')).toBe('Dorado')
  })

  it('hay etiqueta para TODOS los modos (no queda ninguno sin traducir)', () => {
    for (const k of TEES_MODE_KEYS) {
      expect(ETIQUETA_MODO_DE_TEES[k], k).toBeTruthy()
      expect(etiquetaDeTeesDelTorneo(k), k).toBe(ETIQUETA_MODO_DE_TEES[k])
    }
  })
})
