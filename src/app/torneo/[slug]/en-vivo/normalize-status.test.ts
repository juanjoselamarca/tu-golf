import { describe, it, expect } from 'vitest'
import { normalizeStatus } from './normalize-status'

describe('normalizeStatus (vista en-vivo)', () => {
  it('preserva los estados de vista directos', () => {
    expect(normalizeStatus('draft')).toBe('draft')
    expect(normalizeStatus('open')).toBe('open')
    expect(normalizeStatus('in_progress')).toBe('in_progress')
    expect(normalizeStatus('closed')).toBe('closed')
  })

  it('NO MIENTE: open (inscripciones) nunca es in_progress ("en vivo")', () => {
    // Regresión del bug: un torneo abierto/no arrancado salía "EN VIVO / En curso".
    expect(normalizeStatus('open')).not.toBe('in_progress')
    expect(normalizeStatus('open')).toBe('open')
  })

  it('published/finished (finalizado) nunca es draft ("borrador")', () => {
    // Regresión: un torneo publicado caía al fallback y mostraba "Borrador".
    expect(normalizeStatus('published')).toBe('closed')
    expect(normalizeStatus('finished')).toBe('closed')
  })

  it('active es sinónimo histórico de in_progress', () => {
    expect(normalizeStatus('active')).toBe('in_progress')
  })

  it('desconocido/nulo cae a draft sin afirmar nada falso', () => {
    for (const v of ['pending', 'approved', '', null, undefined, 42, {}]) {
      expect(normalizeStatus(v as unknown)).toBe('draft')
    }
  })
})
