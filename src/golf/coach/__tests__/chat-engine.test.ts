import { describe, it, expect } from 'vitest'
import { runChatStream } from '../chat-engine'

// PR1 (refactor puro): el seguro real es el smoke byte-idéntico del coach.
// Este unit solo asegura que la firma pública existe tras la extracción.
describe('chat-engine (refactor puro)', () => {
  it('exporta runChatStream como función', () => {
    expect(typeof runChatStream).toBe('function')
  })
})
