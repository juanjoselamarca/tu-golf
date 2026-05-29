import { describe, it, expect } from 'vitest';
import { ENGAGEMENT_SECTION } from '../engagement';

describe('ENGAGEMENT_SECTION', () => {
  it('fija el norte: herramientas mentales para bajar el handicap', () => {
    expect(ENGAGEMENT_SECTION).toMatch(/handicap/i);
    expect(ENGAGEMENT_SECTION).toMatch(/mentales/i);
  });

  it('valora la conexión con el jugador', () => {
    expect(ENGAGEMENT_SECTION).toMatch(/CONEXIÓN/i);
  });

  it('en equipo/indumentaria se la juega con marcas y modelos personalizados', () => {
    expect(ENGAGEMENT_SECTION).toMatch(/indumentaria|equipo/i);
    expect(ENGAGEMENT_SECTION).toMatch(/marcas y modelos|marcas\/modelos|marcas/i);
    expect(ENGAGEMENT_SECTION).toMatch(/PERSONALIZADAS/i);
  });

  it('mantiene honestidad de specs (no inventar datos técnicos puntuales)', () => {
    expect(ENGAGEMENT_SECTION).toMatch(/specs/i);
    expect(ENGAGEMENT_SECTION).toMatch(/no estés seguro|confirme specs|punto de partida/i);
  });

  it('define el reencauce cuando se aleja del objetivo', () => {
    expect(ENGAGEMENT_SECTION).toMatch(/REENCAUCE/i);
  });
});
