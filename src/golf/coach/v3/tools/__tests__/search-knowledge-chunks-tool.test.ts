import { describe, it, expect } from 'vitest';
import { SEARCH_KNOWLEDGE_TOOL } from '../search-knowledge-chunks-tool';

describe('SEARCH_KNOWLEDGE_TOOL', () => {
  it('tiene el nombre y schema válido para Anthropic', () => {
    expect(SEARCH_KNOWLEDGE_TOOL.name).toBe('search_knowledge_chunks');
    expect(SEARCH_KNOWLEDGE_TOOL.input_schema.type).toBe('object');
    expect(SEARCH_KNOWLEDGE_TOOL.input_schema.required).toContain('query');
  });

  it('expone las 5 jurisdicciones soportadas en el enum', () => {
    const props = SEARCH_KNOWLEDGE_TOOL.input_schema.properties as Record<string, any>;
    const enumVals = props.jurisdictions.items.enum as string[];
    expect(enumVals).toEqual(
      expect.arrayContaining(['usga', 'ra', 'whs_global', 'usga_committee', 'fedegolf_chile']),
    );
    expect(enumVals).toHaveLength(5);
  });

  it('describe los tres dominios del corpus: reglas + estrategia + psicología (1c/1d)', () => {
    const desc = SEARCH_KNOWLEDGE_TOOL.description ?? '';
    // sigue cubriendo reglas oficiales (dominio original 1e)
    expect(desc).toMatch(/rules/i);
    expect(desc).toMatch(/FedeGolf Chile/);
    // ahora también estrategia (1c) y psicología (1d)
    expect(desc).toMatch(/strategy/i);
    expect(desc).toMatch(/psychology/i);
    // ancla al jugador, no cita genérica (regla anti-book-to-skill)
    expect(desc).toMatch(/player/i);
  });
});
