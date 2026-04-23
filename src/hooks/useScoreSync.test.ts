/**
 * Tests para src/hooks/useScoreSync.ts — hook crítico de offline sync.
 *
 * Este hook persiste scores en localStorage ANTES de enviar al servidor.
 * Si el servidor falla durante un torneo (sin señal en cancha), el score
 * NO se pierde. Es la primera defensa contra pérdida de data en campo.
 *
 * Cobertura previa: 0%. Meta: ≥85%.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScoreSync } from './useScoreSync'

// jsdom tiene localStorage, pero limpiamos entre tests
beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('useScoreSync', () => {
  const CODIGO = 'ABC123'
  const JUGADOR = 'user-xyz'
  const KEY = `golfers_score_${CODIGO}_${JUGADOR}`

  describe('guardarLocal', () => {
    it('persiste scores en localStorage con sincronizado=false', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      act(() => { result.current.guardarLocal({ 1: 4, 2: 5, 3: 3 }) })
      const raw = localStorage.getItem(KEY)
      expect(raw).not.toBeNull()
      const data = JSON.parse(raw!)
      expect(data.scores).toEqual({ 1: 4, 2: 5, 3: 3 })
      expect(data.sincronizado).toBe(false)
      expect(data.codigoRonda).toBe(CODIGO)
      expect(data.jugadorId).toBe(JUGADOR)
      expect(typeof data.timestamp).toBe('number')
    })

    it('jugadorId null → no persiste nada', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, null))
      act(() => { result.current.guardarLocal({ 1: 4 }) })
      expect(localStorage.length).toBe(0)
    })

    it('sobrescribe entrada previa del mismo jugador', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      act(() => { result.current.guardarLocal({ 1: 4 }) })
      act(() => { result.current.guardarLocal({ 1: 4, 2: 5 }) })
      const data = JSON.parse(localStorage.getItem(KEY)!)
      expect(data.scores).toEqual({ 1: 4, 2: 5 })
    })
  })

  describe('obtenerLocal', () => {
    it('devuelve null si no hay entrada', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      expect(result.current.obtenerLocal()).toBeNull()
    })

    it('devuelve scores persistidos', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      act(() => { result.current.guardarLocal({ 1: 4, 2: 5 }) })
      expect(result.current.obtenerLocal()).toEqual({ 1: 4, 2: 5 })
    })

    it('jugadorId null → devuelve null sin tocar storage', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, null))
      expect(result.current.obtenerLocal()).toBeNull()
    })

    it('JSON corrupto en storage → devuelve null sin crashear', () => {
      localStorage.setItem(KEY, '{malformed-json')
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      expect(result.current.obtenerLocal()).toBeNull()
    })
  })

  describe('marcarSincronizado', () => {
    it('marca la entrada como sincronizada=true', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      act(() => { result.current.guardarLocal({ 1: 4 }) })
      act(() => { result.current.marcarSincronizado() })
      const data = JSON.parse(localStorage.getItem(KEY)!)
      expect(data.sincronizado).toBe(true)
    })

    it('sin entrada previa → no crashea', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      expect(() => { result.current.marcarSincronizado() }).not.toThrow()
    })
  })

  describe('tienePendientes', () => {
    it('true si hay scores sin sincronizar', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      act(() => { result.current.guardarLocal({ 1: 4 }) })
      expect(result.current.tienePendientes()).toBe(true)
    })

    it('false después de marcarSincronizado', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      act(() => { result.current.guardarLocal({ 1: 4 }) })
      act(() => { result.current.marcarSincronizado() })
      expect(result.current.tienePendientes()).toBe(false)
    })

    it('false sin entrada', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      expect(result.current.tienePendientes()).toBe(false)
    })

    it('false con scores vacío {} aunque no sincronizado', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      act(() => { result.current.guardarLocal({}) })
      expect(result.current.tienePendientes()).toBe(false)
    })

    it('jugadorId null → false', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, null))
      expect(result.current.tienePendientes()).toBe(false)
    })
  })

  describe('obtenerTimestamp', () => {
    it('devuelve el timestamp de la última guardarLocal', () => {
      const before = Date.now()
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      act(() => { result.current.guardarLocal({ 1: 4 }) })
      const ts = result.current.obtenerTimestamp()
      expect(ts).toBeGreaterThanOrEqual(before)
      expect(ts).toBeLessThanOrEqual(Date.now())
    })

    it('sin entrada → devuelve 0', () => {
      const { result } = renderHook(() => useScoreSync(CODIGO, JUGADOR))
      expect(result.current.obtenerTimestamp()).toBe(0)
    })
  })

  describe('limpieza de entradas antiguas al montar', () => {
    it('elimina entradas sincronizadas con más de 7 días', () => {
      const OLD_KEY = `golfers_score_VIEJA_jug1`
      const ocho_dias_ms = 8 * 24 * 60 * 60 * 1000
      localStorage.setItem(OLD_KEY, JSON.stringify({
        scores: { 1: 4 },
        timestamp: Date.now() - ocho_dias_ms,
        sincronizado: true,
        codigoRonda: 'VIEJA',
        jugadorId: 'jug1',
      }))
      renderHook(() => useScoreSync(CODIGO, JUGADOR))
      expect(localStorage.getItem(OLD_KEY)).toBeNull()
    })

    it('NO elimina entradas pendientes aunque sean viejas', () => {
      const OLD_KEY = `golfers_score_VIEJA_jug1`
      const ocho_dias_ms = 8 * 24 * 60 * 60 * 1000
      localStorage.setItem(OLD_KEY, JSON.stringify({
        scores: { 1: 4 },
        timestamp: Date.now() - ocho_dias_ms,
        sincronizado: false, // importante: NO sincronizado
        codigoRonda: 'VIEJA',
        jugadorId: 'jug1',
      }))
      renderHook(() => useScoreSync(CODIGO, JUGADOR))
      expect(localStorage.getItem(OLD_KEY)).not.toBeNull()
    })

    it('NO elimina entradas sincronizadas recientes (<7 días)', () => {
      const RECENT_KEY = `golfers_score_RECIENTE_jug2`
      const tres_dias_ms = 3 * 24 * 60 * 60 * 1000
      localStorage.setItem(RECENT_KEY, JSON.stringify({
        scores: { 1: 4 },
        timestamp: Date.now() - tres_dias_ms,
        sincronizado: true,
        codigoRonda: 'RECIENTE',
        jugadorId: 'jug2',
      }))
      renderHook(() => useScoreSync(CODIGO, JUGADOR))
      expect(localStorage.getItem(RECENT_KEY)).not.toBeNull()
    })

    it('ignora claves fuera del prefix golfers_score_', () => {
      localStorage.setItem('otro_key', 'valor-ajeno')
      renderHook(() => useScoreSync(CODIGO, JUGADOR))
      expect(localStorage.getItem('otro_key')).toBe('valor-ajeno')
    })

    it('entrada con JSON corrupto no crashea la limpieza', () => {
      localStorage.setItem('golfers_score_broken', '{malformed')
      localStorage.setItem('otro_key', 'safe')
      expect(() => renderHook(() => useScoreSync(CODIGO, JUGADOR))).not.toThrow()
    })
  })

  describe('syncInProgressRef', () => {
    it('ref persiste entre re-renders', () => {
      const { result, rerender } = renderHook(
        ({ codigo }: { codigo: string }) => useScoreSync(codigo, JUGADOR),
        { initialProps: { codigo: CODIGO } }
      )
      const ref1 = result.current.syncInProgressRef
      ref1.current = true
      rerender({ codigo: CODIGO })
      expect(result.current.syncInProgressRef.current).toBe(true)
      expect(result.current.syncInProgressRef).toBe(ref1)
    })
  })
})
