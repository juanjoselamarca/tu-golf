import { describe, it, expect } from 'vitest'
import { runChatStream, enforceFinalText } from '../chat-engine'

// PR1 (refactor puro): el seguro real es el smoke byte-idéntico del coach.
// Este unit solo asegura que la firma pública existe tras la extracción.
describe('chat-engine (refactor puro)', () => {
  it('exporta runChatStream como función', () => {
    expect(typeof runChatStream).toBe('function')
  })
})

describe('enforceFinalText (buffer + bloqueo del turno final)', () => {
  it('deja pasar prosa cuyo absoluto coincide con salida de tool', () => {
    const r = enforceFinalText('Tu objetivo es 79 (+7 sobre par).', { authorized: ['79', '+7'] })
    expect(r.blocked).toBe(false)
    expect(r.text).toContain('79')
  })

  it('bloquea un absoluto fabricado que no salió de la tool', () => {
    const r = enforceFinalText('Si seguís el plan terminás en 81.', { authorized: ['79', '+7'] })
    expect(r.blocked).toBe(true)
    // el texto bloqueado NO se entrega tal cual
    expect(r.text).not.toContain('terminás en 81')
  })

  it('relativo +7 pasa si está autorizado', () => {
    const r = enforceFinalText('Apuntá a +7 sobre par.', { authorized: ['79', '+7'] })
    expect(r.blocked).toBe(false)
  })

  it('prosa sin números de score pasa intacta', () => {
    const r = enforceFinalText('Trabajá la salida de búnker esta semana.', { authorized: [] })
    expect(r.blocked).toBe(false)
    expect(r.text).toContain('búnker')
  })
})
