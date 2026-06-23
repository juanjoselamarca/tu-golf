import { describe, it, expect } from 'vitest'
import { buildCoachSystem, buildCoachTools } from '../build-system'
import { TAIGER_TOOLS } from '../tools'
import { TAIGER_SESSION_STARTER } from '../prompts'
import { CONOCER_SECTION, ENGAGEMENT_SECTION, RAG_SECTION } from '../v3/prompts'
import { ONBOARDING_SECTION } from '../v3/onboarding'

const CTX = 'Índice del jugador (WHS): 10\nRondas registradas: 3'

describe('buildCoachSystem', () => {
  it('v2 (flag off): reemplaza el contexto, incluye session starter, NO incluye secciones v3', () => {
    const s = buildCoachSystem({ contextString: CTX, cerebroV3Enabled: false, onboarded: true })
    expect(s).not.toContain('{PLAYER_CONTEXT}')
    expect(s).toContain(CTX)
    expect(s).toContain(TAIGER_SESSION_STARTER)
    expect(s).not.toContain(ENGAGEMENT_SECTION)
    expect(s).not.toContain(CONOCER_SECTION)
    expect(s).not.toContain(RAG_SECTION)
  })

  it('v3 (flag on): appendea ENGAGEMENT → CONOCER → RAG en orden', () => {
    const s = buildCoachSystem({ contextString: CTX, cerebroV3Enabled: true, onboarded: true })
    expect(s).toContain(ENGAGEMENT_SECTION)
    expect(s).toContain(CONOCER_SECTION)
    expect(s).toContain(RAG_SECTION)
    // Orden exacto: ENGAGEMENT antes que CONOCER antes que RAG.
    expect(s.indexOf(ENGAGEMENT_SECTION)).toBeLessThan(s.indexOf(CONOCER_SECTION))
    expect(s.indexOf(CONOCER_SECTION)).toBeLessThan(s.indexOf(RAG_SECTION))
  })

  it('v3 + NO onboarded: incluye ONBOARDING_SECTION entre CONOCER y RAG', () => {
    const s = buildCoachSystem({ contextString: CTX, cerebroV3Enabled: true, onboarded: false })
    expect(s).toContain(ONBOARDING_SECTION)
    expect(s.indexOf(CONOCER_SECTION)).toBeLessThan(s.indexOf(ONBOARDING_SECTION))
    expect(s.indexOf(ONBOARDING_SECTION)).toBeLessThan(s.indexOf(RAG_SECTION))
  })

  it('v3 + onboarded: NO incluye ONBOARDING_SECTION', () => {
    const s = buildCoachSystem({ contextString: CTX, cerebroV3Enabled: true, onboarded: true })
    expect(s).not.toContain(ONBOARDING_SECTION)
  })

  it('onboarded solo aplica con el flag ON (v2 nunca lo incluye)', () => {
    const s = buildCoachSystem({ contextString: CTX, cerebroV3Enabled: false, onboarded: false })
    expect(s).not.toContain(ONBOARDING_SECTION)
  })
})

describe('buildCoachTools', () => {
  it('v2: expone solo TAIGER_TOOLS', () => {
    const t = buildCoachTools({ cerebroV3Enabled: false })
    expect(t).toHaveLength(TAIGER_TOOLS.length)
  })

  it('v3: suma las tools extra (search_knowledge + focus + field_context)', () => {
    const t = buildCoachTools({ cerebroV3Enabled: true })
    expect(t.length).toBeGreaterThan(TAIGER_TOOLS.length)
    const names = t.map((x) => (x as { name: string }).name)
    expect(names).toContain('search_knowledge_chunks')
    expect(names).toContain('get_focus')
    expect(names).toContain('field_context')
  })
})
