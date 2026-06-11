import { describe, it, expect } from 'vitest'
import { applyTeeCorrections, redirectCourse, repointRounds, deleteRounds, countRoundsForCourse } from '../course-dedup'
import type { TeeUpsert } from '@/golf/courses/course-dedup'

type Row = Record<string, any>

/**
 * Stub de supabase con tablas en memoria. Soporta la cadena usada por la capa:
 * select(cols, {count,head})/eq/is/in/ilike/maybeSingle, update().eq(), insert(), delete().in().select().
 */
function makeStub(tables: Record<string, Row[]>) {
  const db: Record<string, Row[]> = {}
  for (const [k, v] of Object.entries(tables)) db[k] = v.map(r => ({ ...r }))
  let idSeq = 1000
  const sb: any = {
    from(table: string) {
      const rows = db[table] ?? (db[table] = [])
      const state = {
        filters: [] as ((r: Row) => boolean)[],
        mode: null as null | 'select' | 'update' | 'delete',
        payload: null as any,
        count: false as boolean,
      }
      const apply = () => rows.filter(r => state.filters.every(f => f(r)))
      const builder: any = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          // select() tras update()/delete() es "return representation", no cambia el modo.
          if (state.mode === null) state.mode = 'select'
          if (opts?.count) state.count = true
          if (opts?.head) {
            // head:true → no data, solo count, resuelve al await.
            builder.then = (resolve: any) => Promise.resolve({ count: apply().length, data: null, error: null }).then(resolve)
          }
          return builder
        },
        update(p: any) { state.mode = 'update'; state.payload = p; return builder },
        delete() { state.mode = 'delete'; return builder },
        insert(p: any) {
          const arr = Array.isArray(p) ? p : [p]
          const inserted = arr.map(x => { const row = { id: 'new-' + (idSeq++), ...x }; rows.push(row); return row })
          return Promise.resolve({ error: null, data: inserted })
        },
        eq(col: string, val: any) { state.filters.push((r: Row) => r[col] === val); return builder },
        is(col: string, val: any) { state.filters.push((r: Row) => r[col] === val); return builder },
        in(col: string, vals: any[]) { state.filters.push((r: Row) => vals.includes(r[col])); return builder },
        ilike(col: string, val: string) { state.filters.push((r: Row) => String(r[col]).toLowerCase() === String(val).toLowerCase()); return builder },
        maybeSingle() {
          const hit = apply()[0] ?? null
          return Promise.resolve({ data: hit ? { id: hit.id } : null, error: null })
        },
        then(resolve: any) {
          if (state.mode === 'update') {
            for (const r of apply()) Object.assign(r, state.payload)
            return Promise.resolve({ error: null }).then(resolve)
          }
          if (state.mode === 'delete') {
            const toRemove = apply()
            const removed = toRemove.map(r => ({ id: r.id }))
            db[table] = rows.filter(r => !toRemove.includes(r))
            return Promise.resolve({ data: removed, error: null }).then(resolve)
          }
          if (state.mode === 'select' && state.count) {
            return Promise.resolve({ count: apply().length, data: apply(), error: null }).then(resolve)
          }
          return Promise.resolve({ data: apply(), error: null }).then(resolve)
        },
      }
      return builder
    },
  }
  return { sb, db }
}

function up(partial: Partial<TeeUpsert> & Pick<TeeUpsert, 'nombre' | 'action'>): TeeUpsert {
  return {
    manualNombre: null, genero: 'M', rating: 73.3, slope: 136,
    front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null,
    ...partial,
  }
}

const azulRow: Row = { id: 't1', course_id: 'course-x', nombre: 'azul', genero: 'M', rating: 73.7, slope: 137, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null }

