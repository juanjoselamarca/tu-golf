import { describe, it, expect } from 'vitest'
import { CONOCER_SECTION } from '../conocer'

describe('CONOCER_SECTION', () => {
  it('manda usar el motor de foco (get_focus) para proponer en qué concentrarse', () => {
    expect(CONOCER_SECTION).toMatch(/get_focus/)
  })

  it('exige la estructura de 6 piezas (identidad → acción)', () => {
    expect(CONOCER_SECTION).toMatch(/identidad/i)
    expect(CONOCER_SECTION).toMatch(/hecho/i)
    expect(CONOCER_SECTION).toMatch(/veredicto/i)
    expect(CONOCER_SECTION).toMatch(/target|objetivo/i)
    expect(CONOCER_SECTION).toMatch(/delta/i)
    expect(CONOCER_SECTION).toMatch(/acci[oó]n/i)
  })

  it('enmarca el foco en la meta del jugador (target + delta)', () => {
    expect(CONOCER_SECTION).toMatch(/handicap objetivo|hcp objetivo|meta/i)
  })

  it('usa recall_facts para recordar al jugador y remember_fact con criterio', () => {
    expect(CONOCER_SECTION).toMatch(/recall_facts/)
    expect(CONOCER_SECTION).toMatch(/remember_fact/)
  })

  it('toda pregunta se gana el lugar: solo pregunta si mejora el consejo', () => {
    expect(CONOCER_SECTION).toMatch(/se gana el lugar|solo si mejora|sólo si mejora/i)
    expect(CONOCER_SECTION).toMatch(/set_target/)
  })

  it('muestra avance medible con get_progress', () => {
    expect(CONOCER_SECTION).toMatch(/get_progress/)
  })

  it('fallback honesto: nunca inventa un foco si no hay datos', () => {
    expect(CONOCER_SECTION).toMatch(/fallback|honesto|no inventes|nunca inventes/i)
  })

  it('fallback igual con forma humana: identidad + veredicto + acción (P5 cold_start)', () => {
    // La rama de fallback no debe ser una respuesta pelada: mantiene la estructura.
    expect(CONOCER_SECTION).toMatch(/la honestidad no te exime/i)
    expect(CONOCER_SECTION).toMatch(/Identidad \+ veredicto \+ acci[oó]n/i)
  })

  it('al PROPONER una meta la enmarca en identidad + delta + acción (P5 target)', () => {
    expect(CONOCER_SECTION).toMatch(/Cuando PROPONGAS una meta/i)
    expect(CONOCER_SECTION).toMatch(/no la sueltes como un n[uú]mero/i)
  })

  it('traduce métricas a lenguaje claro (cero métricas opacas)', () => {
    expect(CONOCER_SECTION).toMatch(/lenguaje claro|cero métricas opacas|sin jerga|no muestres.*clave|nunca.*metric/i)
  })

  it('marca impacto/confianza/peso como señales internas (no son strokes)', () => {
    expect(CONOCER_SECTION).toMatch(/impacto/i)
    expect(CONOCER_SECTION).toMatch(/se[ñn]ales INTERNAS|interna/i)
    expect(CONOCER_SECTION).toMatch(/cantidad de golpes/i)
  })
})
