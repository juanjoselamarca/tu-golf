import { describe, it, expect } from 'vitest'
import { planTeeCorrections } from '../course-dedup'
import type { TeeRow } from '../tee-resolver'

// Datos reales Los Leones (verificados vs prod 2026-06-10).
const manual: TeeRow[] = [
  { nombre: 'azul',   genero: 'M', rating: 73.7, slope: 137, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null },
  { nombre: 'blanco', genero: 'M', rating: 71.8, slope: 130, front_course_rating: 36.2, front_slope_rating: 128, back_course_rating: null, back_slope_rating: null },
  { nombre: 'negras', genero: 'M', rating: 75.1, slope: 142, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
  { nombre: 'rojo',   genero: 'F', rating: 74.8, slope: 131, front_course_rating: 37.7, front_slope_rating: 128, back_course_rating: null, back_slope_rating: null },
]
const official: TeeRow[] = [
  { nombre: 'dorado', genero: 'M', rating: 68.3, slope: 121, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
  { nombre: 'blanco', genero: 'M', rating: 71.6, slope: 129, front_course_rating: 36.2, front_slope_rating: 128, back_course_rating: null, back_slope_rating: null },
  { nombre: 'azul',   genero: 'M', rating: 73.3, slope: 136, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null },
  { nombre: 'negras', genero: 'M', rating: 75.1, slope: 142, front_course_rating: 37.8, front_slope_rating: 137, back_course_rating: null, back_slope_rating: null },
  { nombre: 'rojo',   genero: 'F', rating: 74.8, slope: 131, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
]

describe('planTeeCorrections', () => {
  it('corrige 18h al oficial y conserva front-9 cuando el oficial no lo trae', () => {
    const ups = planTeeCorrections(manual, official)
    const azul = ups.find(u => u.nombre === 'azul' && u.genero === 'M')!
    expect(azul.action).toBe('update')
    expect(azul.rating).toBe(73.3)        // 18h al oficial
    expect(azul.slope).toBe(136)
    expect(azul.front_course_rating).toBe(37.2) // front igual (oficial trae)
    expect(azul.manualNombre).toBe('azul')      // nombre real del tee manual a actualizar

    const negras = ups.find(u => u.nombre === 'negras')!
    expect(negras.front_course_rating).toBe(37.8) // oficial AGREGA front que faltaba
    expect(negras.front_slope_rating).toBe(137)

    const rojo = ups.find(u => u.nombre === 'rojo' && u.genero === 'F')!
    expect(rojo.front_course_rating).toBe(37.7) // oficial null → CONSERVA el manual
    expect(rojo.rating).toBe(74.8)

    const dorado = ups.find(u => u.nombre === 'dorado')!
    expect(dorado.action).toBe('insert')  // no estaba en la manual
    expect(dorado.manualNombre).toBeNull()
    expect(dorado.rating).toBe(68.3)
  })

  it('no toca tees manuales que el oficial no tiene', () => {
    const extraManual: TeeRow[] = [...manual, { nombre: 'verde', genero: 'M', rating: 70, slope: 120, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null }]
    const ups = planTeeCorrections(extraManual, official)
    expect(ups.find(u => u.nombre === 'verde')).toBeUndefined()
  })

  it('matchea por color canónico aunque el nombre manual esté capitalizado o pluralizado', () => {
    const manualCap: TeeRow[] = [
      { nombre: 'Azul',   genero: 'M', rating: 73.7, slope: 137, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null },
      { nombre: 'Negro',  genero: 'M', rating: 75.1, slope: 142, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
    ]
    const off: TeeRow[] = [
      { nombre: 'azul',   genero: 'M', rating: 73.3, slope: 136, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null },
      { nombre: 'negras', genero: 'M', rating: 75.0, slope: 141, front_course_rating: 37.8, front_slope_rating: 137, back_course_rating: null, back_slope_rating: null },
    ]
    const ups = planTeeCorrections(manualCap, off)
    const azul = ups.find(u => u.nombre === 'azul')!
    expect(azul.action).toBe('update')
    expect(azul.manualNombre).toBe('Azul')      // conserva el nombre REAL del manual
    const negr = ups.find(u => u.nombre === 'negras')!
    expect(negr.action).toBe('update')
    expect(negr.manualNombre).toBe('Negro')     // 'Negro' (manual) ↔ 'negras' (oficial) = mismo color
    expect(negr.rating).toBe(75.0)
  })

  it('preserva back-9 del oficial cuando viene', () => {
    const man: TeeRow[] = [
      { nombre: 'azul', genero: 'M', rating: 72.0, slope: 130, front_course_rating: 36.0, front_slope_rating: 130, back_course_rating: null, back_slope_rating: null },
    ]
    const off: TeeRow[] = [
      { nombre: 'azul', genero: 'M', rating: 72.5, slope: 131, front_course_rating: 36.2, front_slope_rating: 130, back_course_rating: 36.3, back_slope_rating: 132 },
    ]
    const ups = planTeeCorrections(man, off)
    const azul = ups.find(u => u.nombre === 'azul')!
    expect(azul.back_course_rating).toBe(36.3)
    expect(azul.back_slope_rating).toBe(132)
  })
})
