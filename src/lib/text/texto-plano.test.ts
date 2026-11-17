import { describe, it, expect } from 'vitest'
import { textoPlano } from './texto-plano'

const SIN_TOPE = 1000

describe('textoPlano — una regla por caso', () => {
  it('quita encabezados', () => {
    expect(textoPlano('## Foco de la semana', SIN_TOPE)).toBe('Foco de la semana')
  })

  it('quita negrita, cursiva y asteriscos huérfanos', () => {
    expect(textoPlano('**Respira** antes del *putt*', SIN_TOPE)).toBe('Respira antes del putt')
    expect(textoPlano('Cierra el **swing', SIN_TOPE)).toBe('Cierra el swing')
  })

  it('quita backticks', () => {
    expect(textoPlano('Usa `reset_4_pasos` tras el bogey', SIN_TOPE)).toBe('Usa reset_4_pasos tras el bogey')
  })

  it('no toca _ dentro de una palabra, sí el _énfasis_', () => {
    expect(textoPlano('reset_4_pasos y next_shot_mentality', SIN_TOPE)).toBe('reset_4_pasos y next_shot_mentality')
    expect(textoPlano('_calma_ y __ritmo__', SIN_TOPE)).toBe('calma y ritmo')
  })

  it('quita citas y viñetas', () => {
    expect(textoPlano('> Ojo con el hoyo 1\n- Rutina\n* Respira\n1. Apunta', SIN_TOPE)).toBe('Ojo con el hoyo 1 Rutina Respira Apunta')
  })

  it('quita las tablas (pipes y separadores)', () => {
    expect(textoPlano('| Hoyo | Score |\n|---|:---:|\n| 1 | 5 |', SIN_TOPE)).toBe('Hoyo Score 1 5')
  })

  it('links: deja el texto', () => {
    expect(textoPlano('Mira [tu tarjeta](/perfil/historial/1)', SIN_TOPE)).toBe('Mira tu tarjeta')
  })

  it('colapsa saltos y espacios', () => {
    expect(textoPlano('Uno\n\n\nDos   tres', SIN_TOPE)).toBe('Uno Dos tres')
  })

  it('corta en palabra con "…" sin pasar el máximo', () => {
    const t = textoPlano('Después de cada bogey aplica la rutina completa antes de pegar', 30)
    expect(t).toBe('Después de cada bogey aplica…')
    expect(t.length).toBeLessThanOrEqual(30)
  })

  it('no corta si cabe; vacío y null → ""', () => {
    expect(textoPlano('Corto', 90)).toBe('Corto')
    expect(textoPlano(null, 90)).toBe('')
    expect(textoPlano('', 90)).toBe('')
  })

  it('una palabra más larga que el máximo se corta igual', () => {
    expect(textoPlano('a'.repeat(20), 10)).toBe('a'.repeat(9) + '…')
  })
})
