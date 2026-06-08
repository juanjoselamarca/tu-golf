import { describe, it, expect } from 'vitest'
import { resolveRatings, type TeeRow } from './tee-resolver'

// Columnas reales de course_tees (verificadas contra prod 2026-06-06):
// nombre (color), genero ('M'|'F'), rating/slope (18h), front_*/back_* (9h).
const tees: TeeRow[] = [
  { nombre: 'blanco', genero: 'M', rating: 71.6, slope: 129, front_course_rating: 35.8, front_slope_rating: 128, back_course_rating: 35.8, back_slope_rating: 130 },
  { nombre: 'azul', genero: 'M', rating: 73.3, slope: 136, front_course_rating: 36.6, front_slope_rating: 132, back_course_rating: 36.7, back_slope_rating: 140 },
  { nombre: 'rojo', genero: 'F', rating: 72.6, slope: 123, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
]

describe('tee-resolver — resolveRatings', () => {
  it('18h usa rating/slope (18h) del color', () => {
    expect(resolveRatings(tees, 'blanco', 18)).toEqual({ cr: 71.6, slope: 129, nineHoleRatings: null })
  })

  it('9h usa el front rating real cuando existe', () => {
    expect(resolveRatings(tees, 'blanco', 9)).toEqual({
      cr: 71.6, slope: 129, nineHoleRatings: { cr9h: 35.8, slope9h: 128 },
    })
  })

  it('9h sin front/back rating → nineHoleRatings null (canónica cae a cr/2 documentado)', () => {
    expect(resolveRatings(tees, 'rojo', 9, 'F')).toEqual({ cr: 72.6, slope: 123, nineHoleRatings: null })
  })

  it('9h sin front pero con back → deriva front = 18h − back', () => {
    const soloBack: TeeRow[] = [
      { nombre: 'verde', genero: 'M', rating: 72.0, slope: 130, front_course_rating: null, front_slope_rating: null, back_course_rating: 36.0, back_slope_rating: 132 },
    ]
    expect(resolveRatings(soloBack, 'verde', 9)).toEqual({
      cr: 72.0, slope: 130, nineHoleRatings: { cr9h: 36.0, slope9h: 132 },
    })
  })

  it('color desconocido devuelve null (no inventa)', () => {
    expect(resolveRatings(tees, 'inexistente', 18)).toBeNull()
  })

  it('sin color devuelve null', () => {
    expect(resolveRatings(tees, null, 18)).toBeNull()
  })

  it('match es insensible a mayúsculas/acentos', () => {
    expect(resolveRatings(tees, 'BLANCO', 18)?.cr).toBe(71.6)
  })

  it('filtra por género cuando hay tees del mismo color en M y F', () => {
    const mixed: TeeRow[] = [
      { nombre: 'amarillo', genero: 'M', rating: 70, slope: 120, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
      { nombre: 'amarillo', genero: 'F', rating: 74, slope: 128, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
    ]
    expect(resolveRatings(mixed, 'amarillo', 18, 'F')?.cr).toBe(74)
    expect(resolveRatings(mixed, 'amarillo', 18, 'M')?.cr).toBe(70)
  })

  it('color compuesto multi-loop matchea por el primer token', () => {
    const multi: TeeRow[] = [
      { nombre: 'azul_andes pro_pacifico sur', genero: 'M', rating: 70.8, slope: 126, front_course_rating: 35.5, front_slope_rating: 121, back_course_rating: 35.3, back_slope_rating: 131 },
    ]
    expect(resolveRatings(multi, 'azul', 18)?.cr).toBe(70.8)
  })

  it('tee sin rating 18h devuelve null (no aporta CR/slope inventado)', () => {
    const sinRating: TeeRow[] = [
      { nombre: 'gris', genero: 'M', rating: null, slope: null, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
    ]
    expect(resolveRatings(sinRating, 'gris', 18)).toBeNull()
  })

  // Casos reales de prod: el color de la ronda (Garmin/foto) difiere del catálogo
  // en género/número o idioma. Sin esto, rondas de Juanjo daban "tee no resuelve"
  // (negro→negras, blue→azul).
  describe('matching de color tolerante (género/número + EN/ES)', () => {
    const t: TeeRow[] = [
      { nombre: 'negras', genero: 'M', rating: 75.1, slope: 142, front_course_rating: 37.8, front_slope_rating: 137, back_course_rating: null, back_slope_rating: null },
      { nombre: 'azul', genero: 'M', rating: 73.7, slope: 137, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null },
      { nombre: 'blanco', genero: 'M', rating: 71.8, slope: 130, front_course_rating: 36.2, front_slope_rating: 128, back_course_rating: null, back_slope_rating: null },
    ]
    it('"negro" matchea "negras" (género/número)', () => {
      expect(resolveRatings(t, 'negro', 18)?.cr).toBe(75.1)
    })
    it('"blue" matchea "azul" (EN→ES)', () => {
      expect(resolveRatings(t, 'blue', 18)?.cr).toBe(73.7)
    })
    it('"white" matchea "blanco"', () => {
      expect(resolveRatings(t, 'white', 18)?.cr).toBe(71.8)
    })
    it('NO colapsa colores distintos: "azul" no matchea solo-"negras"', () => {
      expect(resolveRatings([t[0]], 'azul', 18)).toBeNull()
    })

    // Plurales de colores que terminan en consonante (no se resuelven con el
    // stem genérico): azul/azules, gris/grises.
    it('"azules" matchea "azul" y viceversa', () => {
      const azules: TeeRow[] = [{ nombre: 'azules', genero: 'M', rating: 73.7, slope: 137, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null }]
      expect(resolveRatings(azules, 'azul', 18)?.cr).toBe(73.7)
      expect(resolveRatings(t, 'azules', 18)?.cr).toBe(73.7)
    })
    it('"grises" matchea "gris"', () => {
      const gris: TeeRow[] = [{ nombre: 'gris', genero: 'M', rating: 70, slope: 120, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null }]
      expect(resolveRatings(gris, 'grises', 18)?.cr).toBe(70)
    })

    // Catálogo real: nombres con sufijo de género en el nombre (no en la columna
    // genero): "amarillo - damas", "rojo - caballeros".
    it('color del catálogo con sufijo " - damas" matchea el color de la ronda', () => {
      const conSufijo: TeeRow[] = [{ nombre: 'amarillo - damas', genero: 'F', rating: 72.6, slope: 123, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null }]
      expect(resolveRatings(conSufijo, 'amarillo', 18)?.cr).toBe(72.6)
    })

    it('color en blanco/whitespace devuelve null (no matchea tees raros)', () => {
      expect(resolveRatings(t, '   ', 18)).toBeNull()
    })
  })
})
