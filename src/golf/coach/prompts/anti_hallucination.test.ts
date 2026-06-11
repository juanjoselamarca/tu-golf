/**
 * Regresión del P0 de campo (inbox 2026-06-09): la versión previa del prompt
 * ORDENABA al coach pedirle datos al jugador y decir "algo quedó mal en el
 * sistema". Estos tests fijan el comportamiento nuevo: usar las tools primero,
 * nunca pedir lo que la app ya tiene, nunca culpar al sistema.
 */
import { describe, it, expect } from 'vitest'
import { ANTI_HALLUCINATION } from './anti_hallucination'

describe('ANTI_HALLUCINATION — manejo de datos sin pedirle al jugador', () => {
  it('instruye usar las tools de datos primero', () => {
    expect(ANTI_HALLUCINATION).toContain('get_course_scorecard')
    expect(ANTI_HALLUCINATION).toContain('find_rounds')
    expect(ANTI_HALLUCINATION).toMatch(/USÁ LAS TOOLS/i)
  })

  it('PROHÍBE pedirle al jugador datos que la app ya tiene', () => {
    expect(ANTI_HALLUCINATION).toMatch(/NUNCA le pidas al jugador datos/i)
    // La frase tóxica de la versión vieja ya no debe estar como instrucción.
    expect(ANTI_HALLUCINATION).not.toContain('¿los tenés a mano?')
  })

  it('PROHÍBE culpar al sistema como excusa', () => {
    expect(ANTI_HALLUCINATION).toMatch(/NUNCA uses como excusa/i)
    // Ya no debe ordenar decir esta frase.
    expect(ANTI_HALLUCINATION).not.toContain('Algo no quedó bien guardado del lado del sistema, perdón')
  })

  it('sigue prohibiendo inventar y contradecirse', () => {
    expect(ANTI_HALLUCINATION).toMatch(/NUNCA inventes/i)
    expect(ANTI_HALLUCINATION).toMatch(/contradigas/i)
  })

  it('permite admitir un faltante REAL sin dramatizar ni culpar al jugador', () => {
    expect(ANTI_HALLUCINATION).toMatch(/GENUINAMENTE no existe/i)
    expect(ANTI_HALLUCINATION).toMatch(/sin culpar al jugador/i)
  })

  it('distingue ÍNDICE de HANDICAP DE JUEGO y prohíbe inventarlo (captura #1)', () => {
    expect(ANTI_HALLUCINATION).toMatch(/ÍNDICE vs HANDICAP DE JUEGO/i)
    expect(ANTI_HALLUCINATION).toContain('get_playing_handicap')
    // No debe deducir el handicap de juego "a ojo" del índice.
    expect(ANTI_HALLUCINATION).toMatch(/nunca inventes un handicap de juego|NI un handicap de juego/i)
  })

  it('mantiene el ancla "MANEJO DE DATOS" del snapshot', () => {
    expect(ANTI_HALLUCINATION).toContain('MANEJO DE DATOS')
  })
})
