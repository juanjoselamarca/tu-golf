import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TAIGER_TOOLS } from '../tools'

// Anti-decoración [[feedback_anti_decoracion_wiring]]: una pieza no está "hecha"
// si no tiene prueba de consumo en runtime. Acá verificamos que la calculadora,
// la tool, el guard y la tarjeta estén REALMENTE conectados a la arteria del chat
// y al cliente — no construidos-pero-huérfanos. Si alguien borra el wiring, CI rojo.
describe('anti-decoración: garantía aritmética conectada de punta a punta', () => {
  it('la tool compute_score_projection está registrada en TAIGER_TOOLS', () => {
    expect(TAIGER_TOOLS.some((t) => t.name === 'compute_score_projection')).toBe(true)
  })

  it('el guard está importado y usado por chat-engine', () => {
    const src = readFileSync(resolve(__dirname, '../chat-engine.ts'), 'utf8')
    expect(src).toContain('guardNumbers')
    expect(src).toContain('enforceFinalText')
    expect(src).toContain('collectAuthorizedNumbers')
  })

  it('chat-engine emite el evento SSE score_projection (alimenta la tarjeta)', () => {
    const src = readFileSync(resolve(__dirname, '../chat-engine.ts'), 'utf8')
    expect(src).toContain("event: 'score_projection'")
  })

  it('el route delega en chat-engine (handler delgado)', () => {
    const src = readFileSync(resolve(__dirname, '../../../app/api/taiger/chat/route.ts'), 'utf8')
    expect(src).toContain('runChatStream')
  })

  it('el cliente del chat consume score_projection y renderiza la tarjeta', () => {
    const src = readFileSync(resolve(__dirname, '../../../app/coach/sesion/[id]/page.tsx'), 'utf8')
    expect(src).toContain('score_projection')
    expect(src).toContain('ScoreProjectionCard')
  })

  it('el prompt aritmetica.ts manda usar la tool (no calcular en prosa)', () => {
    const src = readFileSync(resolve(__dirname, '../prompts/aritmetica.ts'), 'utf8')
    expect(src).toContain('compute_score_projection')
  })
})