describe('applyTeeCorrections', () => {
  it('UPDATE si el tee existe, INSERT si no', async () => {
    const { sb, db } = makeStub({ course_tees: [azulRow] })
    const ups: TeeUpsert[] = [
      up({ nombre: 'azul', manualNombre: 'azul', action: 'update', rating: 73.3, slope: 136 }),
      up({ nombre: 'dorado', action: 'insert', rating: 68.3, slope: 121, front_course_rating: null, front_slope_rating: null }),
    ]
    const res = await applyTeeCorrections(sb, 'course-x', ups)
    expect(res).toEqual({ updated: 1, inserted: 1 })
    expect(db.course_tees.find(r => r.nombre === 'azul')!.rating).toBe(73.3)
    const dorado = db.course_tees.find(r => r.nombre === 'dorado')!
    expect(dorado.course_id).toBe('course-x')
    expect(dorado.fuente).toBe('dedup-oficial')
    expect(dorado.rating).toBe(68.3)
  })

  it('es idempotente: correr el mismo set 2 veces no inserta duplicados', async () => {
    const { sb, db } = makeStub({ course_tees: [azulRow] })
    const ups: TeeUpsert[] = [
      up({ nombre: 'azul', manualNombre: 'azul', action: 'update' }),
      up({ nombre: 'dorado', action: 'insert', rating: 68.3, slope: 121, front_course_rating: null, front_slope_rating: null }),
    ]
    await applyTeeCorrections(sb, 'course-x', ups)
    const res2 = await applyTeeCorrections(sb, 'course-x', ups)
    expect(res2).toEqual({ updated: 2, inserted: 0 })
    expect(db.course_tees.filter(r => r.nombre === 'dorado')).toHaveLength(1)
  })

  it('matchea el tee manual capitalizado por nombre real (no inserta uno nuevo)', async () => {
    const { sb, db } = makeStub({ course_tees: [{ ...azulRow, id: 't2', nombre: 'Azul' }] })
    const ups: TeeUpsert[] = [up({ nombre: 'azul', manualNombre: 'Azul', action: 'update', rating: 73.3 })]
    const res = await applyTeeCorrections(sb, 'course-x', ups)
    expect(res).toEqual({ updated: 1, inserted: 0 })
    expect(db.course_tees).toHaveLength(1)
    expect(db.course_tees[0].rating).toBe(73.3)
  })
})

describe('redirectCourse', () => {
  it('apunta canonical_course_id y desactiva la ficha', async () => {
    const { sb, db } = makeStub({ courses: [{ id: 'fede', nombre: 'X', canonical_course_id: null, activa: true }] })
    await redirectCourse(sb, 'fede', 'manual')
    expect(db.courses[0]).toMatchObject({ canonical_course_id: 'manual', activa: false })
  })
})

describe('repointRounds', () => {
  it('mueve las rondas y devuelve el count realmente movido', async () => {
    const { sb, db } = makeStub({ historical_rounds: [
      { id: 'r1', course_id: 'fede' }, { id: 'r2', course_id: 'fede' }, { id: 'r3', course_id: 'otra' },
    ] })
    const moved = await repointRounds(sb, 'fede', 'manual')
    expect(moved).toBe(2)
    expect(db.historical_rounds.filter(r => r.course_id === 'manual')).toHaveLength(2)
    expect(db.historical_rounds.filter(r => r.course_id === 'fede')).toHaveLength(0)
  })

  it('devuelve 0 si no hay rondas que mover', async () => {
    const { sb } = makeStub({ historical_rounds: [{ id: 'r1', course_id: 'otra' }] })
    expect(await repointRounds(sb, 'fede', 'manual')).toBe(0)
  })
})

describe('deleteRounds', () => {
  it('borra por id y devuelve el count', async () => {
    const { sb, db } = makeStub({ historical_rounds: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })
    const n = await deleteRounds(sb, ['b', 'c'])
    expect(n).toBe(2)
    expect(db.historical_rounds.map(r => r.id)).toEqual(['a'])
  })

  it('no hace nada con lista vacía', async () => {
    const { sb, db } = makeStub({ historical_rounds: [{ id: 'a' }] })
    expect(await deleteRounds(sb, [])).toBe(0)
    expect(db.historical_rounds).toHaveLength(1)
  })
})

describe('countRoundsForCourse', () => {
  it('cuenta las rondas de una ficha', async () => {
    const { sb } = makeStub({ historical_rounds: [
      { id: 'r1', course_id: 'fede' }, { id: 'r2', course_id: 'fede' }, { id: 'r3', course_id: 'otra' },
    ] })
    expect(await countRoundsForCourse(sb, 'fede')).toBe(2)
    expect(await countRoundsForCourse(sb, 'nada')).toBe(0)
  })
})
