import { describe, it, expect } from 'vitest'
import { planTeeCorrections, findDuplicateRounds, buildIndexWindows, type IndexRound } from '../course-dedup'
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

  it('una sola corrección por color: oficial con rojo/M y rojo/F → un solo rojo (restricción UNIQUE course_id,nombre)', () => {
    // La fedegolf VARONES etiqueta rojo como M y DAMAS como F; la ficha sólo
    // puede tener UN tee por nombre. La manual tiene rojo/F → se actualiza ESE.
    const off: TeeRow[] = [
      { nombre: 'rojo', genero: 'M', rating: 74.8, slope: 131, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
      { nombre: 'rojo', genero: 'F', rating: 74.8, slope: 131, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
    ]
    const ups = planTeeCorrections(manual, off)
    const rojos = ups.filter(u => u.nombre === 'rojo')
    expect(rojos).toHaveLength(1)              // UN solo rojo, no dos
    expect(rojos[0].action).toBe('update')
    expect(rojos[0].genero).toBe('F')          // preserva el género de la manual
    expect(rojos[0].manualNombre).toBe('rojo')
    expect(rojos[0].front_course_rating).toBe(37.7) // oficial null → conserva manual
  })

  it('manual vacía + oficial con color dual → inserta UN solo tee por color', () => {
    const off: TeeRow[] = [
      { nombre: 'azul', genero: 'M', rating: 71.8, slope: 128, front_course_rating: 36.0, front_slope_rating: 117, back_course_rating: null, back_slope_rating: null },
      { nombre: 'rojo', genero: 'M', rating: 72.6, slope: 130, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
      { nombre: 'rojo', genero: 'F', rating: 72.6, slope: 130, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
    ]
    const ups = planTeeCorrections([], off)
    expect(ups.filter(u => u.nombre === 'rojo')).toHaveLength(1) // un solo rojo
    expect(ups.filter(u => u.nombre === 'azul')).toHaveLength(1)
    expect(ups.every(u => u.action === 'insert')).toBe(true)
    // nombres únicos (no viola UNIQUE course_id,nombre)
    expect(new Set(ups.map(u => u.nombre)).size).toBe(ups.length)
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

describe('findDuplicateRounds', () => {
  it('marca para borrar las copias, conserva la más antigua', () => {
    const rounds = [
      { id: 'a', user_id: 'u1', played_at: '2026-05-03', holes_played: 18, total_gross: 96, course_id: 'c1', created_at: '2026-05-03T10:00:00Z' },
      { id: 'b', user_id: 'u1', played_at: '2026-05-03', holes_played: 18, total_gross: 96, course_id: 'c1', created_at: '2026-05-04T10:00:00Z' },
      { id: 'c', user_id: 'u1', played_at: '2026-05-02', holes_played: 18, total_gross: 90, course_id: 'c1', created_at: '2026-05-02T10:00:00Z' },
    ]
    expect(findDuplicateRounds(rounds)).toEqual(['b']) // 'a' es más antigua → se conserva
  })

  it('no marca nada si no hay duplicados', () => {
    const rounds = [
      { id: 'a', user_id: 'u1', played_at: '2026-05-03', holes_played: 18, total_gross: 96, course_id: 'c1', created_at: '2026-05-03T10:00:00Z' },
      { id: 'b', user_id: 'u1', played_at: '2026-05-03', holes_played: 9,  total_gross: 96, course_id: 'c1', created_at: '2026-05-04T10:00:00Z' },
    ]
    expect(findDuplicateRounds(rounds)).toEqual([])
  })

  it('agrupa por usuario, fecha, hoyos, score y cancha (no mezcla usuarios)', () => {
    const rounds = [
      { id: 'a', user_id: 'u1', played_at: '2026-05-03', holes_played: 18, total_gross: 96, course_id: 'c1', created_at: '2026-05-03T10:00:00Z' },
      { id: 'b', user_id: 'u2', played_at: '2026-05-03', holes_played: 18, total_gross: 96, course_id: 'c1', created_at: '2026-05-04T10:00:00Z' },
    ]
    expect(findDuplicateRounds(rounds)).toEqual([]) // distinto usuario → no son duplicados
  })

  it('borra todas las copias menos una cuando hay 3 idénticas', () => {
    const base = { user_id: 'u1', played_at: '2026-05-03', holes_played: 18, total_gross: 96, course_id: 'c1' }
    const rounds = [
      { id: 'a', ...base, created_at: '2026-05-03T12:00:00Z' },
      { id: 'b', ...base, created_at: '2026-05-03T10:00:00Z' }, // la más antigua
      { id: 'c', ...base, created_at: '2026-05-03T11:00:00Z' },
    ]
    expect(findDuplicateRounds(rounds).sort()).toEqual(['a', 'c']) // conserva 'b'
  })
})

describe('buildIndexWindows', () => {
  const r = (id: string, played_at: string, diferencial: number | null, excluded = false): IndexRound =>
    ({ id, played_at, diferencial, course_rating: 72, slope_rating: 130, excluded_from_handicap: excluded })

  it('sin correcciones, antes y despues son iguales', () => {
    const rounds = [r('a', '2026-05-01', 10), r('b', '2026-05-02', 12), r('c', '2026-05-03', 8)]
    const w = buildIndexWindows(rounds, new Map())
    expect(w.antes).toEqual(w.despues)
    expect(w.antes.sort((x, y) => x - y)).toEqual([8, 10, 12])
  })

  it('sustituye el diferencial de las rondas del cluster en "despues"', () => {
    const rounds = [r('a', '2026-05-01', 10), r('b', '2026-05-02', 12)]
    const w = buildIndexWindows(rounds, new Map([['a', 6]]))
    expect(w.antes.sort((x, y) => x - y)).toEqual([10, 12])
    expect(w.despues.sort((x, y) => x - y)).toEqual([6, 12]) // 'a' corregida a 6
  })

  it('filtra rondas excluidas y con diferencial null', () => {
    const rounds = [r('a', '2026-05-01', 10), r('b', '2026-05-02', null), r('c', '2026-05-03', 8, true)]
    const w = buildIndexWindows(rounds, new Map())
    expect(w.antes).toEqual([10]) // b (null) y c (excluida) fuera
  })

  it('una corrección a null saca la ronda del set "despues" (guard implausibilidad)', () => {
    const rounds = [r('a', '2026-05-01', 10), r('b', '2026-05-02', 12)]
    const w = buildIndexWindows(rounds, new Map([['a', null]]))
    expect(w.antes.sort((x, y) => x - y)).toEqual([10, 12])
    expect(w.despues).toEqual([12]) // 'a' corregida a null → fuera
  })

  it('toma solo las últimas 20 por played_at DESC', () => {
    const rounds: IndexRound[] = []
    for (let i = 0; i < 25; i++) {
      const day = String(i + 1).padStart(2, '0')
      rounds.push(r(`r${i}`, `2026-05-${day}`, i)) // diferencial = i, fecha creciente
    }
    const w = buildIndexWindows(rounds, new Map())
    expect(w.antes).toHaveLength(20)
    // últimas 20 por fecha = diferenciales 5..24; las 5 más viejas (0..4) quedan fuera
    expect(Math.min(...w.antes)).toBe(5)
    expect(Math.max(...w.antes)).toBe(24)
  })
})
