import { describe, it, expect } from 'vitest'
import { esRondaCerrada, RONDA_NO_EXISTE } from './ronda-libre-estado'

// Misma semántica que el RPC `upsert_ronda_libre_scores` (estado <> 'en_curso' → P0002): cualquier
// estado que no sea en curso deja de aceptar golpes. "No existe" y "no se pudo leer" no son cerrada.
describe('esRondaCerrada', () => {
  it.each(['finalizada', 'cancelada', 'abandonada'])('%s: cerrada', (estado) => {
    expect(esRondaCerrada(estado)).toBe(true)
  })
  it.each(['en_curso', RONDA_NO_EXISTE, null, undefined])('%s: no cerrada', (estado) => {
    expect(esRondaCerrada(estado)).toBe(false)
  })
})
