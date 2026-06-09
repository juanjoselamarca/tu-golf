import { describe, it, expect } from 'vitest'
import { getTeePromptStatus } from './tee-prompt'

/**
 * Red de seguridad del tee por defecto: el banner solo aparece si el jugador
 * NO fijó su tee y tiene rondas recuperables (sin tee pero con course_id).
 */
function mockSupabase(opts: { defaultTee?: string | null; teelessCount?: number; genero?: 'M' | 'F' | null }) {
  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { default_tee_color: opts.defaultTee ?? null, genero: opts.genero ?? null } }) }) }),
        }
      }
      // historical_rounds: select('id',{head,count}).eq().is().not() → await → { count }
      // chain thenable: cada método encadena y el await resuelve a { count }.
      const result = { count: opts.teelessCount ?? 0 }
      const chain: Record<string, unknown> = {
        eq: () => chain,
        is: () => chain,
        not: () => chain,
        then: (resolve: (v: typeof result) => unknown) => resolve(result),
      }
      return { select: () => chain }
    },
  } as never
}

describe('getTeePromptStatus', () => {
  it('show=true: sin tee fijado + rondas recuperables', async () => {
    const s = await getTeePromptStatus(mockSupabase({ defaultTee: null, teelessCount: 125 }), 'u1')
    expect(s.show).toBe(true)
    expect(s.recoverableRounds).toBe(125)
  })

  it('devuelve el género del perfil si existe (para pre-seleccionarlo en el banner)', async () => {
    const s = await getTeePromptStatus(mockSupabase({ defaultTee: null, teelessCount: 10, genero: 'M' }), 'u1')
    expect(s.genero).toBe('M')
  })

  it('género null si el perfil no lo tiene (el banner lo pedirá)', async () => {
    const s = await getTeePromptStatus(mockSupabase({ defaultTee: null, teelessCount: 10 }), 'u1')
    expect(s.genero).toBeNull()
  })

  it('show=false: ya fijó su tee (no se vuelve a preguntar)', async () => {
    const s = await getTeePromptStatus(mockSupabase({ defaultTee: 'azul', teelessCount: 125 }), 'u1')
    expect(s.show).toBe(false)
  })

  it('show=false: sin tee fijado pero 0 rondas recuperables', async () => {
    const s = await getTeePromptStatus(mockSupabase({ defaultTee: null, teelessCount: 0 }), 'u1')
    expect(s.show).toBe(false)
    expect(s.recoverableRounds).toBe(0)
  })
})
