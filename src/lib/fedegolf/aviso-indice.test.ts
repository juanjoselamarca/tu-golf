import { describe, it, expect } from 'vitest'
import { construirAvisoIndice } from './aviso-indice'

describe('construirAvisoIndice', () => {
  it('celebra cuando el índice BAJA (en golf, menos es mejor)', () => {
    const aviso = construirAvisoIndice(9.1, 9.3)
    expect(aviso).not.toBeNull()
    expect(aviso!.type).toBe('success')
    expect(aviso!.title).toBe('Bajaste tu índice a 9.1')
    expect(aviso!.message).toContain('9.3')
  })

  it('informa en tono neutro cuando SUBE — nunca lo llama mejora', () => {
    // El caso real del reporte: 9.1 (14-jul) → 9.3 (27-jul).
    const aviso = construirAvisoIndice(9.3, 9.1)
    expect(aviso).not.toBeNull()
    expect(aviso!.type).toBe('info')
    expect(aviso!.title).toBe('Tu índice subió a 9.3')
    expect(aviso!.title.toLowerCase()).not.toContain('mejor')
    expect(aviso!.message).toContain('9.1')
  })

  it('no avisa si el cambio no se ve en la precisión que mostramos (1 decimal)', () => {
    // 9.34 y 9.33 son distintos como número pero los dos se muestran "9.3":
    // un toast que dice "pasaste de 9.3 a 9.3" es ruido que hace dudar del dato.
    expect(construirAvisoIndice(9.34, 9.33)).toBeNull()
  })

  it('sin índice nuevo no inventa nada', () => {
    expect(construirAvisoIndice(null, 9.3)).toBeNull()
    expect(construirAvisoIndice(undefined, 9.3)).toBeNull()
  })

  it('sin referencia anterior informa el valor sin narrar un delta falso', () => {
    const aviso = construirAvisoIndice(9.3, null)
    expect(aviso).not.toBeNull()
    expect(aviso!.title).toBe('Tu índice es 9.3')
    expect(aviso!.message).not.toContain('Venías')
  })

  it('índice 0 y plus (negativo) son valores legítimos, no ausencia de dato', () => {
    expect(construirAvisoIndice(0, 0.4)?.type).toBe('success')
    expect(construirAvisoIndice(-1.2, 0)?.title).toBe('Bajaste tu índice a -1.2')
  })

  it('copy en español chileno (tú), sin voseo', () => {
    const avisos = [construirAvisoIndice(9.1, 9.3)!, construirAvisoIndice(9.3, 9.1)!]
    for (const a of avisos) {
      const texto = `${a.title} ${a.message}`
      expect(texto).not.toMatch(/bajaste vos|podés|tenés|venís/i)
      expect(texto).toContain('FedeGolf')
    }
  })
})
