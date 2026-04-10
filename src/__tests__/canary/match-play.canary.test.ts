import { describe, it, expect } from 'vitest'
import {
  describirMatchState,
  capitalizarNombre,
} from '@/golf/core/match-play-state'

describe('Match Play — Tests Canario', () => {
  describe('Bug 9-abr-2026: Capitalización de nombres', () => {
    it('"juan ruiz" se muestra como "Juan Ruiz"', () => {
      expect(capitalizarNombre('juan ruiz')).toBe('Juan Ruiz')
    })
    it('"JUANJO LAMARCA" se muestra como "Juanjo Lamarca"', () => {
      expect(capitalizarNombre('JUANJO LAMARCA')).toBe('Juanjo Lamarca')
    })
    it('Nombres con espacios extra se limpian', () => {
      expect(capitalizarNombre('  juan   pablo  ')).toBe('Juan Pablo')
    })
  })

  describe('Bug 9-abr-2026: Texto dormie', () => {
    it('Dormie muestra "Juan Ruiz está dormie" — no "no puede perder por strokes"', () => {
      const state = describirMatchState({
        state: 2,
        hoyoActual: 16,
        roundHoles: 18,
        nombreA: 'juan ruiz',
        nombreB: 'pedro martinez',
      })
      expect(state.isDormie).toBe(true)
      expect(state.resultText).toBe('Juan Ruiz está dormie')
      expect(state.resultText).not.toContain('no puede perder')
      expect(state.resultText).not.toContain('strokes')
    })
  })

  describe('Resultados finales', () => {
    it('3&2 — A gana 3 UP con 2 hoyos restantes', () => {
      const result = describirMatchState({
        state: 3,
        hoyoActual: 16,
        roundHoles: 18,
        nombreA: 'a',
        nombreB: 'b',
      })
      expect(result.isFinished).toBe(true)
      expect(result.resultText).toBe('3&2')
      expect(result.winnerName).toBe('A')
    })

    it('1 UP — match termina en el 18 con A arriba por 1', () => {
      const result = describirMatchState({
        state: 1,
        hoyoActual: 18,
        roundHoles: 18,
        nombreA: 'juanjo',
        nombreB: 'pedro',
      })
      expect(result.isFinished).toBe(true)
      expect(result.resultText).toBe('1 UP')
      expect(result.winnerName).toBe('Juanjo')
    })

    it('AS — match empatado al terminar', () => {
      const result = describirMatchState({
        state: 0,
        hoyoActual: 18,
        roundHoles: 18,
        nombreA: 'a',
        nombreB: 'b',
      })
      expect(result.isFinished).toBe(true)
      expect(result.isAllSquare).toBe(true)
      expect(result.resultText).toBe('AS')
      expect(result.winnerName).toBeNull()
    })
  })

  describe('En curso', () => {
    it('AS con hoyos restantes', () => {
      const result = describirMatchState({
        state: 0,
        hoyoActual: 10,
        roundHoles: 18,
        nombreA: 'a',
        nombreB: 'b',
      })
      expect(result.isFinished).toBe(false)
      expect(result.resultText).toBe('AS')
    })

    it('Liderando 2 UP con 5 restantes', () => {
      const result = describirMatchState({
        state: 2,
        hoyoActual: 13,
        roundHoles: 18,
        nombreA: 'juanjo',
        nombreB: 'pedro',
      })
      expect(result.isFinished).toBe(false)
      expect(result.isDormie).toBe(false)
      expect(result.resultText).toBe('Juanjo 2 UP')
    })
  })

  describe('Match play 9 hoyos', () => {
    it('Respeta roundHoles=9', () => {
      const result = describirMatchState({
        state: 5,
        hoyoActual: 7,
        roundHoles: 9,
        nombreA: 'a',
        nombreB: 'b',
      })
      expect(result.isFinished).toBe(true)
      expect(result.resultText).toBe('5&2')
    })
  })
})
