import { describe, it, expect } from 'vitest'
import { nextVote, messageKey } from './useMessageFeedback'

describe('nextVote — toggle del voto por mensaje', () => {
  it('sin voto previo + 👍 → 👍', () => {
    expect(nextVote(undefined, 1)).toBe(1)
  })

  it('sin voto previo + 👎 → 👎', () => {
    expect(nextVote(undefined, -1)).toBe(-1)
  })

  it('tocar el mismo pulgar lo retira (toggle off → 0)', () => {
    expect(nextVote(1, 1)).toBe(0)
    expect(nextVote(-1, -1)).toBe(0)
  })

  it('tocar el pulgar opuesto cambia el voto', () => {
    expect(nextVote(1, -1)).toBe(-1)
    expect(nextVote(-1, 1)).toBe(1)
  })
})

describe('messageKey — identidad estable del mensaje (resiste reslicing del backend)', () => {
  it('es determinista: mismo contenido → misma clave', () => {
    const c = 'Tu putting viene firme: 1.9 putts por hoyo. Practicá los de 1.5m.'
    expect(messageKey(c)).toBe(messageKey(c))
  })

  it('distingue contenidos distintos', () => {
    expect(messageKey('respuesta A')).not.toBe(messageKey('respuesta B'))
  })

  it('NO depende de la posición — el mismo texto vota igual en vivo y tras recargar', () => {
    // En vivo el mensaje está en el índice 2 (con opener); tras recargar, en el 1.
    // La clave depende solo del contenido, así que el voto reaparece igual.
    const reply = 'Bajá la cabeza en el approach y comprometé el swing.'
    const liveArray = ['opener', '¿cómo voy?', reply]
    const reloadedArray = ['¿cómo voy?', reply]
    expect(messageKey(liveArray[2])).toBe(messageKey(reloadedArray[1]))
  })

  it('produce una clave corta (≤64 chars, cabe en la constraint)', () => {
    const long = 'x'.repeat(5000)
    expect(messageKey(long).length).toBeLessThanOrEqual(64)
    expect(messageKey(long).length).toBeGreaterThan(0)
  })

  it('maneja unicode/acentos/emoji sin romperse', () => {
    expect(messageKey('birdie en el hoyo 7 ⛳ pará el green')).toBeTruthy()
  })
})
